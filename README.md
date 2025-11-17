# 新竹市 AI 防詐偵測 Demo 系統

> 2025 新竹政策黑客松｜清大小夥伴

這是一個結合 **FastAPI 後端 + 本地 LLM（Ollama）+ 前端互動頁面** 的防詐 Demo 系統。

系統可以：

- 即時分析一段疑似詐騙訊息，給出 **風險分數、詐騙類型、AI 分析說明**。
- 示範「假投資」情境的 **互動式防詐模擬聊天室**。
- 以單一網頁呈現「問題界定 / AI Demo / 儀表板概念 / 互動模擬 / 專案核心功能」。

---

## 專案架構概覽

- `main.py`  
  FastAPI 主程式，提供：
  - `POST /analyze`：分析文字是否為詐騙訊息（Plan A + Plan B 混合）。
  - `POST /generate_script`：生成互動模擬對話腳本（AI 優先，失敗退回隨機模板）。
  - `POST /chat_reply`：根據對話歷史產生下一句「詐騙者」回覆，維持人設與情境。
  - 靜態檔案服務 `/static/...`。
  - `GET /`：回傳首頁 `index.html`。

- `baked_results.py`  
  - **Plan B「預烘焙答案」資料庫**：
    - 針對常見關鍵字（例如：`穩賺不賠`、`帳單逾期未繳`、`媽，我手機壞了`），
    - 直接回傳預先寫好的 JSON 結果（風險分數 + 詐騙類型 + 分析），
    - 確保現場 Demo 即使 AI 模型失效，系統仍然穩定可用。

- `index.html`  
  - 首頁 Landing Page，包含：
    - Hero 區：專案願景——「讓 AI 成為城市的警覺神經」。
    - 問題界定區：新竹詐騙現況數據卡片。
    - 「專案核心功能」描述卡片，摘要三大策略。

- `detect.html`  
  - AI 立即偵測頁：
    - 文字輸入框 + 「立即 AI 分析」按鈕。
    - 顯示風險分數、詐騙類型與 AI 分析說明。

- `dashboard.html`  
  - 防詐儀表板頁：
    - 已接上動態圖表（Chart.js）與暫代資料 API。
    - 仍保留靜態示意圖做為備援（若 JS 或 API 失效仍可展示）。

- `simulation.html`  
  - 互動式防詐模擬頁（進階版）：
    - 進入頁面會自動開始播放，前端會呼叫 `GET /preset_script` 隨機取得 1 組預設對話（我們內建 5 組、每組 3～5 個來回），且每組含「title＋persona」。
    - 顯示的腳本只會播到「詐騙方的最後一句」並停住，讓使用者接話；聊天室標題會顯示該組對話的 `title`。
    - 底部輸入框可輸入訊息，按 Enter 送出；系統會呼叫 `POST /chat_reply`，並把該組對話的 `persona` 一起送出，讓模型依該人設延續對答，維持一致風格。
    - 續聊品質優化：模型提示包含「策略輪換」（名額稀缺/保證獲利/社群拉群/下載App/內線/對帳單）與「避免重複」規則；後端偵測重複時會重試一次或以模板去重，前端也會再檢查最近 3 句避免重複。
  - 效能最佳化：頁面載入時即「預先生成」一段腳本，進入頁面即可播放，縮短等待。
    - 對應企劃中的「互動式防詐模擬系統、遊戲化學習」。

- `team.html`
  - 團隊與聯絡頁：
    - 介紹產品/前端/後端與 AI 等小組分工與職責。
    - 提供 Email 與合作/資料接入/教育推廣等聯絡方式。

- `static/style.css`  
  - 整體視覺設計：新竹藍配色、卡片式區塊、Hero 區漸層背景。
  - AI Demo 區、Dashboard 區、互動模擬聊天室等區塊的樣式。

