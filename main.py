# main.py (混合式戰術 + 互動模擬 + 資料視覺化 + LINE Bot 最終整合版)

import httpx
import json
import random
import csv
from typing import Optional, List, Dict

# --- 匯入中央設定 ---
from config import (
    ALLOWED_ORIGINS, LIVE_AI_URL, LIVE_AI_MODEL, OLLAMA_API_URL, OLLAMA_MODEL,
    LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, GOOGLE_MAPS_API_KEY,
    BANNED_SAFETY_TERMS
)

# --- FastAPI 相關匯入 ---
from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# --- LINE Bot 相關匯入 (新增) ---
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, TextMessage, TextSendMessage

# --- 1. 匯入你的「Plan B 黃金答案」---
try:
    from baked_results import DEMO_ANSWERS
except ImportError:
    print("警告：baked_results.py 未找到，將只運行 Plan A (Live AI 模式)")
    DEMO_ANSWERS = {}

# --- Pydantic Models ---
class ScamRequest(BaseModel):
    text: str

class ScriptRequest(BaseModel):
    scenario: Optional[str] = "fake_investment"
    turns: int = 6

class ChatReplyRequest(BaseModel):
    scenario: Optional[str] = "fake_investment"
    persona: Optional[str] = None
    history: List[Dict[str, str]]

# --- FastAPI App ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)
handler = WebhookHandler(LINE_CHANNEL_SECRET)

# --- 儀表板資料 ---
try:
    from dashboard_data import DASHBOARD_DATA
except Exception:
    DASHBOARD_DATA = {
        "kpis": {"monthly_loss": "N/A", "monthly_cases": 0, "ai_interceptions": 0},
        "scam_types": {"labels": [], "data": []},
        "victim_ages": {"labels": [], "data": []},
        "heatmap_data": [],
    }

# --- Helper Function: 建立分類 Prompt ---
def create_classification_prompt(message: str) -> str:
    return f"""
<start_of_turn>user
你是一個頂尖的詐騙訊息分類器。你的任務是根據以下訊息，判斷其分類，並「只回傳」一個單字。

可選的分類有三種：
1. SCAM: 明顯是詐騙、釣魚或意圖不良的訊息。
2. SUSPICIOUS: 看似正常但含有潛在風險，或需要使用者提高警覺的訊息。
3. SAFE: 日常對話、正常通知或無害的訊息。

[範例]
訊息: "【飆股訓練營】老師帶你飛，三天保證獲利30%"
分類: SCAM

訊息: "媽，我換手機號碼了，先加我新的 LINE"
分類: SUSPICIOUS

訊息: "這週末要不要一起去巨城看電影？"
分類: SAFE

[你的任務]
訊息: "{message}"
分類:
<end_of_turn>
<start_of_turn>model
"""

# ==========================================
#              API Endpoints
# ==========================================

# --- 1. LINE Bot Webhook (/callback) [新增] ---
@app.post("/callback")
async def callback(request: Request, x_line_signature: str = Header(None)):
    body = await request.body()
    try:
        handler.handle(body.decode("utf-8"), x_line_signature)
    except InvalidSignatureError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    return "OK"

# --- LINE Bot 訊息處理邏輯 [新增] ---
@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    user_text = event.message.text.strip()
    print(f"--- [LINE] 收到訊息: {user_text} ---")

    reply_text = ""

    # [策略] LINE Bot 優先查 Plan B (烘焙答案)
    # 因為 Live AI 可能會跑 5-10 秒，導致 LINE 發生 timeout 錯誤
    for key, answer in DEMO_ANSWERS.items():
        if key in user_text:
            reply_text = (
                f"🚨【AI 防詐警示】\n"
                f"風險指數：{answer['risk_score']}%\n"
                f"類型：{answer['scam_type']}\n"
                f"----------------\n"
                f"🤖 AI 分析：\n{answer['analysis']}"
            )
            break
    
    # 如果 Plan B 沒命中，回傳引導訊息
    if not reply_text:
        reply_text = (
            "🔍 收到！AI 正在分析您的訊息...\n\n"
            "這則訊息不在我的「已知詐騙資料庫」中。\n\n"
            "為了進行更深度的 AI 語意分析，建議您使用我們的網頁版偵測器！\n\n"
            "👉 點此前往：https://5cb21262d4a7.ngrok-free.app/detect"
        )

    line_bot_api.reply_message(
        event.reply_token,
        TextSendMessage(text=reply_text)
    )

