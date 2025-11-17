# main.py (混合式戰術 - 最終版)

import httpx
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles # 匯入 StaticFiles
from fastapi.responses import FileResponse  # 匯入 FileResponse
import json # 匯入 json 函式庫
import random
from typing import Optional, List, Dict

# --- 1. 匯入你的「Plan B 黃金答案」---
# (請確保你已經建立了 baked_results.py 檔案)
try:
    from baked_results import DEMO_ANSWERS
except ImportError:
    print("警告：baked_results.py 未找到，將只運行 Plan A (Live AI 模式)")
    DEMO_ANSWERS = {} # 如果檔案不存在，給一個空字典以避免崩潰

# --- Pydantic Model ---
class ScamRequest(BaseModel):
    text: str


class ScriptRequest(BaseModel):
    scenario: Optional[str] = "fake_investment"  # 目前先支援假投資
    turns: int = 6  # 總句數（含 scammer/user 混合），建議偶數，起手為 scammer


class ChatReplyRequest(BaseModel):
    scenario: Optional[str] = "fake_investment"
    persona: Optional[str] = None  # 新增：預設腳本指定的人設說明
    # history 僅包含 {from:"scammer"|"user", text:"..."}
    history: List[Dict[str, str]]

# --- FastAPI App ---
app = FastAPI()

# 允許跨來源（方便前端放在 GitHub Pages 或其他網域時調用 API）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Demo 階段先全開，正式上線請改為指定網域
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Ollama & Prompt 設定 (Plan A：本地生成，供其他端點使用) ---
OLLAMA_API_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "gemma:2b" # 你的 8GB M1 穩定夥伴（/generate_script、/chat_reply 仍使用）

# --- Live AI（例如外部 4070 Ti 經 ngrok 轉出的 Llama3 服務）---
# 請在本機或雲端設置環境變數 LIVE_AI_URL，例如：
# LIVE_AI_URL = "https://random-code.ngrok-free.app/api/generate"
LIVE_AI_URL = os.environ.get("LIVE_AI_URL", "http://127.0.0.1:11434/api/generate")
LIVE_AI_MODEL = os.environ.get("LIVE_AI_MODEL", "gemma:2b")  # 可改成 gemma:2b 以符合本機可用模型

# 禁用詞（避免模型跳脫人設，出現道歉/拒絕/安全勸說等字眼）
BANNED_SAFETY_TERMS = [
    "抱歉", "很抱歉", "對不起", "無法", "不能", "不可", "不適合", "受害者",
    "安全", "請在安全", "風險", "風險提示", "不要上當", "建議", "理性投資", "合法",
    "不提供", "拒絕", "我不能", "我不會", "我無法", "不是很安全", "避免受害",
]

# --- 儀表板資料（暫代）---
try:
    from dashboard_data import DASHBOARD_DATA
except Exception:
    # 若匯入失敗，給一個最小可用的後備資料，避免 API 失敗
    DASHBOARD_DATA = {
        "kpis": {
            "monthly_loss": "N/A",
            "monthly_cases": 0,
            "ai_interceptions": 0,
        },
        "scam_types": {"labels": [], "data": []},
        "victim_ages": {"labels": [], "data": []},
        "heatmap_data": [],
    }

def create_prompt(message: str) -> str:
    # Gemma 專用優化版 Prompt v2.0 (提供範例)
    # (這是為了 Plan B 未命中時，gemma:2b 也能有最好的表現)
    return f"""
<start_of_turn>user
你是一個詐騙分析 AI。請分析以下訊息，並「只回傳」一個 JSON 物件。

JSON 格式必須包含：
1. "risk_score": 0-100 的整數。
2. "scam_type": ["假投資", "假冒政府", "假網拍", "假交友", "正常訊息"]。
3. "analysis": 一句簡短的中文分析。

[範例 1]
訊息: "hihi"
JSON:
{{
  "risk_score": 0,
  "scam_type": "正常訊息",
  "analysis": "這是一則正常的打招呼訊息。"
}}

[範例 2]
訊息: "您的帳戶已被凍結，請點 www.xbank-verify.com 驗證"
JSON:
{{
  "risk_score": 95,
  "scam_type": "假冒政府",
  "analysis": "偵測到『帳戶凍結』威脅詞彙與可疑釣魚連結。"
}}

[你的任務]
訊息: "{message}"
JSON:
<end_of_turn>
<start_of_turn>model
{{
"""