- `static/main.js`  
  - 綁定前端互動邏輯：
    - 呼叫 `/analyze` API，顯示風險燈號與 AI 分析結果。
    - 控制互動模擬聊天室的腳本播放與動畫。
    - 儀表板資料載入：在 `/dashboard` 頁面自動呼叫 `/api/dashboard_data`，渲染 KPI、圓餅與長條圖。

- `dashboard_data.py`
  - 儀表板的暫代資料來源（唯一來源）。
  - 後端會將內容原封不動地透過 `GET /api/dashboard_data` 提供給前端。
  - 未來若接入真實資料，只需要維護這個檔案（或改成資料庫/ETL 輸出）。

---

## 環境需求

- 作業系統：macOS / Linux / Windows 均可（你目前為 macOS）
- Python：建議 3.10+（你目前是 3.11）
- 套件：
  - `fastapi`
  - `uvicorn`
  - `httpx`
  - `pydantic`（FastAPI 依賴）
- （可選，但推薦）Ollama：本機 LLM 服務，用來跑 `gemma:2b` 模型。

> **注意**：就算沒有啟動 Ollama，系統仍可透過 `baked_results.py` 的 Plan B 正常 Demo（關鍵字觸發）。

---

## 安裝步驟

在專案根目錄 `/Users/jacintooo/hsinchu_hackathon` 執行以下步驟。

### 1. 建立虛擬環境（可選，但建議）

```bash
cd /Users/jacintooo/hsinchu_hackathon
python3 -m venv .venv
source .venv/bin/activate
```

### 2. 安裝必要套件

```bash
pip install fastapi uvicorn httpx "pydantic<2"
```

> 若你已經有 `requirements.txt`，也可以：
>
> ```bash
> pip install -r requirements.txt
> ```

### 3. （可選）安裝並啟動 Ollama 與模型

如果你想啟用 **Plan A：本機 LLM 分析**，需要：

1. 安裝 Ollama（到官方網站下載）。
2. 啟動 Ollama 服務後，在終端機下載 `gemma:2b` 模型：

```bash
ollama pull gemma:2b
```

> 若沒有安裝 Ollama，程式會自動退回 **Plan B**（預烘焙答案），仍然可以完整 Demo 主要流程。

---

## 啟動伺服器

在專案根目錄（確保虛擬環境已啟用）執行：

```bash
uvicorn main:app --reload
```

預設會在 `http://127.0.0.1:8000` 啟動。

- 首頁（Landing Page）：`http://127.0.0.1:8000/`
- 靜態資源：`http://127.0.0.1:8000/static/...`
- API 文件（FastAPI 自動提供）：`http://127.0.0.1:8000/docs`
- 儀表板資料 API：`GET http://127.0.0.1:8000/api/dashboard_data`
- 模擬預設對話 API：`GET http://127.0.0.1:8000/preset_script`

---

## 部署（免費方案建議）

你可以先用「前後端分離」的方式免費上線：

1) 後端（FastAPI）→ Render（免費 Web Service）

- 連結 GitHub Repo，建立一個 Web Service
- Runtime：Python
- Build Command（可省略）：`pip install -r requirements.txt`
- Start Command：`uvicorn main:app --host 0.0.0.0 --port $PORT`
- 部署完成後會得到一個網址，例如：`https://hsinchu-anti-scam.onrender.com`

1) 前端（靜態頁面）→ GitHub Pages（免費）

- 啟用本 Repo 的 GitHub Pages（設定為 `main` 分支 / 根目錄）
- 在 `static/config.js` 設定：

```html
<!-- static/config.js 範例（把這段貼進檔案內）-->
<script>
  window.API_BASE = "https://hsinchu-anti-scam.onrender.com";
</script>
```

注意：本專案已在 `static/main.js` 內支援 `window.API_BASE`，所以當前端與後端不同網域時不用改程式，只要設定這個變數即可。

1) 其他可選免費平台

- Fly.io / Railway：可跑 FastAPI（免費額度依政策可能變動）
- Hugging Face Spaces（Docker 模式）：可跑 FastAPI，但較適合 ML Demo
- Cloudflare Pages：靜態前端 OK，後端建議仍用 Render/Fly 作為 API 來源

