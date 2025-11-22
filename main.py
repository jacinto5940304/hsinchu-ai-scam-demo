# main.py (混合式戰術 + 互動模擬 + 資料視覺化 + LINE Bot + 政府後台 最終整合版)

import httpx
import json
import random
import csv
import os
import datetime
import re
import urllib.parse
import secrets
import requests
from typing import Optional, List, Dict
from collections import deque

# --- FastAPI 相關匯入 ---
from fastapi import FastAPI, Request, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from fastapi.security import HTTPBasic, HTTPBasicCredentials

# --- LINE Bot 相關匯入 ---
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import (
    MessageEvent, TextMessage, TextSendMessage,
    QuickReply, QuickReplyButton, MessageAction
)

# ==========================================
# 1. 全域設定與常數 (Configuration)
# ==========================================
from config import (
    OLLAMA_API_URL, OLLAMA_MODEL,
    LIVE_AI_URL, LIVE_AI_MODEL,
    LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET,
    ADMIN_USERNAME, ADMIN_PASSWORD,
    GOOGLE_MAPS_API_KEY,
    ALLOWED_ORIGINS, BANNED_SAFETY_TERMS
)

# 【ETXRA】指定我們用 Modelfile 建立的專用詐騙模型
SCAMMER_MODEL = "scammer-pro" # 攻擊方：高創意、話術多
DETECTOR_MODEL = "detector-pro" # 防守方：低創意、邏輯強、JSON格式穩

# ==========================================
# 2. 資料初始化 (Data Initialization)
# ==========================================

# --- 匯入 Plan B 黃金答案 ---
try:
    from baked_results import DEMO_ANSWERS
except ImportError:
    print("警告：baked_results.py 未找到，將只運行 Plan A (Live AI 模式)")
    DEMO_ANSWERS = {}


# --- 匯入 模擬腳本預設值 ---
try:
    from simulation_presets import PRESET_SCRIPTS
except Exception:
    PRESET_SCRIPTS = []

# --- 初始化 狀態與 Log 系統 ---
RECENT_LOGS = deque(maxlen=50)
LINE_MESSAGES = deque(maxlen=50)

# 【新增】使用者狀態機 (記錄誰正在跟詐騙集團對話)
# 格式: { "user_id": { "status": "simulating", "history": [], "turns": 0 } }
USER_STATES = {}

# 【新增】模擬使用者個資 (給後台分析用)
USER_PROFILES = {} 

def get_or_create_user_profile(user_id):
    """為每個 LINE 使用者隨機分配一個身分 (Demo 用)"""
    if user_id not in USER_PROFILES:
        jobs = ["工程師", "大學生", "退休人員", "服務業", "公務員"]
        districts = ["東區", "北區", "香山區"]
        ages = [22, 25, 30, 35, 45, 55, 65]
        USER_PROFILES[user_id] = {
            "age": random.choice(ages),
            "job": random.choice(jobs),
            "district": random.choice(districts),
        }
    return USER_PROFILES[user_id]

def add_log(source: str, text: str, result: dict, user_id: str = None):
    """新增一筆偵測紀錄，並關聯使用者資料"""
    user_info = {}
    if user_id:
        user_info = get_or_create_user_profile(user_id)

    log_entry = {
        "time": datetime.datetime.now().strftime("%H:%M:%S"),
        "source": source,
        "text": text,
        "type": result.get("scam_type", "N/A"),
        "risk": result.get("risk_score", 0),
        "user_profile": user_info # 存入個資
    }
    RECENT_LOGS.appendleft(log_entry)

# ==========================================
# 3. FastAPI App 設定
# ==========================================

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

# ==========================================
# 4. Helper Functions (工具函式)
# ==========================================

def create_exit_quick_reply():
    """建立一個包含「退出」按鈕的 QuickReply 物件"""
    return QuickReply(items=[
        QuickReplyButton(action=MessageAction(label="👋 退出模式", text="退出"))
    ])

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

