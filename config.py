# config.py
import os

# --- General Settings ---
# 在正式環境中，你應該將其設定為更嚴格的來源清單。
# 例如：ALLOWED_ORIGINS = "https://your-frontend-domain.com"
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*,https://pterylological-johnathan-triangulately.ngrok-free.dev").split(",")

# --- AI Model Settings ---
# 主要的「線上」AI 模型 URL (例如，託管的 Ollama 或其他服務)
LIVE_AI_URL = os.environ.get("LIVE_AI_URL", "http://127.0.0.1:11434/api/generate")
LIVE_AI_MODEL = os.environ.get("LIVE_AI_MODEL", "llama3.1:8b")

# 本地/後備 Ollama 實例的 URL
OLLAMA_API_URL = os.environ.get("OLLAMA_API_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b") # 用於生成腳本等

# --- LINE Bot Settings ---
# ⚠️ 在正式環境中，這些應該透過環境變數設定！
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "u0kmXd6Pxz10i1mqZSmF5F8VrNqjVeodxRW/ZywFH+Tp6QJjHZ9H/zx63mVpAhq/P0ymkagvkxRaLjBDZnY+fsfcOn7DjwY1MAUWZHetzXe/AujFFE2HLcrIHIC0TysjI3phFPViVFy1XYb8MuIFYwdB04t89/1O/w1cDnyilFU=")
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "22e4735405c5a12e476beea0c6f7a591")
LINE_LIFF_URL = os.environ.get("LINE_LIFF_URL", "https://liff.line.me/2008549238-ONbaKA12")

# --- Google Maps API Key ---
# ⚠️ 在正式環境中，這個應該透過環境變數設定！
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "AIzaSyAdKJjWhCddLaS9HsvC_1tVFIvlCdLPblo")

# --- 安全性設定 ---
# ⚠️ 為了安全，這些值在正式環境中應使用環境變數設定
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")

BANNED_SAFETY_TERMS = [
    "抱歉", "很抱歉", "對不起", "無法", "不能", "不可", "不適合", "受害者",
    "安全", "請在安全", "風險", "風險提示", "不要上當", "建議", "理性投資", "合法",
    "不提供", "拒絕", "我不能", "我不會", "我無法", "不是很安全", "避免受害",
]