如果你想要「全都佈在同一個地方」，也可以用：

- Render（僅後端服務，前端文件放在 FastAPI 靜態目錄）：把 `index.html` 等頁面由 FastAPI 直接提供（已內建），不使用 GitHub Pages。

---

  回傳格式（精簡）：`{ id, title, persona, script, source }`
  `persona` 會直接用於後續 `POST /chat_reply` 的提示詞，讓人設與預設對答對應。

---

## Demo 操作流程（黑客松簡易腳本）

以下是一個建議的 Demo 流程與講稿重點，你可以在簡報時搭配大螢幕投影。

### A. 啟動畫面：專案願景 & 問題界定（首頁 `/`）

1. 瀏覽器打開 `http://127.0.0.1:8000/`。
2. 介紹 Hero 區標語：
   - 「讓 AI 成為城市的『警覺神經』」
   - 「目標是結合科技、防詐教育、社區共治。」
3. 往下捲到「科技城市的反面：新竹成為詐騙重災區」區塊：
   - 指出三張數據卡片：「1 億 8752 萬」、「全台最高之一」、「20–40 歲」。
   - 對應到企劃書中的「新竹詐騙現況」。

### B. AI 立即偵測頁（`/detect`）

1. 透過首頁按鈕或導覽列前往 `http://127.0.0.1:8000/detect`。
2. 在文字框輸入一段日常訊息，例如：
   - `晚上要一起吃飯嗎？`
3. 點擊「立即 AI 分析」。
   - 螢幕上會顯示：
     - 低風險 (0%)
     - 詐騙類型：正常訊息
     - AI 分析：這是一則正常的邀約訊息。
   - 這是透過 `baked_results.py` 的 Plan B 關鍵字命中完成。
4. 再輸入高風險訊息，例如：
   - `老師推薦一個穩賺不賠的投資，保證獲利 30%，快點加入群組。`
5. 再次點擊「立即 AI 分析」。
   - 預期會顯示：
     - 高風險 (90%以上)
     - 詐騙類型：假投資
     - AI 分析：包含「穩賺不賠」、「保證獲利」等典型詐騙話術。
6. 講解背後機制：
   - 系統先檢查 `baked_results.py` 的關鍵字（Plan B）——確保 Demo 穩定。
   - 若沒有命中關鍵字，再交給本機 LLM（gemma:2b）分析（Plan A）。
   - 這個設計對應企劃中的「AI 智慧偵測系統」。

### C. 防詐儀表板頁（`/dashboard`）

1. 開啟 `http://127.0.0.1:8000/dashboard`。
1. 頁面會自動呼叫 `GET /api/dashboard_data`，顯示以下內容：

- KPI：本月財損、本月通報件數、AI 攔截次數。
- 圖表：
  - 圓餅圖（詐騙類型分布）
  - 長條圖（受害族群年齡分布）

1. 若 JS 或 API 不可用，頁面會顯示內建的靜態示意圖：

- `static/dashboard_mockup.svg`（內建）
- 若你放入 `static/dashboard_mockup.png`（自行用圖像 AI 產生），頁面會優先使用 PNG。

#### 產生 PNG 圖片（可選，用圖像 AI）

你可以把下列提示詞交給任一圖像生成工具（DALL·E、Midjourney 等），選一張最符合你審美的設計，下載為 `dashboard_mockup.png` 並放入 `static/`。

- 中文提示詞：
  你是一個專業的 UI/UX 設計師。請幫我設計一個「新竹市防詐儀表板」的 UI 畫面。

  風格： 現代、乾淨、專業，科技感。
  佈局： 4個主要區塊。
  區塊1 (KPIs)： 頂部顯示 4 個關鍵指標：「本月財損 1.8 億」、「本月通報 401 件」、「AI 攔截 1,230 次」、「即時警示 (高)」。
  區塊2 (地圖)： 左側顯示「新竹市地圖」，並在「東區」標註為詐騙熱區。
  區塊3 (圖表)： 中間顯示一個「詐騙類型」圓餅圖，其中「假投資」佔比最大 (約 45%)。
  區塊4 (情資)： 右側顯示一個「最新詐騙快訊」的滾動列表，標題為「Scam Response Team」。

  請生成這張高解析度的儀表板圖片。