# --- 【新增】呼叫 scammer-pro 模型 ---
async def get_scammer_response(history: list) -> str:
    """呼叫我們自製的詐騙模型來回應使用者"""
    prompt_context = ""
    for msg in history[-5:]: # 只取最近 5 句
        role = "user" if msg["from"] == "user" else "assistant"
        prompt_context += f"{role}: {msg['text']}\n"
    
    payload = {
        "model": SCAMMER_MODEL, 
        "prompt": prompt_context,
        "stream": False
    }

    async with httpx.AsyncClient(timeout=10.0) as client: 
        try:
            # 注意: 此處的 OLLAMA_API_URL 在 config.py 中指向 /api/generate
            # 新的聊天式互動建議使用 /api/chat
            response = await client.post(OLLAMA_API_URL.replace("/generate", "/chat"), json=payload)
            reply = response.json().get("response", "").strip()
            return reply if reply else "機會不等人，快點加入我們！"
        except Exception as e:
            print(f"Scammer AI Error: {e}")
            return "名額有限，請盡快下載我們的 App 開始獲利。"

def run_detection_pipeline_sync(user_text: str) -> dict:
    """
    執行同步的詐騙偵測流程 (白名單 -> 關鍵字 -> AI)，並回傳結果。
    此函式為 Web 和 LINE Bot 的共用核心邏輯。
    """
    # Plan S: Whitelist (Robust Version)
    safe_domains = [
        "gov.tw", "twm5g.co", "twm.tw", "taiwanmobile.com", "cht.tw", "cht.com.tw",
        "fetnet.net", "shopee.tw", "shp.ee", "momoshop.com.tw", "pchome.com.tw",
        "ctbc.tw", "ctbcbank.com", "esun.co", "esunbank.com.tw", "cathaybk.com.tw",
        "taishinbank.com.tw", "line.me", "family.com.tw", "7-11.com.tw",
    ]
    urls_found = re.findall(r'https?://[^\s/$.?#].[^\s]*', user_text)
    for url in urls_found:
        try:
            hostname = urllib.parse.urlparse(url).hostname
            if hostname:
                hostname = hostname.lower()
                for safe_domain in safe_domains:
                    if hostname == safe_domain or hostname.endswith('.' + safe_domain):
                        print(f"--- Plan S (白名單) 命中！網域: {safe_domain} ---")
                        return {"risk_score": 0, "scam_type": "正常訊息", "analysis": f"偵測到官方或常見服務網域「{safe_domain}」，經判定為安全訊息。", "source": "Plan S: Whitelist"}
        except Exception as e:
            print(f"URL 解析錯誤: {e}")

    # Plan B: Keyword Rules
    print("--- 切換至 Plan B (關鍵字規則) 檢查... ---")
    keywords_map = [
        (["飆股", "保證獲利", "老師帶單", "內線消息", "申購"], "假投資詐騙"),
        (["解除分期", "重複扣款", "訂單錯誤", "批發商"], "網路購物詐騙"),
        (["援交", "購買點數", "Gash", "Apple Card", "經理"], "色情應召詐財詐騙"),
        (["寄禮物", "海關扣留", "戰地軍官", "沒錢買機票"], "假交友（徵婚詐財）詐騙"),
        (["老公", "老婆", "親愛的", "我們以後的家", "加密貨幣平台"], "假交友（投資詐財）詐騙")
    ]
    for keywords, scam_type in keywords_map:
        if any(kw in user_text for kw in keywords):
            print(f"--- Plan B 命中！類型：{scam_type} ---")
            return {"risk_score": 95, "scam_type": scam_type, "analysis": f"偵測到高風險關鍵字（如：{'、'.join([k for k in keywords if k in user_text])}），這極有可能是{scam_type}。", "source": "Plan B: Keyword Rule"}

    # Plan A: Call detector-pro AI
    try:
        print(f"--- 嘗試 Plan A (模型: {DETECTOR_MODEL})... ---")
        payload = {"model": DETECTOR_MODEL, "prompt": user_text, "format": "json", "stream": False, "options": {"temperature": 0.1}}
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=20)
        response.raise_for_status()
        
        ai_raw_response = response.json().get("response", "{}")
        ai_json = json.loads(ai_raw_response)
        
        return {
            "risk_score": ai_json.get("risk_score", 0),
            "scam_type": ai_json.get("scam_type", "可疑訊息"),
            "analysis": ai_json.get("analysis", "AI 無法提供具體分析"),
            "source": f"Plan A: Live ({DETECTOR_MODEL})"
        }
    except Exception as e:
        print(f"--- Plan A 失敗 ({e})，啟動保底機制 ---")
        return {"risk_score": 50, "scam_type": "可疑訊息", "analysis": "AI 系統暫時忙碌，建議您先撥打 165 反詐騙專線查證。", "source": "Fallback-Error"}



