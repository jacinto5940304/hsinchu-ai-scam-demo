# 🛡️ 新竹市 AI 防詐偵測系統

> **2025 新竹政策黑客松｜清大小夥伴**  
> 結合 AI 智慧偵測 + 互動式教育 + 城市級儀表板的次世代防詐平台

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)

🌐 **[線上 Demo](https://jacinto5940304.github.io/hsinchu-ai-scam-demo/)** | 📊 **[儀表板](https://jacinto5940304.github.io/hsinchu-ai-scam-demo/dashboard)** | 🎮 **[互動模擬](https://jacinto5940304.github.io/hsinchu-ai-scam-demo/simulation)**

---

## ✨ 專案特色

這是一個結合 **FastAPI 後端 + 本地 LLM + Cyberpunk 風格前端** 的防詐系統，提供：

- 🤖 **AI 即時偵測**：分析可疑訊息，給出風險分數、詐騙類型與 AI 解析
- 🎮 **互動式模擬**：沉浸式詐騙情境演練，動態生成對話劇本
- 📊 **城市級儀表板**：即時詐騙數據、熱區地圖、案件統計
- 📚 **詐騙資料庫**：6 大類詐騙手法深度解析（愛情、投資、網購、求職、假冒檢警、假網拍）
- 📱 **完整 RWD**：支援桌面、平板、手機全平台響應式設計

---

## 🎨 視覺特色

採用 **Cyberpunk / Sci-Fi** 風格設計：
- 霓虹藍 (`#00f3ff`) + 霓虹紫 (`#bc13fe`) 主題色
- 玻璃擬態 (Glassmorphism) 效果
- 粒子背景動畫
- 打字機效果與霓虹文字特效
- 深色模式 UI 與科技感排版

---

## 📂 專案架構

### 後端 API (`main.py`)
FastAPI 主程式，提供以下端點：

| 端點 | 方法 | 說明 |
|------|------|------|
| `/` | GET | 主頁 |
| `/analyze` | POST | 分析文字是否為詐騙（AI + Plan B） |
| `/generate_script` | POST | 生成互動模擬對話腳本 |
| `/chat_reply` | POST | 續聊回覆（維持詐騙者人設） |
| `/preset_script` | GET | 隨機取得預設對話腳本 |
| `/api/kpi_data` | GET | 儀表板 KPI 數據 |
| `/api/scam_types` | GET | 詐騙類型分布 |
| `/api/victim_ages` | GET | 受害者年齡分布 |
| `/api/district_data` | GET | 新竹市各區案件統計 |
| `/api/heatmap_data` | GET | 地圖熱區資料 |
| `/api/crime_data` | GET | 詐騙案件標記點 |

### 前端頁面

| 檔案 | 說明 |
|------|------|
| `index.html` | 首頁 - Hero 區、專案介紹、核心功能 |
| `detect.html` | AI 偵測頁 - 即時分析可疑訊息 |
| `dashboard.html` | 儀表板 - 動態圖表、KPI、熱區地圖 |
| `simulation.html` | 互動模擬 - 詐騙情境演練 |
| `incidents.html` | 詐騙事件資料集 - 6 大類詐騙案例 |
| `team.html` | 團隊介紹與聯絡方式 |
| `scam_report_*.html` | 各類詐騙手法詳細解析頁 |

### 核心模組

| 檔案 | 說明 |
|------|------|
| `baked_results.py` | Plan B 預烘焙答案資料庫 |
| `dashboard_data.py` | 儀表板資料來源 |
| `simulation_presets.py` | 互動模擬預設腳本 |
| `static/main.js` | 前端主邏輯（API 呼叫、選單控制） |
| `static/animations.js` | 粒子動畫、打字機效果 |
| `static/style.css` | Cyberpunk 風格樣式 |
| `static/config.js` | API 端點設定 |

---

## 🚀 快速開始

### 環境需求

- Python 3.10+
- Node.js (可選，用於前端開發)
- Ollama (可選，用於本地 LLM)

### 安裝步驟

1. **克隆專案**
```bash
git clone https://github.com/jacinto5940304/hsinchu-ai-scam-demo.git
cd hsinchu-ai-scam-demo
```

2. **建立虛擬環境**
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate
```

3. **安裝依賴**
```bash
pip install -r requirements.txt
```

4. **（可選）安裝 Ollama 與 LLM 模型**
```bash
# 安裝 Ollama (到官網下載)
# https://ollama.ai/

# 下載模型
ollama pull gemma:2b
```

### 啟動伺服器

```bash
uvicorn main:app --reload
```

預設會在 `http://127.0.0.1:8000` 啟動。

- 🏠 首頁：`http://127.0.0.1:8000/`
- 🔍 AI 偵測：`http://127.0.0.1:8000/detect`
- 📊 儀表板：`http://127.0.0.1:8000/dashboard`
- 🎮 互動模擬：`http://127.0.0.1:8000/simulation`
- 📖 API 文件：`http://127.0.0.1:8000/docs`

---

## 💡 核心功能詳解

### 1. AI 即時偵測系統

**雙重保障機制：**
- **Plan A**：本地 LLM (gemma:2b) 動態分析
- **Plan B**：預烘焙關鍵字匹配（確保 Demo 穩定）

**支援偵測類型：**
- 假投資詐騙
- 假網拍/解除分期
- 假冒親友
- 假冒檢警
- 求職詐騙
- 愛情詐騙

**輸出資訊：**
```json
{
  "risk_score": 95,
  "scam_type": "假投資",
  "analysis": "訊息包含『穩賺不賠』、『保證獲利』等典型詐騙話術..."
}
```

### 2. 互動式防詐模擬

**特色：**
- 🎭 動態生成對話劇本（5 組預設 + AI 即時生成）
- 🤖 維持詐騙者人設（投顧老師、網購客服等）
- 🎯 沉浸式 Cyberpunk 聊天介面
- 🔄 智能去重與策略輪換

**體驗流程：**
1. 進入頁面自動載入隨機腳本
2. 觀看詐騙者話術演進
3. 輸入回應，系統續聊
4. 學習識別詐騙技巧

### 3. 城市級儀表板

**即時數據展示：**
- 📈 KPI 指標（財損、案件數、AI 攔截次數）
- 🥧 詐騙類型分布圓餅圖
- 📊 受害者年齡分布長條圖
- 🗺️ 新竹市詐騙熱區地圖（支援圖層切換）
- 📍 案件標記與詳細資訊

**技術實作：**
- Chart.js 動態圖表
- Google Maps API 熱區視覺化
- 深色主題配色
- 響應式佈局

### 4. 詐騙資料庫

6 大類詐騙手法深度解析：
- 💔 愛情詐騙（殺豬盤）
- 💰 假投資詐騙（虛擬貨幣）
- 📦 假網拍詐騙
- 💳 解除分期付款
- 👮 假冒檢警詐騙
- 💼 求職詐騙

每篇包含：
- 詐騙手法解析（4-5 個步驟）
- 防範建議
- 真實案例參考

---

## 🎨 設計系統

### 色彩方案
```css
--neon-blue: #00f3ff      /* 主色 - 霓虹藍 */
--neon-purple: #bc13fe    /* 強調色 - 霓虹紫 */
--bg-dark: #050505        /* 背景 */
--glass-bg: rgba(255, 255, 255, 0.03)  /* 玻璃效果 */
--glass-border: rgba(255, 255, 255, 0.1)
```

### 特效元素
- 粒子背景動畫（Canvas）
- 網格疊層（Grid Overlay）
- 打字機效果
- 霓虹文字陰影
- Glassmorphism 卡片
- 漸層邊框動畫

### 響應式斷點
- 📱 手機：< 768px
- 💻 平板：768px - 1024px
- 🖥️ 桌面：> 1024px

---

## 🔧 技術棧

### 後端
- **FastAPI** - 現代化 Python Web 框架
- **Uvicorn** - ASGI 伺服器
- **httpx** - 非同步 HTTP 客戶端
- **Ollama** - 本地 LLM 運行環境

### 前端
- **Tailwind CSS** - Utility-first CSS 框架
- **Chart.js** - 資料視覺化
- **Google Maps API** - 地圖服務
- **Font Awesome** - 圖標庫
- **Vanilla JavaScript** - 純 JS (無框架)

### 字體
- **Noto Sans TC** - 中文黑體
- **Orbitron** - 英文科技字體

---

## 📦 部署指南

### 方案一：Render (推薦)

**後端部署：**
1. 連結 GitHub Repo
2. 建立 Web Service
3. 設定：
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**前端部署（GitHub Pages）：**
1. 啟用 GitHub Pages (Settings → Pages)
2. 選擇 `main` 分支
3. 編輯 `static/config.js`：
```javascript
window.API_BASE = "https://your-app.onrender.com";
```

### 方案二：單一伺服器部署

直接使用 FastAPI 提供靜態檔案：
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

所有頁面透過 FastAPI 的 `StaticFiles` 和路由提供。

---

## 🧪 Demo 操作流程

### 情境一：AI 偵測展示

1. **正常訊息測試**
   ```
   輸入：晚上要一起吃飯嗎？
   結果：✅ 低風險 (0%)
   ```

2. **高風險訊息測試**
   ```
   輸入：老師推薦穩賺不賠的投資，保證獲利 30%
   結果：⚠️ 高風險 (90%+) - 假投資詐騙
   ```

### 情境二：互動模擬演練

1. 點擊「開始模擬」
2. 觀察詐騙者話術
3. 輸入回應進行互動
4. 學習識別詐騙技巧

### 情境三：儀表板巡覽

1. 查看 KPI 指標
2. 分析詐騙類型分布
3. 檢視熱區地圖
4. 切換圖層（熱區/標記）

---

## 🤝 團隊成員

| 成員 | 角色 | 負責項目 |
|------|------|----------|
| 余品萱 | 組長 / 策略設計 | 政策分析、簡報統籌、跨部門協作 |
| 李語涵 | UX / 內容設計 | 對話腳本、介面設計、教育內容 |
| 莊恩齊 | 資料分析 / PM | 指標設計、資料視覺化、趨勢分析 |
| 李晉方 | AI / 系統架構 | FastAPI 開發、LLM 整合、部署維護 |

---

## 📄 授權

MIT License - 歡迎使用與貢獻

---

## 📞 聯絡方式

- 📧 Email: contact@hsinchu-anti-scam.demo
- 🐙 GitHub: [jacinto5940304/hsinchu-ai-scam-demo](https://github.com/jacinto5940304/hsinchu-ai-scam-demo)
- 🏆 專案：2025 新竹政策黑客松

---

## 🎯 未來發展

### 短期目標（3 個月）
- [ ] 接入 165 反詐騙專線資料
- [ ] 擴充至 10+ 詐騙情境
- [ ] 建立後台管理系統
- [ ] 開發 LINE Bot 整合

### 中期目標（6 個月）
- [ ] 東區試點部署
- [ ] 校園巡迴教育
- [ ] 社區推廣活動
- [ ] 建立詐騙資料庫

### 長期願景（1 年）
- [ ] 城市級常態運作
- [ ] 多縣市推廣
- [ ] AI 模型持續優化
- [ ] 公私協力生態系

---

<div align="center">

**讓 AI 成為城市的警覺神經**

Made with 💙 by 清大小夥伴

</div>