- English Prompt:
  Act as a professional UI/UX designer. Create a high-fidelity, modern, and clean dashboard UI for a 'Scam Prevention' system for Hsinchu City.

  Layout: 4 main components. Component 1 (KPIs): 4 key metrics at the top: 'Monthly Loss: $187M', 'Monthly Cases: 401', 'AI Interceptions: 1,230', 'Alert Level: High'. Component 2 (Map): A heatmap of 'Hsinchu City' on the left, showing a red hot-spot over the 'East District'. Component 3 (Charts): A 'Scam Type' pie chart in the middle, with 'Fake Investment' as the largest slice (45%). Component 4 (Intel): A 'Live Alert Feed' list on the right, titled 'Scam Response Team'.

  Generate this high-resolution dashboard image.

### D. 專案核心功能區塊（回首頁說明設計概念）

1. 回到首頁，在「專案核心功能」區，說明三張卡片：
   - AI 智慧偵測系統
   - 互動式防詐模擬
   - Scam Response Team
2. 將文字對應回企劃書上的「核心策略」與「共治模式」。

### E. 互動式防詐模擬頁（`/simulation`）

1. 開啟 `http://127.0.0.1:8000/simulation`。
2. 點擊綠色按鈕「開始『老師帶你飛』情境模擬」。
3. 進入頁面會自動開始模擬（同時也保留按鈕作為備援）。系統在頁面載入時預先呼叫 `POST /generate_script`，開場即播已生成的腳本（每次皆不同），並只顯示到「詐騙方的最後一句」。
4. 當你在底部輸入框輸入訊息並按 Enter：系統會呼叫 `POST /chat_reply`，由「詐騙者」依照既有對話自動回你下一句，維持投顧老師人設繼續誘導（不顯示分析泡泡）。
5. 解說建議：

- 這段模擬示範「沉浸式防詐教育」，每次腳本不同能保持新鮮感。
- 可以擴充更多情境（假交友、假網拍、假冒政府），並在校園或社區巡迴使用。

### F. 收尾：從 MVP 到城市級導入

結尾可以用以下幾點收束 Demo：

- 目前展示的是 **MVP 雛形**：
  - 一個可直接操作的 AI 防詐偵測工具；
  - 一個互動式防詐教育模組；
  - 一個城市級儀表板的概念展示。
- 接下來，只要：
  - 接入 165 / 警政 / 電信的匿名化資料，
  - 建立資料庫與後台
  - 擴充前端的儀表板與模擬情境，
- 就可以往企劃中的 **東區試點 → 校園與社區巡迴 → 城市級常態運作** 前進。

---

## 開發者補充說明

- 若要修改預烘焙答案（Plan B）：
  - 編輯 `baked_results.py` 中的 `DEMO_ANSWERS` 字典即可。
  - Key 是要匹配的關鍵字（子字串），Value 是對應的 JSON 結構（Python dict）。

- 若要調整前端互動：
  - AI 按鈕邏輯在 `static/main.js`。
  - 頁面區塊結構在 `index.html`。
  - 樣式在 `static/style.css`。

---

## 品質檢查（開發時）

開發過程中，可以簡單檢查：

- 伺服器是否能啟動：
  - `uvicorn main:app --reload` 能否正常跑起來。
- API 是否正常：
  - 開啟 `http://127.0.0.1:8000/docs`，用 Swagger 介面測試 `/analyze`。
- 前端互動是否正常：
  - 在首頁測試「正常訊息」與「詐騙訊息」兩種情境。

以上就是本專案的 README 與操作流程，適合作為黑客松決賽簡報與現場 Demo 的技術說明基礎。