# ==========================================
# 5. API Endpoints (Core Logic)
# ==========================================

# --- LINE Bot Webhook ---
@app.post("/callback")
async def callback(request: Request, x_line_signature: str = Header(None)):
    body = await request.body()
    try:
        handler.handle(body.decode("utf-8"), x_line_signature)
    except InvalidSignatureError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    return "OK"

@handler.add(MessageEvent, message=TextMessage)
def handle_message(event):
    user_id = event.source.user_id
    user_text = event.message.text.strip()
    user_text_lower = user_text.lower()
    print(f"--- [LINE] {user_id} 說: {user_text} ---")

    # --- 情境 1: 全域指令優先處理 (無論在哪個模式下) ---

    # 模式切換：詐騙模式
    if user_text_lower == "scammer":
        USER_STATES[user_id] = {"status": "scamming", "history": []}
        try:
            messages_payload = [{"role": "system", "content": "你是一個剛加上好友的詐騙集團成員，請生成一句問候語作為開場白，誘騙對方上鉤。簡短(30字內)。"}]
            res = requests.post("http://127.0.0.1:11434/api/chat", json={"model": SCAMMER_MODEL, "messages": messages_payload, "stream": False, "options": {"temperature": 0.95}}, timeout=15)
            res.raise_for_status()
            opener = res.json().get("message", {}).get("content", "").strip() or "哈囉，最近過得好嗎？"
        except Exception as e:
            print(f"❌ AI 開場白生成錯誤: {e}")
            opener = "您好，我們這裡是 XX 投顧，請問對投資有興趣嗎？"
        USER_STATES[user_id]["history"].append({"role": "assistant", "content": opener})
        line_bot_api.reply_message(event.reply_token, TextSendMessage(text=f"👿 已進入 AI 詐騙模式 👿\n你可以開始與他對話了，試著識破他！\n\n{opener}", quick_reply=create_exit_quick_reply()))
        return

    # 模式切換：查證模式
    if user_text_lower == "detection":
        USER_STATES[user_id] = {"status": "detecting", "history": []}
        line_bot_api.reply_message(event.reply_token, TextSendMessage(text="✅ 已進入 AI 智慧查證模式 ✅\n請直接傳送您想要分析的文字訊息給我。", quick_reply=create_exit_quick_reply()))
        return
        
    # 模式切換：模擬演練模式
    if user_text == "開始模擬" or user_text == "防詐演練":
        USER_STATES[user_id] = {"status": "simulating", "history": [], "turns": 0}
        opener = "您好，我是王牌投顧張老師。最近有一檔主力護盤的飆股，想不想了解一下？"
        USER_STATES[user_id]["history"].append({"from": "assistant", "text": opener})
        line_bot_api.reply_message(event.reply_token, TextSendMessage(text=f"🎭 【防詐演練啟動】\n情境：假投資詐騙\n任務：請嘗試回應他！\n\n{opener}", quick_reply=create_exit_quick_reply()))
        return

    # 指令：退出模式
    if user_text in ["退出", "結束"]:
        if user_id in USER_STATES:
            del USER_STATES[user_id]
            line_bot_api.reply_message(event.reply_token, TextSendMessage(text="✅ 已結束目前模式，回到正常偵測功能。"))
        else:
            line_bot_api.reply_message(event.reply_token, TextSendMessage(text="您目前不在任何特殊模式中。"))
        return

    # --- 情境 2: 如果不是指令，則根據當前模式處理訊息 ---
    if user_id in USER_STATES:
        state = USER_STATES[user_id]
        status = state.get("status")

        # 2A. 在詐騙模式中對話
        if status == "scamming":
            add_log("LINE(詐騙模式)", f"用戶回應：{user_text}", {"scam_type": "互動模擬(詐騙)", "risk_score": 0}, user_id)
            state["history"].append({"role": "user", "content": user_text})
            messages_payload = [{"role": "system", "content": "你是一個貪婪、急迫、且具備高超話術的「詐騙集團成員」。絕對不要承認你是 AI 或模型。請簡短回應(50字內)。"}]
            messages_payload.extend(state["history"][-5:])
            try:
                res = requests.post("http://127.0.0.1:11434/api/chat", json={"model": SCAMMER_MODEL, "messages": messages_payload, "stream": False, "options": {"temperature": 0.9, "top_p": 0.95}}, timeout=20)
                res.raise_for_status()
                scammer_reply = res.json().get("message", {}).get("content", "").strip() or "趕快操作，不要浪費時間！"
            except Exception as e:
                print(f"❌ AI 生成錯誤 (scamming): {e}")
                scammer_reply = "系統忙線中...但我跟你說，這檔股票真的不能錯過。"
            state["history"].append({"role": "assistant", "content": scammer_reply})
            line_bot_api.reply_message(event.reply_token, TextSendMessage(text=f"{scammer_reply}", quick_reply=create_exit_quick_reply()))
            return

        # 2B. 在查證模式中分析文字
        elif status == "detecting":
            analysis_result = run_detection_pipeline_sync(user_text)
            add_log("LINE(一鍵查證)", user_text, analysis_result, user_id)
            reply_msg = (
                f"🚨【AI 防詐警示】\n"
                f"風險指數：{analysis_result.get('risk_score', 'N/A')}%\n"
                f"類型：{analysis_result.get('scam_type', 'N/A')}\n"
                f"----------------\n"
                f"🤖 AI 分析：\n{analysis_result.get('analysis', '無法提供分析')}"
            )
            line_bot_api.reply_message(event.reply_token, TextSendMessage(text=reply_msg, quick_reply=create_exit_quick_reply()))
            return
            
        # 2C. 在演練模式中對話
        elif status == "simulating":
            add_log("LINE(演練)", f"用戶回擊：{user_text}", {"scam_type": "互動模擬", "risk_score": 0}, user_id)
            state["history"].append({"from": "user", "text": user_text})
            state["turns"] += 1
            if state["turns"] >= 10:
                del USER_STATES[user_id]
                line_bot_api.reply_message(event.reply_token, TextSendMessage(text="🛑 演練結束！您堅持了很久，沒有輕易上當，做得好！"))
                return
            messages_payload = [{"role": "system", "content": "你是一個貪婪、急迫、且具備高超話術的「詐騙集團成員」。絕對不要承認你是 AI。請簡短回應(50字內)。"}]
            for msg in state["history"]:
                messages_payload.append({"role": "user" if msg["from"] == "user" else "assistant", "content": msg["text"]})
            try:
                res = requests.post("http://127.0.0.1:11434/api/chat", json={"model": SCAMMER_MODEL, "messages": messages_payload, "stream": False, "options": {"temperature": 0.9, "top_p": 0.95}}, timeout=20)
                res.raise_for_status()
                scammer_reply = res.json().get("message", {}).get("content", "").strip() or "趕快操作，不要浪費時間！"
            except Exception as e:
                print(f"❌ AI 生成錯誤 (simulating): {e}")
                scammer_reply = "系統忙線中...但我跟你說，這檔股票真的不能錯過。"
            state["history"].append({"from": "assistant", "text": scammer_reply})
            line_bot_api.reply_message(event.reply_token, TextSendMessage(text=f"{scammer_reply}", quick_reply=create_exit_quick_reply()))
            return

    # --- 情境 3: 如果不是指令且不在任何模式中，回傳預設訊息 ---
    reply_text = "請等待客服回答，或是使用看看圖文選單功能喔！"
    line_bot_api.reply_message(event.reply_token, TextSendMessage(text=reply_text))