# --- 2. AI 分析 (/analyze) ---
@app.post("/analyze")
async def analyze_scam(request: ScamRequest):
    user_text = request.text.strip()

    # 定義標籤與對應的分析結果
    LABEL_MAP = {
        "SCAM": {
            "risk_score": 90,
            "scam_type": "高風險詐騙",
            "analysis": "此訊息包含典型的詐騙特徵，例如保證獲利、釣魚連結或威脅性用語，風險極高。",
        },
        "SUSPICIOUS": {
            "risk_score": 60,
            "scam_type": "可疑訊息",
            "analysis": "此訊息可能為詐騙前奏，例如要求切換通訊軟體、不明的身份變更。建議提高警覺。",
        },
        "SAFE": {
            "risk_score": 5,
            "scam_type": "正常訊息",
            "analysis": "這看起來像是一則正常的對話或通知。",
        }
    }
    
    # --- Plan A: Live AI ---
    try:
        print(f"--- 嘗試 Plan A (分類模型: {LIVE_AI_MODEL})... ---")
        prompt = create_classification_prompt(user_text)
        payload = {
            "model": LIVE_AI_MODEL,
            "prompt": prompt,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=15.0) as client: 
            response = await client.post(LIVE_AI_URL, json=payload)
            response.raise_for_status()
        
        raw_response_str = response.json().get("response", "").strip().upper()
        
        if raw_response_str in LABEL_MAP:
            print(f"--- Plan A 成功！分類為: {raw_response_str} ---")
            result = LABEL_MAP[raw_response_str].copy()
            result["source"] = f"Plan A: Live ({LIVE_AI_MODEL})"
            if raw_response_str != "SAFE":
                 result["analysis"] += f" 偵測到可疑內容：『{user_text[:30]}...』"
            return result
        else:
            print(f"--- Plan A 回傳了無效的分類標籤: '{raw_response_str}' ---")

    except Exception as e:
        print(f"--- Plan A 失敗 ({e}) ---")

    # --- Plan B: 關鍵字規則 ---
    print("--- 切換至 Plan B (關鍵字規則)... ---")
    scam_keywords = ["保證獲利", "飆股", "點擊連結更新", "帳戶凍結", "抽中大獎"]
    suspicious_keywords = ["換手機", "加我新的LINE", "內部消息", "老師帶你"]
    
    if any(kw in user_text for kw in scam_keywords):
        result = LABEL_MAP["SCAM"].copy()
        result["source"] = "Plan B: Keyword Rule"
        return result
        
    if any(kw in user_text for kw in suspicious_keywords):
        result = LABEL_MAP["SUSPICIOUS"].copy()
        result["source"] = "Plan B: Keyword Rule"
        return result

    print("--- Plan B 未命中，預設為 SAFE ---")
    final_answer = LABEL_MAP["SAFE"].copy()
    final_answer["source"] = "Fallback-Default"
    return final_answer


# --- 3. 其他功能 Endpoints ---

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/debug/live_ai_check")
async def live_ai_check(q: str = "測試訊息"):
    info = {"url": LIVE_AI_URL, "model": LIVE_AI_MODEL}
    prompt = f"[USER]\n分析：'{q}'\n[ASSISTANT]\n(回傳 JSON)"
    payload = {"model": LIVE_AI_MODEL, "prompt": prompt, "format": "json", "stream": False}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.post(LIVE_AI_URL, json=payload)
            return {"ok": r.status_code == 200, "status": r.status_code, "body": r.text[:300], **info}
    except Exception as e:
        return {"ok": False, "error": str(e), **info}

