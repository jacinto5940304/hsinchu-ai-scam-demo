# baked_results.py

# 這是你的「預烘焙」答案資料庫 (Plan B)
# Key = 觸發的關鍵字
# Value = 我們預先跑好的完美 JSON (以 Python 字典格式)

DEMO_ANSWERS = {
    # --- 1. 正常訊息 (低風險) ---
    "hihi": {
        "risk_score": 0,
        "scam_type": "正常訊息",
        "analysis": "這是一則正常的打招呼訊息。"
    },
    "晚上要一起吃飯嗎": {
        "risk_score": 0,
        "scam_type": "正常訊息",
        "analysis": "這是一則正常的邀約訊息。"
    },
    "OK 沒問題": {
        "risk_score": 0,
        "scam_type": "正常訊息",
        "analysis": "這是一則正常的確認訊息。"
    },

    # --- 2. 假投資 (高風險) ---
    "老師推薦": {
        "risk_score": 98,
        "scam_type": "假投資",
        "analysis": "偵測到『老師推薦』、『保證獲利』等典型假投資誘導詞彙。"
    },
    "穩賺不賠": {
        "risk_score": 90,
        "scam_type": "假投資",
        "analysis": "偵測到『穩賺不賠』並提及『虛擬貨幣』，風險極高。"
    },
    "財富自由": {
        "risk_score": 95,
        "scam_type": "假投資",
        "analysis": "使用『財富自由』、『免費領取飆股』等話術，誘導加入假投資群組。"
    },
    "保證獲利": {
        "risk_score": 95,
        "scam_type": "假投資",
        "analysis": "承諾『保證獲利』和『穩定 % 數』，是典型的龐氏騙局。"
    },

    # --- 3. 假冒政府 (高風險) ---
    "帳單逾期未繳": {
        "risk_score": 95,
        "scam_type": "假冒政府",
        "analysis": "偵測到『逾期未繳』、『停話』等威脅詞彙，並提供非官方釣魚連結。"
    },
    "健保卡有異常": {
        "risk_score": 92,
        "scam_type": "假冒政府",
        "analysis": "假冒公家機關名義（健保署），製造恐慌並要求回撥可疑電話。"
    },
    "交通罰單尚未繳納": {
        "risk_score": 95,
        "scam_type": "假冒政府",
        "analysis": "假冒監理站並使用可疑網域，企圖進行釣魚。"
    },
    "包裹地址不詳": {
        "risk_score": 97,
        "scam_type": "假冒政府",
        "analysis": "假冒郵局（中華郵政）並使用偽造網域，企圖竊取個資。"
    },
    "稅款尚未結清": {
        "risk_score": 92,
        "scam_type": "假冒政府",
        "analysis": "假冒國稅局並以『退稅』為誘餌，誘導點擊釣魚連結。"
    },

    # --- 4. 假網拍 (高風險) ---
    "誤設為12筆分期": {
        "risk_score": 90,
        "scam_type": "假網拍",
        "analysis": "典型的『解除分期付款』詐騙，試圖誘導受害者操作 ATM。"
    },
    "私下退款": {
        "risk_score": 85,
        "scam_type": "假網拍",
        "analysis": "要求加 LINE『私下交易』或『私下退款』，脫離平台保護，風險極高。"
    },
    "恭喜您抽中": {
        "risk_score": 88,
        "scam_type": "假網拍",
        "analysis": "不明的中獎通知，通常是為了騙取個資或小額運費。"
    },
    "積分即將到期": {
        "risk_score": 80,
        "scam_type": "假網拍",
        "analysis": "利用『積分到期』製造緊迫感，誘導點擊釣魚連結。"
    },

    # --- 5. 假交友 (高風險) ---
    "媽，我手機壞了": {
        "risk_score": 98,
        "scam_type": "假交友",
        "analysis": "典型的『猜猜我是誰』變體，利用親情與急迫性要求匯款。"
    },
    "手頭有點緊": {
        "risk_score": 75,
        "scam_type": "假交友",
        "analysis": "無明確理由的借款請求，可能是帳號被盜或假冒身份。"
    },
    "幫我買 5000 點": {
        "risk_score": 90,
        "scam_type": "假交友",
        "analysis": "要求購買『遊戲點數』並拍照回傳，是高風險的詐騙手法。"
    },
    "I saw your profile": { # 處理跨國交友
        "risk_score": 85,
        "scam_type": "假交友",
        "analysis": "跨國交友詐騙，初期建立感情，後期誘導至假投資平台。"
    }
}