# --- Web AI 分析 (/analyze) ---
# 請確認最上面有定義這個變數
# DETECTOR_MODEL = "detector-pro" 


@app.post("/analyze")
async def analyze_scam(request: ScamRequest):
    user_text = request.text.strip()
    # 【核心改動】Web 端也呼叫統一的偵測核心
    final_answer = run_detection_pipeline_sync(user_text)
    add_log(source="Web", text=user_text, result=final_answer)
    return final_answer
# ==========================================
# 6. 政府後台 API (Admin)
# ==========================================

security = HTTPBasic()

def get_current_user(credentials: HTTPBasicCredentials = Depends(security)):
    """驗證使用者帳號密碼"""
    correct_username = secrets.compare_digest(credentials.username, ADMIN_USERNAME)
    correct_password = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@app.get("/login")
async def login_page(): return FileResponse("login.html")

@app.get("/admin")
async def admin_page(username: str = Depends(get_current_user)):
    """回傳政府後台 HTML (受保護)"""
    return FileResponse("admin.html")

@app.get("/api/admin_stats")
async def api_admin_stats(username: str = Depends(get_current_user)):
    """回傳即時監控數據 (受保護)，並對日誌進行預處理"""
    processed_logs = []
    for log in RECENT_LOGS:
        new_log = log.copy()
        # 對於模擬資料，將風險指數設為 N/A
        if new_log['source'] in ["LINE(詐騙模式)", "LINE(演練)"]:
            new_log['risk'] = 'N/A'
        processed_logs.append(new_log)
        
    return {
        "logs": processed_logs,
        "total_cases": 401 + len(RECENT_LOGS),
        "ai_blocked": 1230 + len([l for l in RECENT_LOGS if isinstance(l.get('risk'), int) and l['risk'] > 80])
    }