# --- API Endpoint：/analyze（V2：後端驗證，統一格式）---
@app.post("/analyze")
async def analyze_scam(request: ScamRequest):
    user_text = request.text.strip()

    # 定義保底的錯誤回傳格式
    fallback_answer = {
        "risk_score": -1,
        "scam_type": "錯誤",
        "analysis": "AI 引擎目前負載過高或回傳格式不符，請稍後再試。",
        "source": "Fallback-Error"
    }

    # --- Plan A: Live AI ---
    try:
        print(f"--- 嘗試 Plan A (Live AI: {LIVE_AI_MODEL})... ---")
        prompt = create_prompt(user_text) # 使用 gemma 優化過的 prompt
        payload = {
            "model": LIVE_AI_MODEL,
            "prompt": prompt,
            "format": "json",
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(LIVE_AI_URL, json=payload)
            response.raise_for_status()
        
        # 在後端解析與驗證
        raw_response_str = response.json().get("response", "{}")
        try:
            # Ollama 的 format="json" 有時仍會包含在字串內，需要解析
            result = json.loads(raw_response_str)
            
            # 驗證必要欄位是否存在
            if all(k in result for k in ["risk_score", "scam_type", "analysis"]):
                print("--- Plan A 成功且格式正確！ (Live AI) ---")
                result["source"] = f"Plan A: Live ({LIVE_AI_MODEL})"
                return result
            else:
                print(f"--- Plan A 格式錯誤：缺少必要欄位。回應：{result}")
                # 格式錯誤，轉向 Plan B
        except (json.JSONDecodeError, TypeError) as e:
            print(f"--- Plan A JSON 解析失敗：{e}。回應：{raw_response_str[:200]}")
            # 解析失敗，轉向 Plan B

    except httpx.TimeoutException:
        print(f"--- Plan A 超時 ---")
    except httpx.RequestError as e:
        print(f"--- Plan A 連線錯誤：{e} ---")
    except Exception as e:
        print(f"--- Plan A 未知錯誤：{e} ---")

    # --- Plan B: 烘焙答案庫 ---
    print("--- 切換至 Plan B (烘焙答案)... ---")
    for key, answer in DEMO_ANSWERS.items():
        if key in user_text:
            print("--- Plan B 命中！ (烘焙答案) ---")
            answer["source"] = "Plan B: Baked-in"
            return answer

    # --- 都失敗：回傳保底錯誤 ---
    print("--- Plan B 未命中，回傳保底錯誤 ---")
    return fallback_answer


# --- 健康檢查與除錯 ---
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/debug/live_ai_check")
async def live_ai_check(q: str = "測試訊息"):
    """快速檢查 LIVE_AI_URL 是否可用，回傳簡短結果與錯誤摘要。"""
    info = {"url": LIVE_AI_URL, "model": LIVE_AI_MODEL}
    prompt = f"[USER]\n分析：'{q}'\n[ASSISTANT]\n(回傳 JSON)"
    payload = {"model": LIVE_AI_MODEL, "prompt": prompt, "format": "json", "stream": False}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.post(LIVE_AI_URL, json=payload)
            status = r.status_code
            ok = r.status_code == 200
            body = r.text[:300]
            return {"ok": ok, "status": status, "body_preview": body, **info}
    except Exception as e:
        return {"ok": False, "error": str(e), **info}

# --- 4. 掛載 "static" 資料夾 ---
# 告訴 FastAPI，所有 /static 開頭的網址，都去 "static" 資料夾裡找檔案
app.mount("/static", StaticFiles(directory="static"), name="static")

 # --- 5. 修改根目錄 ("/") 來回傳 HTML 檔案 ---
@app.get("/")
async def read_root():
    """首頁：專案願景與問題界定"""
    return FileResponse("index.html")


@app.get("/detect")
async def detect_page():
    """AI 立即偵測頁面"""
    return FileResponse("detect.html")


@app.get("/dashboard")
async def dashboard_page():
    """防詐儀表板概念頁"""
    return FileResponse("dashboard.html")


@app.get("/simulation")
async def simulation_page():
    """互動式防詐模擬頁"""
    return FileResponse("simulation.html")


@app.get("/team")
async def team_page():
    """團隊與聯絡頁"""
    return FileResponse("team.html")


@app.get("/api/dashboard_data")
async def api_dashboard_data():
    """提供前端儀表板所需的暫代資料。"""
    # 直接回傳已載入的常數資料（未接資料庫前的簡易版）
    return DASHBOARD_DATA


# --- 7. 模擬：預設 5 種腳本，隨機給 1 種 ---
try:
    from simulation_presets import PRESET_SCRIPTS
except Exception:
    PRESET_SCRIPTS = []


@app.get("/preset_script")
async def preset_script():
    """回傳一組預設的『假投資』對話（3~5 個來回，詐騙方開場且收尾）。"""
    if not PRESET_SCRIPTS:
        # 最小後備（確保頁面不會空白）
        return {"id": "fallback", "title": "臨時體驗腳本", "persona": None, "script": _fallback_simulation_script(6), "source": "Fallback-Preset"}
    preset = random.choice(PRESET_SCRIPTS)
    # 兼容舊格式（純陣列）與新格式（含 id/title/persona/script）
    if isinstance(preset, list):
        return {
            "id": "legacy",
            "title": "體驗腳本",
            "persona": None,
            "script": preset,
            "source": "Preset-Random-legacy"
        }
    # 新格式：直接回傳必要欄位
    return {
        "id": preset.get("id", "unknown"),
        "title": preset.get("title", "體驗腳本"),
        "persona": preset.get("persona"),
        "script": preset.get("script", []),
        "source": "Preset-Random"
    }


# --- 6. 產生互動模擬腳本（AI 生成，失敗則退回內建範本） ---
def _fallback_simulation_script(turns: int = 6) -> List[Dict[str, str]]:
    # 極簡的隨機腳本產生器（假投資情境）
    scammer_openers = [
        "您好，我是王牌投顧張老師，最近有支穩定標的，想邀您跟上。",
        "哈囉～最近社群上很熱門的短線策略，帶您體驗一次就知道。",
        "您好，我是專業分析師，今天剛好有一個內部機會。",
    ]
    scammer_promises = [
        "保證獲利 20%-30% 沒問題。",
        "這波跟上，兩週就能回本。",
        "我們團隊都有實單對帳可以看。",
    ]
    scammer_links = [
        "請先下載我們的 App：www.fake-invest-app.com",
        "先加這個 LINE 帳號：@fakeinvest，會有人帶您操作。",
        "先進入體驗網：www.super-profit.vip",
    ]

    user_questions = [
        "喔？需要先付費嗎？",
        "真的能保證獲利？",
        "有沒有風險？",
        "可以先看看績效嗎？",
    ]
    user_thoughts = [
        "（我是不是該用 AI 偵測一下…）",
        "（這聽起來有點太好了吧…）",
    ]

    script: List[Dict[str, str]] = []
    # 起手一定 scammer
    script.append({"from": "scammer", "text": random.choice(scammer_openers)})
    # 之後交替產生到指定 turns
    options_user = user_questions + user_thoughts
    while len(script) < turns:
        if script[-1]["from"] == "scammer":
            script.append({"from": "user", "text": random.choice(options_user)})
        else:
            # 詐騙者下一句
            next_line = random.choice([random.choice(scammer_promises), random.choice(scammer_links)])
            script.append({"from": "scammer", "text": next_line})
    return script[:turns]


def _create_script_prompt(scenario: str, turns: int) -> str:
    return f"""
你是一位防詐教育內容編劇。請產出一段模擬對話腳本，格式必須是 JSON，且只回傳 JSON。

要求：
1) 場景：{scenario}（例如假投資）
2) 句數：{turns} 句，第一句一定是詐騙者（scammer），之後 user / scammer 交替。
3) 每句包含兩個欄位：from（scammer 或 user）、text（繁體中文）。
4) 對話務必包含典型詐騙話術（如：保證獲利、VIP 群組、下載 App、私訊對帳）。
5) 嚴格回傳以下 JSON 結構：
{{
  "script": [
    {{"from": "scammer", "text": "..."}},
    {{"from": "user", "text": "..."}}
  ]
}}
"""


@app.post("/generate_script")
async def generate_script(req: ScriptRequest):
    """生成互動模擬腳本：優先用 Ollama，失敗時回傳內建隨機腳本。"""
    turns = max(4, min(req.turns, 12))  # 防呆：4~12 句
    prompt = _create_script_prompt(req.scenario or "fake_investment", turns)

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(OLLAMA_API_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data.get("response", "{}")
            # 嘗試解析為 JSON
            obj = json.loads(content)
            script = obj.get("script")
            if isinstance(script, list) and script:
                # 基本驗證每個元素有 from/text
                cleaned = []
                for item in script[:turns]:
                    frm = item.get("from")
                    txt = item.get("text")
                    if frm in ("scammer", "user") and isinstance(txt, str) and txt.strip():
                        cleaned.append({"from": frm, "text": txt.strip()})
                if cleaned:
                    return {"script": cleaned, "source": "Plan A: Live Gemma"}
            # 若解析不出，走 fallback
            raise ValueError("Invalid script shape from model")
        except Exception as e:
            print(f"/generate_script 使用 AI 失敗，退回內建腳本：{e}")
            return {"script": _fallback_simulation_script(turns), "source": "Fallback-Script"}


def _fallback_scammer_reply(history: List[Dict[str, str]] | None = None) -> str:
    """當模型不可用時，隨機回覆一則詐騙者訊息（假投資人設），避免重複最近出現的句子。"""
    choices = [
        "現在有內部名額，錯過就要等下一波了。",
        "跟著指令下單，保證穩穩賺，不用自己盯盤。",
        "先加我們小助理 LINE：@fakeinvest，進群就教你。",
        "下載我們的專屬 App：www.fake-invest-app.com，完成註冊我帶你做第一筆。",
        "放心，我們都有對帳單可以看，先跟上再說。",
        "老師這邊有即時策略，帶你做一趟體驗就知道。",
        "名額不多，先卡位，賺到就是你的。",
        "這檔是內部消息，公開後就沒有這個價位了。",
    ]
    avoid = set(m.get("text", "") for m in (history or []) if m.get("from") == "scammer")
    pool = [c for c in choices if c not in avoid]
    if not pool:
        pool = choices
    return random.choice(pool)


def _extract_recent_scammer_texts(history: List[Dict[str, str]], k: int = 6) -> List[str]:
    texts: List[str] = []
    for msg in reversed(history):
        if msg.get("from") == "scammer":
            t = msg.get("text", "").strip()
            if t:
                texts.append(t)
            if len(texts) >= k:
                break
    return list(reversed(texts))


def _detect_used_tactics(history: List[Dict[str, str]]) -> List[str]:
    # 簡易策略偵測（關鍵字匹配）
    tactics = [
        ("名額稀缺", ["名額", "錯過", "最後", "僅限", "趁現在"]),
        ("保證獲利/績效", ["保證", "穩賺", "獲利", "回本", "績效"]),
        ("社群拉群/LINE", ["LINE", "加群", "群組", "小助理", "@"]),
        ("下載App/註冊流程", ["下載", "App", "註冊", "登入", "帳號"]),
        ("內線/消息", ["內部", "消息", "內線", "機會", "訊號"]),
        ("對帳單/見證", ["對帳", "對賬", "截圖", "見證", "實單"]),
    ]
    used: List[str] = []
    for msg in history:
        if msg.get("from") != "scammer":
            continue
        txt = msg.get("text", "")
        for name, kws in tactics:
            if any(kw in txt for kw in kws):
                if name not in used:
                    used.append(name)
    return used


def _create_reply_prompt(scenario: str, history: List[Dict[str, str]], persona: Optional[str] = None) -> str:
    # 僅取最後 10 句，避免 prompt 過長
    last = history[-10:]
    lines = []
    for msg in last:
        who = msg.get("from", "user")
        txt = msg.get("text", "")
        lines.append(f"- {who}: {txt}")

    convo = "\n".join(lines)
    recent_scammer = _extract_recent_scammer_texts(history, k=6)
    used_tactics = _detect_used_tactics(history)
    avoid_block = "\n".join([f"- {t}" for t in recent_scammer]) if recent_scammer else "(無)"
    tactics_block = ", ".join(used_tactics) if used_tactics else "(尚未使用)"
    persona_block = f"\n人設參考：{persona}\n" if persona else "\n(人設：假投資詐騙者/投顧老師，語氣自信、催促，善用保證獲利/名額有限/拉群/下載App等話術)\n"

    return f"""
你現在扮演「假投資詐騙者（投顧老師）」的角色。{persona_block}

情境：{scenario}
對話（最新在下方）：
{convo}

已說過的詐騙者句子（請避免重複或改寫如下內容）：
{avoid_block}

已使用過的策略（請改用不同策略）：{tactics_block}

可選策略示例（任選其一，避免與已使用重複）：名額稀缺、保證獲利/績效、社群拉群/LINE、下載App/註冊流程、內線/消息、對帳單/見證。

回覆規範：
- 只用繁體中文，僅 1 句、口語自然、具行動號召。
- 嚴禁跳脫角色、嚴禁加任何解說或 JSON 以外的內容。
- 不要使用與歷史重複的句子或輕微改寫（同義句）。
- 嚴禁包含任何道歉、拒絕服務或安全勸說字眼（如：抱歉/無法/不適合/受害者/安全/風險/建議/理性投資/不要上當/合法 等）。

請「只回傳 JSON」，且嚴格符合：
{{
  "from": "scammer",
  "text": "(使用繁體中文，1 句，避免過長與不自然數字，維持詐騙者立場，不要跳脫角色，也不要加額外說明)"
}}
"""


@app.post("/chat_reply")
async def chat_reply(req: ChatReplyRequest):
    """根據歷史對話，產生下一句詐騙者回覆（優先 AI，失敗則隨機模板）。"""
    prompt = _create_reply_prompt(req.scenario or "fake_investment", req.history or [], req.persona)
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.9, "top_p": 0.9, "repeat_penalty": 1.2, "num_ctx": 2048},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(OLLAMA_API_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data.get("response", "{}")
            obj = json.loads(content)
            frm = obj.get("from")
            txt = obj.get("text")
            if frm == "scammer" and isinstance(txt, str) and txt.strip():
                candidate = txt.strip()
                # 先過濾禁用詞（道歉/拒絕/安全勸說等），若命中則重試一次
                if any(term in candidate for term in BANNED_SAFETY_TERMS):
                    reinforce_prompt = _create_reply_prompt(req.scenario or "fake_investment", req.history or [], req.persona) + "\n嚴禁出現以下詞彙或意圖：" + ", ".join(BANNED_SAFETY_TERMS) + "\n"
                    retry_payload = {
                        "model": OLLAMA_MODEL,
                        "prompt": reinforce_prompt,
                        "format": "json",
                        "stream": False,
                        "options": {"temperature": 0.95, "top_p": 0.9, "repeat_penalty": 1.25, "num_ctx": 2048},
                    }
                    retry = await client.post(OLLAMA_API_URL, json=retry_payload)
                    retry.raise_for_status()
                    rdata = retry.json()
                    rcontent = rdata.get("response", "{}")
                    robj = json.loads(rcontent)
                    rtxt = (robj or {}).get("text", "").strip()
                    if rtxt and not any(term in rtxt for term in BANNED_SAFETY_TERMS):
                        candidate = rtxt
                    else:
                        return {"from": "scammer", "text": _fallback_scammer_reply(req.history or []), "source": "Fallback-Reply-banned"}

                recent = set(_extract_recent_scammer_texts(req.history or [], k=6))
                if candidate in recent:
                    # retry 一次，附上更強的避免重複提示
                    retry_prompt = _create_reply_prompt(req.scenario or "fake_investment", (req.history or []) + [{"from":"scammer","text":"(請勿重複)"}], req.persona)
                    retry_payload = {
                        "model": OLLAMA_MODEL,
                        "prompt": retry_prompt,
                        "format": "json",
                        "stream": False,
                        "options": {"temperature": 0.95, "top_p": 0.9, "repeat_penalty": 1.25, "num_ctx": 2048},
                    }
                    retry = await client.post(OLLAMA_API_URL, json=retry_payload)
                    retry.raise_for_status()
                    rdata = retry.json()
                    rcontent = rdata.get("response", "{}")
                    robj = json.loads(rcontent)
                    rtxt = (robj or {}).get("text", "").strip()
                    if rtxt and rtxt not in recent and not any(term in rtxt for term in BANNED_SAFETY_TERMS):
                        return {"from": "scammer", "text": rtxt, "source": "Plan A: Live Gemma (retry)"}
                if candidate not in recent:
                    return {"from": "scammer", "text": candidate, "source": "Plan A: Live Gemma"}
                return {"from": "scammer", "text": _fallback_scammer_reply(req.history or []), "source": "Fallback-Reply-dedup"}
            raise ValueError("Invalid reply shape")
        except Exception as e:
            print(f"/chat_reply 使用 AI 失敗，退回模板：{e}")
            return {"from": "scammer", "text": _fallback_scammer_reply(req.history or []), "source": "Fallback-Reply"}