# --- 靜態頁面路由 ---
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_root(): return FileResponse("index.html")

@app.get("/detect")
async def detect_page(): return FileResponse("detect.html")

@app.get("/dashboard")
async def dashboard_page(): return FileResponse("dashboard.html")

@app.get("/simulation")
async def simulation_page(): return FileResponse("simulation.html")

@app.get("/incidents")
async def incidents_page(): return FileResponse("incidents.html")

@app.get("/scam_report_investment")
async def scam_report_investment_page(): return FileResponse("scam_report_investment.html")

@app.get("/scam_report_police")
async def scam_report_police_page(): return FileResponse("scam_report_police.html")

@app.get("/scam_report_installment")
async def scam_report_installment_page(): return FileResponse("scam_report_installment.html")

@app.get("/scam_report_fakeshop")
async def scam_report_fakeshop_page(): return FileResponse("scam_report_fakeshop.html")

@app.get("/scam_report_romance")
async def scam_report_romance_page(): return FileResponse("scam_report_romance.html")

@app.get("/scam_report_job")
async def scam_report_job_page(): return FileResponse("scam_report_job.html")

@app.get("/team")
async def team_page(): return FileResponse("team.html")

# --- 讀取 CSV Helper ---
def read_csv_data(file_path: str, label_col: str, data_col: str):
    try:
        with open(file_path, mode="r", encoding="utf-8") as infile:
            reader = csv.DictReader(infile)
            labels = []
            data = []
            for row in reader:
                labels.append(row[label_col])
                data.append(int(row[data_col]))
            return {"labels": labels, "data": data}
    except Exception as e:
        return {"error": str(e), "labels": [], "data": []}

# --- 儀表板資料 API ---
@app.get("/api/kpi_data")
async def api_kpi_data():
    return {
        "monthly_loss": "1億 8752萬",
        "monthly_cases": 401,
        "ai_interceptions": 1230
    }

@app.get("/api/scam_types_data")
async def api_scam_types_data(): return read_csv_data("data/scam_types.csv", "type", "cases")

@app.get("/api/victim_ages_data")
async def api_victim_ages_data(): return read_csv_data("data/victim_ages.csv", "age_group", "cases")

@app.get("/api/hsinchu_district_data")
async def api_hsinchu_district_data(): return read_csv_data("data/hsinchu_crime_data.csv", "district", "cases")

@app.get("/api/heatmap_data")
async def api_heatmap_data():
    try:
        with open("data/heatmap_data.csv", mode="r", encoding="utf-8") as infile:
            reader = csv.DictReader(infile)
            return [{"lat": float(row["lat"]), "lng": float(row["lng"]), "weight": int(row["cases"])} for row in reader]
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/maps_key")
async def api_maps_key():
    return {"key": GOOGLE_MAPS_API_KEY}

@app.get("/api/crime_data")
async def api_crime_data():
    try:
        scam_types = []
        with open("data/scam_types.csv", mode="r", encoding="utf-8") as infile:
            reader = csv.DictReader(infile)
            scam_types = [row["type"] for row in reader]
        if not scam_types: scam_types = ["假投資", "假網拍"]

        districts = []
        with open("data/heatmap_data.csv", mode="r", encoding="utf-8") as infile:
            reader = csv.DictReader(infile)
            for row in reader:
                districts.append({"name": row["district"], "lat": float(row["lat"]), "lng": float(row["lng"]), "cases": int(row["cases"])})

        crime_points = []
        for district in districts:
            for _ in range(district["cases"]):
                lat_offset = (random.random() - 0.5) * 0.05
                lng_offset = (random.random() - 0.5) * 0.05
                day_offset = random.randint(1, 30)
                crime_points.append({
                    "lat": district["lat"] + lat_offset,
                    "lng": district["lng"] + lng_offset,
                    "type": random.choice(scam_types),
                    "date": f"2025-04-{day_offset}",
                    "location": f"{district['name']}某處"
                })
        return crime_points
    except Exception as e:
        return {"error": str(e)}