# 【新增】AI 趨勢總結與使用者分析 API
@app.get("/api/admin/analysis")
async def api_admin_analysis(username: str = Depends(get_current_user)):
    """
    1. 統計使用者輪廓與詐騙類型的關係
    2. 用 LLM 讀取最近的報案 Log，總結出趨勢
    """
    stats = {"district_risk": {}, "job_risk": {}}
    
    recent_texts = []
    for log in RECENT_LOGS:
        if log['source'] != "LINE(演練)":
            recent_texts.append(f"[{log['type']}] {log['text']}")
        
        # 統計個資風險
        if "user_profile" in log and log["user_profile"]:
            dist = log["user_profile"].get("district", "未知")
            job = log["user_profile"].get("job", "未知")
            stats["district_risk"][dist] = stats["district_risk"].get(dist, 0) + 1
            stats["job_risk"][job] = stats["job_risk"].get(job, 0) + 1

    # 呼叫 AI 總結趨勢
    trend_report = "目前數據量不足，無法分析趨勢。"
    if recent_texts:
        logs_str = "\n".join(recent_texts[:10])
        prompt = f"""
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
你是一個警政數據分析 AI。請閱讀以下民眾回報的詐騙訊息，並總結出「3 個」目前最流行的詐騙關鍵字或手法。請用列點方式回答，簡潔有力。
<|eot_id|><|start_header_id|>user<|end_header_id|>
{logs_str}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>
"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {"model": LIVE_AI_MODEL, "prompt": prompt, "stream": False}
                res = await client.post(OLLAMA_API_URL, json=payload)
                trend_report = res.json().get("response", "分析失敗")
        except:
            trend_report = "AI 分析忙碌中..."

    return {
        "stats": stats,
        "trend_report": trend_report
    }

@app.get("/api/admin/dashboard_analytics")
async def api_dashboard_analytics(username: str = Depends(get_current_user)):
    """為儀表板計算並回傳統計數據"""
    from collections import Counter
    
    # 過濾掉模擬資料，只分析真實案件
    real_logs = [log for log in RECENT_LOGS if log.get("source") not in ["LINE(演練)", "LINE(詐騙模式)"]]
    
    # 1. 詐騙類型統計
    scam_type_counts = Counter(log['type'] for log in real_logs if log.get('type') and log.get('type') != 'N/A')
    
    # 2. 使用者輪廓統計
    district_counts = Counter()
    job_counts = Counter()
    
    for log in real_logs:
        profile = log.get("user_profile")
        if profile:
            if profile.get("district"):
                district_counts[profile["district"]] += 1
            if profile.get("job"):
                job_counts[profile["job"]] += 1
                
    # 排序結果，讓圖表更好看
    top_scam_types = dict(scam_type_counts.most_common(5))
    top_districts = dict(district_counts.most_common(5))
    top_jobs = dict(job_counts.most_common(5))
    
    return {
        "scam_type_stats": {"labels": list(top_scam_types.keys()), "data": list(top_scam_types.values())},
        "district_stats": {"labels": list(top_districts.keys()), "data": list(top_districts.values())},
        "job_stats": {"labels": list(top_jobs.keys()), "data": list(top_jobs.values())},
    }


# ==========================================
# 7. 其他 API 與路由 (維持原樣)
# ==========================================
# ... (以下為原本的資料視覺化與靜態頁面路由，皆保持不變) ...

@app.get("/api/kpi_data")
async def api_kpi_data(date: Optional[str] = None):
    """Return lightweight KPI summary used by the frontend.
    Behaviour:
    - Try to fetch live KPI from the external 165dashboard (same endpoint used by `/api/kpi_live`).
    - If available, use `TotalCases` and `TotalLosses` from that source.
    - Fallback: derive `monthly_cases` and `ai_interceptions` from `RECENT_LOGS`.
    """
    monthly_cases = None
    monthly_loss_formatted = None

    # 1) Try external live KPI (avoid using internal endpoint to reduce recursion)
    try:
        if date is None:
            date = datetime.date.today().isoformat()
        url = f"https://165dashboard.tw/CIB_DWS_API/api/Dashboard/GetDailyFraudMethodRanking?date={date}T16:00:00Z&sort=case"
        resp = requests.get(url, timeout=6)
        resp.raise_for_status()
        data = resp.json()
        body = data.get("body") or data.get("Body") or data
        # TotalCases and TotalLosses may exist in the body
        total_cases = body.get('TotalCases') or body.get('totalCases') or body.get('TotalCases')
        total_losses = body.get('TotalLosses') or body.get('totalLosses') or body.get('TotalLosses')
        if total_cases is not None:
            monthly_cases = int(total_cases)
        if total_losses is not None:
            # total_losses is expected in 萬 (ten-thousands) unit per earlier assumptions
            try:
                losses_num = float(total_losses)
                losses_in_yuan = losses_num * 10000
                yi = int(losses_in_yuan // 100000000)
                wan = int(round((losses_in_yuan % 100000000) / 10000))
                monthly_loss_formatted = f"{yi}億 {wan}萬"
            except Exception:
                monthly_loss_formatted = str(total_losses)
    except Exception:
        # ignore and fallback to RECENT_LOGS
        monthly_cases = None
        monthly_loss_formatted = None

    # 2) Fallbacks using RECENT_LOGS
    try:
        if monthly_cases is None:
            # approximate monthly cases using RECENT_LOGS length (no date info stored)
            monthly_cases = len(RECENT_LOGS)

        # compute ai interceptions from RECENT_LOGS (risk > 80)
        intercepted_count = len([l for l in RECENT_LOGS if isinstance(l.get('risk'), (int, float)) and l.get('risk') > 80])
    except Exception:
        monthly_cases = monthly_cases or 0
        intercepted_count = 0

    # If we still don't have a readable monthly_loss, set a placeholder
    if not monthly_loss_formatted:
        monthly_loss_formatted = "--"

    return {"monthly_loss": monthly_loss_formatted, "monthly_cases": monthly_cases, "ai_interceptions": intercepted_count}


@app.get("/api/kpi_live")
async def api_kpi_live(date: Optional[str] = None):
    """
    後端代理：向 165dashboard 取得即時 KPI（避免瀏覽器 CORS 問題）。
    回傳範例：{"TotalCases": 485, "TotalLosses": 22395.6}
    若失敗則回傳 {"error": "..."}。
    """
    if date is None:
        date = datetime.date.today().isoformat()
    # API 期望的時間戳格式
    url = f"https://165dashboard.tw/CIB_DWS_API/api/Dashboard/GetDailyFraudMethodRanking?date={date}T16:00:00Z&sort=case"
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        # 回傳原始 body 以便前端使用 TopFive 與其他欄位
        body = data.get("body") or data.get("Body") or data
        return body
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/daily_city_fraud")
async def api_daily_city_fraud(date: Optional[str] = None):
    """Proxy to 165dashboard's GetDailyCityFraudData endpoint.
    Returns a list of city entries like {"CityId":14, "Name":"新竹市", "Cases":2.62, "Losses":516.6}
    """
    if date is None:
        date = datetime.date.today().isoformat()
    # build timestamp per external API expectation
    ts = f"{date}T16:00:00Z"
    url = f"https://165dashboard.tw/CIB_DWS_API/api/Dashboard/GetDailyCityFraudData?date={ts}&standardized=true"
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        body = data.get('body') or data.get('Body') or data

        # Normalize common wrapper shapes to return a plain list when possible
        if isinstance(body, list):
            return body

        if isinstance(body, dict):
            # common keys that might contain the array
            for key in ("Data", "data", "Items", "items", "Result", "result", "Cities", "cities", "Body", "body", "TopFive"):
                val = body.get(key)
                if isinstance(val, list):
                    return val

            # sometimes API returns object keyed by numeric strings -> convert values
            # e.g. { "0": {...}, "1": {...} }
            numeric_values = [v for k, v in body.items() if k.isdigit() and isinstance(v, dict)]
            if numeric_values:
                return numeric_values

        # fallback: return body as-is (front-end will handle non-array)
        return body
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/monthly_city_fraud")
async def api_monthly_city_fraud(date: Optional[str] = None):
    """Proxy to 165dashboard's GetMonthlyCityFraudData endpoint.
    Returns a list of city entries like {"CityId":14, "Name":"新竹市", "Cases":81.76, "Losses":4216.4}
    """
    if date is None:
        date = datetime.date.today().isoformat()
    ts = f"{date}T16:00:00Z"
    url = f"https://165dashboard.tw/CIB_DWS_API/api/Dashboard/GetMonthlyCityFraudData?date={ts}&standardized=true"
    try:
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        body = data.get('body') or data.get('Body') or data

        if isinstance(body, list):
            return body

        if isinstance(body, dict):
            for key in ("Data", "data", "Items", "items", "Result", "result", "Cities", "cities", "Body", "body", "TopFive"):
                val = body.get(key)
                if isinstance(val, list):
                    return val

            numeric_values = [v for k, v in body.items() if k.isdigit() and isinstance(v, dict)]
            if numeric_values:
                return numeric_values

        return body
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/scam_types_data")
async def api_scam_types_data(): return {"labels": [], "data": []}

@app.get("/api/victim_ages_data")
async def api_victim_ages_data(): return {"labels": [], "data": []}

@app.get("/api/hsinchu_district_data")
async def api_hsinchu_district_data(): return {"labels": [], "data": []}

@app.get("/api/heatmap_data")
async def api_heatmap_data():
    try:
        with open("data/heatmap_data.csv", mode="r", encoding="utf-8") as infile:
            reader = csv.DictReader(infile)
            return [{"lat": float(row["lat"]), "lng": float(row["lng"]), "weight": int(row["cases"])} for row in reader]
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/maps_key")
async def api_maps_key(): return {"key": GOOGLE_MAPS_API_KEY}

@app.get("/api/village_scam_data")
async def api_village_scam_data():
    def _load_csv_coords(path: str):
        """嘗試多種編碼讀取 coordinates CSV，並回傳 (coords_map, used_encoding, key_column)"""
        last_err = None
        for enc in ("utf-8", "cp950", "big5"):
            try:
                with open(path, mode="r", encoding=enc) as infile:
                    reader = csv.DictReader(infile)
                    if not reader.fieldnames:
                        continue
                    # 優先找常見的里名欄位，否則使用第一個欄位
                    key_col = None
                    for candidate in ["里名", "里", "name"]:
                        if candidate in reader.fieldnames:
                            key_col = candidate
                            break
                    if not key_col:
                        key_col = reader.fieldnames[0]

                    coords = {}
                    for row in reader:
                        try:
                            key = row.get(key_col)
                            if not key:
                                continue
                            coords[key] = {"lat": float(row.get("lat") or row.get("LAT") or 0), "lng": float(row.get("lng") or row.get("LON") or row.get("lng") or 0)}
                        except Exception:
                            continue
                    return coords, enc, key_col
            except Exception as ex:
                last_err = ex
                continue
        raise last_err or FileNotFoundError(path)

    try:
        coords_map, used_enc, key_col = _load_csv_coords("data/village_coordinates.csv")
    except Exception as e:
        return {"error": f"無法讀取 village_coordinates.csv: {str(e)}"}

    try:
        scam_data = []
        # 讀取熱區資料（CSV），這通常是 UTF-8，但我們也容錯
        last_err = None
        for enc in ("utf-8", "cp950", "big5"):
            try:
                with open("data/熱區地圖_clean.csv", mode="r", encoding=enc) as infile:
                    reader = csv.DictReader(infile)

                    # build a tolerant header lookup: map normalized keys -> actual header name
                    def find_header(candidates, fieldnames):
                        for h in fieldnames or []:
                            if not h:
                                continue
                            hn = h.strip().replace('﻿', '')
                            for c in candidates:
                                if c in hn:
                                    return h
                        return None
                    name_col = find_header(["里名", "里", "name"], reader.fieldnames)
                    inv_col = find_header(["投資"], reader.fieldnames)
                    shop_col = find_header(["網購", "購物", "shopping"], reader.fieldnames)
                    auc_col = find_header(["網拍", "拍賣", "假網拍", "auction"], reader.fieldnames)
                    dating_col = find_header(["交友", "假交友", "dating"], reader.fieldnames)
                    marriage_col = find_header(["徵婚", "婚", "marriage"], reader.fieldnames)

                    for row in reader:
                        village_name = row.get(name_col) if name_col else row.get(reader.fieldnames[0])
                        if not village_name:
                            continue
                        coord = coords_map.get(village_name)
                        if coord:
                            try:
                                scam_data.append({
                                    "name": village_name,
                                    "location": {"lat": coord["lat"], "lng": coord["lng"]},
                                    "investment": float(row.get(inv_col, 0) or 0),
                                    "shopping": float(row.get(shop_col, 0) or 0),
                                    "auction": float(row.get(auc_col, 0) or 0),
                                    "dating": float(row.get(dating_col, 0) or 0),
                                    "marriage": float(row.get(marriage_col, 0) or 0),
                                })
                            except (ValueError, TypeError):
                                continue
                break
            except Exception as ex:
                last_err = ex
                continue

        if not scam_data and last_err:
            return {"error": f"讀取熱區資料失敗: {str(last_err)}"}

        return scam_data
    except Exception as e:
        return {"error": str(e)}

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

# --- 模擬互動 API (Simulation) ---
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
# --- 補上遺失的輔助函式 ---

def _fallback_scammer_reply(history: List[Dict[str, str]] | None = None) -> str:
    """當 AI 掛掉時的備用回覆"""
    return "名額有限，請盡快下載我們的 App 開始獲利。"

def _create_reply_prompt(scenario: str, history: List[Dict[str, str]], persona: Optional[str] = None) -> str:
    """將對話紀錄組裝成 Prompt"""
    # 只取最後 5 句，避免 Prompt 太長
    hist_str = "\n".join([f"- {m.get('from')}: {m.get('text')}" for m in history[-5:]])
    
    return f"""
角色：假投資詐騙者。人設：{persona}。
對話歷史：
{hist_str}
請回覆下一句(繁體中文, 單句, 勿跳脫角色)。
嚴格回傳 JSON: {{ "from": "scammer", "text": "..." }}
"""

# ---------------------------------------------------
# 下面應該要是原本的 @app.post("/chat_reply") ...
# ---------------------------------------------------

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

@app.get("/play")
async def play_page(): return FileResponse("play.html")