# --- 模擬對話 API ---
try:
    from simulation_presets import PRESET_SCRIPTS
except Exception:
    PRESET_SCRIPTS = []

@app.get("/preset_script")
async def preset_script():
    if not PRESET_SCRIPTS:
        return {"id": "fallback", "title": "臨時體驗腳本", "persona": None, "script": _fallback_simulation_script(6), "source": "Fallback-Preset"}
    preset = random.choice(PRESET_SCRIPTS)
    if isinstance(preset, list):
        return {"id": "legacy", "title": "體驗腳本", "persona": None, "script": preset, "source": "Preset-Random-legacy"}
    return {
        "id": preset.get("id", "unknown"),
        "title": preset.get("title", "體驗腳本"),
        "persona": preset.get("persona"),
        "script": preset.get("script", []),
        "source": "Preset-Random"
    }

def _fallback_simulation_script(turns: int = 6) -> List[Dict[str, str]]:
    # 簡易 fallback 腳本
    script = [{"from": "scammer", "text": "您好，我是王牌投顧張老師，最近有支穩定標的，想邀您跟上。"}]
    while len(script) < turns:
        if script[-1]["from"] == "scammer":
            script.append({"from": "user", "text": "喔？真的保證獲利嗎？"})
        else:
            script.append({"from": "scammer", "text": "保證獲利 30%，我們有實單可以看。"})
    return script[:turns]

def _create_script_prompt(scenario: str, turns: int) -> str:
    return f"""
你是一位防詐教育編劇。請產出一段模擬對話腳本(JSON)，第一句是scammer。
場景：{scenario}，句數：{turns}。
嚴格回傳 JSON: {{ "script": [{{"from": "scammer", "text": "..."}}, {{"from": "user", "text": "..."}}] }}
"""

@app.post("/generate_script")
async def generate_script(req: ScriptRequest):
    turns = max(4, min(req.turns, 12))
    prompt = _create_script_prompt(req.scenario or "fake_investment", turns)
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "format": "json", "stream": False}
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(OLLAMA_API_URL, json=payload)
            data = resp.json()
            script = json.loads(data.get("response", "{}")).get("script")
            if script: return {"script": script, "source": "Plan A: Live Gemma"}
            raise ValueError("Invalid script")
        except Exception as e:
            print(f"AI 腳本生成失敗: {e}")
            return {"script": _fallback_simulation_script(turns), "source": "Fallback-Script"}

def _fallback_scammer_reply(history: List[Dict[str, str]] | None = None) -> str:
    return "名額有限，請盡快下載我們的 App 開始獲利。"

def _create_reply_prompt(scenario: str, history: List[Dict[str, str]], persona: Optional[str] = None) -> str:
    hist_str = "\n".join([f"- {m.get('from')}: {m.get('text')}" for m in history[-5:]])
    return f"""
角色：假投資詐騙者。人設：{persona}。
對話歷史：
{hist_str}
請回覆下一句(繁體中文, 單句, 勿跳脫角色)。
嚴格回傳 JSON: {{ "from": "scammer", "text": "..." }}
"""

@app.post("/chat_reply")
async def chat_reply(req: ChatReplyRequest):
    prompt = _create_reply_prompt(req.scenario, req.history, req.persona)
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "format": "json", "stream": False, "options": {"temperature": 0.9}}
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(OLLAMA_API_URL, json=payload)
            data = resp.json()
            reply = json.loads(data.get("response", "{}")).get("text")
            if reply: return {"from": "scammer", "text": reply, "source": "Plan A: Live Gemma"}
            raise ValueError("Invalid reply")
        except Exception:
            return {"from": "scammer", "text": _fallback_scammer_reply(req.history), "source": "Fallback-Reply"}