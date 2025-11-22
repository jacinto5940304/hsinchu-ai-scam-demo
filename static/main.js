// static/main.js (已整合所有功能)
// 可由 /static/config.js 設定 window.API_BASE 指向後端 API 網域（如部署在 Render）。
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

document.addEventListener("DOMContentLoaded", () => {
    
    // 儀表板：若元素存在則載入資料並繪圖
    const dynamicDashboard = document.getElementById("dynamic-dashboard");
    if (dynamicDashboard) {
        loadDashboardData().catch((e) => {
            console.warn("載入儀表板資料失敗，使用靜態備援圖。", e);
        });
    }

    // --- 
    // --- 區塊 1：AI 偵測器邏輯 ---
    // --- 
    const analyzeButton = document.getElementById("analyzeButton");
    const scamTextInput = document.getElementById("scamText");
    const loadingIndicator = document.getElementById("loading");
    const resultContainer = document.getElementById("result-container");
    const resultBox = document.getElementById("result-box");

    if (analyzeButton) {
        analyzeButton.addEventListener("click", async () => {
            
            const textToAnalyze = scamTextInput.value;

            if (!textToAnalyze) {
                alert("請先輸入要分析的文字。");
                return;
            }

            // 顯示「載入中...」並隱藏上次結果
            loadingIndicator.style.display = "block";
            resultContainer.style.display = "none";
            analyzeButton.disabled = true; // 防止重複點擊

            try {
                // 關鍵！呼叫我們在 "同一個" 伺服器上的 /analyze API
                const response = await fetch(`${API_BASE}/analyze`, { // 支援相對或跨網域
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ text: textToAnalyze })
                });

                if (!response.ok) {
                    throw new Error(`API 請求失敗 (HTTP ${response.status})`);
                }

                // 後端已確保回傳的是格式正確的 JSON 物件
                const llmResult = await response.json();
                
                // 直接顯示格式化的結果
                displayResult(llmResult);

            } catch (error) {
                console.error("分析失敗:", error);
                displayResult({
                    risk_score: -1,
                    scam_type: "錯誤",
                    analysis: `分析時發生錯誤: ${error.message}`
                });
            } finally {
                // 隱藏「載入中...」
                loadingIndicator.style.display = "none";
                analyzeButton.disabled = false; // 恢復按鈕
            }
        });
    }

    /**
     * 格式化並顯示 AI 結果
     * @param {object} llmResult - 從 AI 解析出來的 JSON 物件
     */
    function displayResult(llmResult) {
        let riskText = "";
        let riskClass = "";

        if (llmResult.risk_score >= 70) {
            riskText = `高風險 (${llmResult.risk_score}%)`;
            riskClass = "risk-high";
        } else if (llmResult.risk_score >= 30) {
            riskText = `中風險 (${llmResult.risk_score}%)`;
            riskClass = "risk-medium";
        } else if (llmResult.risk_score >= 0) {
            riskClass = "risk-low";
        } else {
            riskText = "分析錯誤";
            riskClass = "risk-high";
        }

        // 組裝 HTML
        resultBox.innerHTML = `
            <strong class="${riskClass}">${riskText}</strong>
            <br>
            <strong>詐騙類型：</strong> ${llmResult.scam_type}
            <p><strong>AI 分析：</strong> ${llmResult.analysis}</p>
        `;
        
        // 移除所有舊的顏色 class，並加上新的
        resultBox.className = "result-box"; // 重設
        resultBox.classList.add(riskClass); // 加上新的
        
        // 顯示結果區
        resultContainer.style.display = "block";
    }

    // --- 
    // --- 區塊 2：互動模擬聊天室邏輯 ---
    // --- 
    const startSimButton = document.getElementById("startSimButton");
    const simChat = document.getElementById("simChat");

    if (startSimButton && simChat) {
        // --- START DEBUG ---
        // debug UI removed: use console.debug / console.warn instead to avoid floating overlay

        const simBody = simChat.querySelector(".sim-body");
        const simFooter = simChat.querySelector(".sim-footer");
        const simInput = simFooter.querySelector("input[type='text']");
        const chatHistory = [];
        let presetPersona = null;
        let presetTitle = null;
        let presetScenario = "default"; // New variable to hold the scenario ID

        const prefetchPromise = (async () => {
            try {
                const resp = await fetch(`${API_BASE}/preset_script`);
                if (!resp.ok) {
                    throw new Error(`伺服器回應錯誤 (HTTP ${resp.status})`);
                }
                const data = await resp.json();
                
                // log preset script load result to console instead of injecting onto page
                console.debug('成功讀取 preset_script：', data);

                presetPersona = data.persona || null;
                presetTitle = data.title || null;
                presetScenario = data.id || "default"; // Capture the scenario ID
                return Array.isArray(data.script) ? data.script : [];
            } catch (e) {
                console.warn('讀取 /preset_script 失敗：', e);
                console.warn("預先生成腳本失敗。", e);
                return [];
            }
        })();

        startSimButton.addEventListener("click", async () => {
            simChat.style.display = "block";
            startSimButton.style.display = "none";
            simBody.innerHTML = ""; 

            let script = [];
            try {
                script = await prefetchPromise;
            } catch (e) {
                console.warn("取得預設腳本失敗。", e);
                script = [];
            }

            let displayScript = script.slice();
            if (displayScript.length && displayScript[displayScript.length - 1].from !== "scammer") {
                displayScript.pop();
            }

            let delay = 500;
            displayScript.forEach((message, index) => {
                setTimeout(() => {
                    appendSimMessage(message.from, message.text);
                }, delay * (index + 1));
            });

            const simHeader = simChat.querySelector('.sim-header');
            if (simHeader && presetTitle) {
                simHeader.textContent = `${presetTitle}`;
            }

            if (simInput) {
                simInput.disabled = false;
                simInput.placeholder = "請回覆詐騙訊息（按 Enter 送出）";
                simInput.addEventListener("keydown", async (ev) => {
                    if (ev.key === "Enter") {
                        const text = simInput.value.trim();
                        if (!text) return;
                        appendSimMessage("user", text);
                        simInput.value = "";

                        try {
                            const historyPayload = chatHistory.filter(m => m.from === "user" || m.from === "scammer");
                            
                            // The payload for the API call
                            const payload = {
                                scenario: presetScenario,
                                persona: presetPersona,
                                history: historyPayload.slice(-10)
                            };

                            const replyResp = await fetch(`${API_BASE}/chat_reply`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload)
                            });
                            let replyData = await replyResp.json();

                            const recentScammers = [...chatHistory].filter(m => m.from === "scammer").slice(-3);
                            const isDup = replyData && replyData.text && recentScammers.some(m => m.text.trim() === replyData.text.trim());

                            let attempts = 0;
                            while (isDup && attempts < 2) {
                                attempts += 1;
                                try {
                                    const retryResp = await fetch(`${API_BASE}/chat_reply`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(payload) // Use the same payload for retry
                                    });
                                    const retryData = await retryResp.json();
                                    if (retryData && retryData.from === "scammer" && retryData.text && !recentScammers.some(m => m.text.trim() === retryData.text.trim())) {
                                        replyData = retryData;
                                        break;
                                    }
                                } catch (e) {
                                    break;
                                }
                            }

                            if (replyData && replyData.from === "scammer" && replyData.text) {
                                appendSimMessage("scammer", replyData.text);
                            }
                        } catch (err) {
                            console.error("/chat_reply 失敗：", err);
                            appendSimMessage("system", "（系統）產生續聊失敗。", false);
                        }
                    }
                });
            }
        });

        setTimeout(() => {
            if (getComputedStyle(startSimButton).display !== "none") {
                startSimButton.click();
            }
        }, 0);

        function appendSimMessage(from, text, record = true) {
            const msgElement = document.createElement("div");
            msgElement.classList.add("sim-message", from);
            msgElement.textContent = text;

            if (from === 'user') {
                msgElement.classList.add('self-end');
            } else {
                msgElement.classList.add('self-start');
            }
            simBody.appendChild(msgElement);
            simBody.scrollTop = simBody.scrollHeight;
            if (record && (from === "user" || from === "scammer")) {
                chatHistory.push({ from, text });
            }
        }
    }

    // --- 
    // --- 區塊 3：漢堡選單邏輯 ---
    // --- 
    const mobileMenuButton = document.getElementById("mobile-menu-button");
    const mobileMenu = document.getElementById("mobile-menu");

    if (mobileMenuButton && mobileMenu) {
        const menuIcon = mobileMenuButton.querySelector("i");
        
        // 開關選單功能
        const toggleMenu = () => {
            if (mobileMenu.classList.contains("hidden")) {
                mobileMenu.classList.remove("hidden");
                menuIcon.classList.remove("fa-bars");
                menuIcon.classList.add("fa-times");
                document.body.style.overflow = "hidden"; // 防止背景滾動
            } else {
                mobileMenu.classList.add("hidden");
                menuIcon.classList.remove("fa-times");
                menuIcon.classList.add("fa-bars");
                document.body.style.overflow = "auto"; // 恢復滾動
            }
        };
        
        mobileMenuButton.addEventListener("click", toggleMenu);
        
        // 點擊選單項目後關閉選單
        const mobileMenuLinks = document.querySelectorAll(".mobile-menu-link");
        mobileMenuLinks.forEach(link => {
            link.addEventListener("click", () => {
                mobileMenu.classList.add("hidden");
                menuIcon.classList.remove("fa-times");
                menuIcon.classList.add("fa-bars");
                document.body.style.overflow = "auto";
            });
        });
        
        // 點擊選單背景關閉選單
        mobileMenu.addEventListener("click", (e) => {
            if (e.target === mobileMenu) {
                toggleMenu();
            }
        });
    }

}); // 確保 DOMContentLoaded 是最外層的括號

// ------------- 儀表板：載入資料與繪圖 -------------
async function loadDashboardData() {
    // 如果沒有 Chart.js，則不執行任何操作
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js 未載入，儀表板無法繪製。");
        return;
    }

    // --- 全域 Chart.js 深色主題設定 ---
    Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

    try {
        // 1. 載入 KPI 數據（由後端代理以避免 CORS 問題）
        let liveKpi = null;
        try {
            const kpiResp = await fetch(`${API_BASE}/api/kpi_live`);
            if (kpiResp.ok) {
                const kpiData = await kpiResp.json();
                liveKpi = kpiData;
                if (!kpiData.error) {
                    const totalCases = kpiData.TotalCases;
                    const totalLossesInTenThousand = kpiData.TotalLosses; // 單位是萬

                    // 處理金額，轉換為億和萬
                    const lossesInYuan = (Number(totalLossesInTenThousand) || 0) * 10000;
                    const yi = Math.floor(lossesInYuan / 100000000);
                    const wan = Math.round((lossesInYuan % 100000000) / 10000);
                    const formattedLoss = `${yi}億 ${wan}萬`;

                    const lossEl = document.getElementById('kpi-monthly-loss');
                    const casesEl = document.getElementById('kpi-monthly-cases');

                    if (lossEl) lossEl.textContent = formattedLoss;
                    if (casesEl) casesEl.textContent = (totalCases || 0).toString();
                } else {
                    console.warn('/api/kpi_live 回傳錯誤：', kpiData.error);
                }
            } else {
                console.warn('/api/kpi_live HTTP 錯誤：', kpiResp.status);
            }
        } catch (e) {
            console.warn('載入 KPI (kpi_live) 發生錯誤：', e);
        }

        // 維持舊的 AI 攔截次數 API（如果需要）
        const oldApiResp = await fetch(`${API_BASE}/api/kpi_data`);
        if (oldApiResp.ok) {
            const kpis = await oldApiResp.json();
            const aiEl = document.getElementById('kpi-ai-interceptions');
            if (aiEl) aiEl.textContent = (kpis.ai_interceptions ?? '--').toString();
        }

        // --- 新增：直接向 165dashboard 取得當月月底城市級別資料（取得新竹市 CityId=14）
        // date 參數需為月底的 YYYY-MM-DDT16:00:00Z
        try {
            function endOfMonthDateStringUTC(dt) {
                const y = dt.getUTCFullYear();
                const m = dt.getUTCMonth();
                // 建立下個月的第一天，再減 1 天得到本月最後一天
                const firstOfNext = new Date(Date.UTC(y, m + 1, 1));
                const lastDay = new Date(firstOfNext.getTime() - 24 * 60 * 60 * 1000);
                const yyyy = lastDay.getUTCFullYear();
                const mm = String(lastDay.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(lastDay.getUTCDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}T16:00:00Z`;
            }

            const endpointBase = 'https://165dashboard.tw/CIB_DWS_API/api/Dashboard/GetMonthlyCityFraudData';
            const dateParam = endOfMonthDateStringUTC(new Date());
            const fullUrl = `${endpointBase}?date=${encodeURIComponent(dateParam)}&standardized=true`;

            // 直接嘗試跨域請求；若被阻擋則會在 console 顯示錯誤
            let extResp = null;
            try {
                extResp = await fetch(fullUrl);
            } catch (fetchErr) {
                console.warn('直接向 165dashboard 請求失敗，將嘗試後端 proxy：', fetchErr);
            }
            if (extResp && extResp.ok) {
                let extData = await extResp.json();
                // 嘗試解析不同包裝格式
                if (!Array.isArray(extData)) {
                    if (extData && extData.Data && Array.isArray(extData.Data)) extData = extData.Data;
                    else if (extData && extData.data && Array.isArray(extData.data)) extData = extData.data;
                }

                if (Array.isArray(extData) && extData.length) {
                    // 優先根據 CityId = 14 找新竹市
                    let hsinchu = extData.find(r => Number(r.CityId) === 14 || (r.Name && r.Name.includes('新竹')) );
                    // 若找不到，嘗試在巢狀欄位中搜尋
                    if (!hsinchu) {
                        hsinchu = extData.find(r => (r.Name && r.Name.includes('新竹')) );
                    }

                    if (hsinchu) {
                        const casesEl = document.getElementById('kpi-monthly-cases');
                        const aiEl = document.getElementById('kpi-ai-interceptions');

                        // Cases 與 Losses 資料可能是數字字串或數字
                        const casesVal = Number(hsinchu.Cases ?? hsinchu.cases ?? 0) || 0;
                        const lossesVal = Number(hsinchu.Losses ?? hsinchu.losses ?? 0) || 0;

                        // 我們把其中一格顯示「新竹財損」，另一格顯示「新竹案件數」
                        if (casesEl) {
                            // 顯示財損，API 的 Losses 原專案多為以「萬」為單位，保留小數一位
                            const lossText = `${Number(lossesVal).toLocaleString(undefined, {maximumFractionDigits:1})} 萬`;
                            casesEl.textContent = lossText;
                        }
                        if (aiEl) {
                            aiEl.textContent = `${Math.round(casesVal).toLocaleString()}`;
                        }
                    } else {
                        console.warn('165dashboard API 回傳，但找不到新竹市 (CityId=14)。回傳資料 sample:', extData.slice(0,5));
                    }
                } else {
                    console.warn('165dashboard API 回傳格式非預期或為空：', extData);
                }
            } else {
                // 若直接請求失敗（可能為 CORS），嘗試使用後端 proxy
                try {
                    const proxyDate = dateParam.split('T')[0];
                    const proxyResp = await fetch(`${API_BASE}/api/monthly_city_fraud?date=${proxyDate}`);
                    if (proxyResp.ok) {
                        let extData = await proxyResp.json();
                        if (!Array.isArray(extData)) {
                            if (extData && extData.Data && Array.isArray(extData.Data)) extData = extData.Data;
                            else if (extData && extData.data && Array.isArray(extData.data)) extData = extData.data;
                        }
                        if (Array.isArray(extData) && extData.length) {
                            let hsinchu = extData.find(r => Number(r.CityId) === 14 || (r.Name && r.Name.includes('新竹')) );
                            if (!hsinchu) hsinchu = extData.find(r => (r.Name && r.Name.includes('新竹')) );
                            if (hsinchu) {
                                const casesEl = document.getElementById('kpi-monthly-cases');
                                const aiEl = document.getElementById('kpi-ai-interceptions');
                                const casesVal = Number(hsinchu.Cases ?? hsinchu.cases ?? 0) || 0;
                                const lossesVal = Number(hsinchu.Losses ?? hsinchu.losses ?? 0) || 0;
                                if (casesEl) casesEl.textContent = `${Number(lossesVal).toLocaleString(undefined, {maximumFractionDigits:1})} 萬`;
                                if (aiEl) aiEl.textContent = `${Math.round(casesVal).toLocaleString()}`;
                            } else {
                                console.warn('proxy 回傳，但找不到新竹市 (CityId=14)。sample:', extData.slice(0,5));
                            }
                        } else {
                            console.warn('proxy 回傳格式非預期或為空：', extData);
                        }
                    } else {
                        console.warn('後端 proxy /api/monthly_city_fraud 請求失敗 HTTP:', proxyResp && proxyResp.status);
                    }
                } catch (proxyErr) {
                    console.warn('使用後端 proxy 取得 165dashboard 資料失敗：', proxyErr);
                }
            }
        } catch (e) {
            console.warn('取得 165dashboard 資料時發生錯誤（可能為 CORS 或 網路問題）：', e);
        }


        // 2. 詐騙類型分佈：優先使用 live KPI 的 TopFive（若有），否則回退到本地 /api/scam_types_data
                // 2. 顯示兩個圓餅圖：一個為詐騙件數 (Cases)，一個為財損 (Losses)
                const countsCtx = document.getElementById('scamCountsChart');
                const lossesCtx = document.getElementById('scamLossesChart');
                const palette = ['#00f3ff', '#bc13fe', '#00ff87', '#ffdd00', '#ff005d'];

                if (liveKpi && Array.isArray(liveKpi.TopFive) && liveKpi.TopFive.length) {
                    const labels = liveKpi.TopFive.map(i => i.Name || i.name || '未知');
                    const counts = liveKpi.TopFive.map(i => Number(i.Cases || i.cases || 0));
                    const losses = liveKpi.TopFive.map(i => Number(i.Losses || i.losses || 0));

                    if (countsCtx) {
                            window.scamCountsChart = new Chart(countsCtx, {
                                type: 'doughnut',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        data: counts,
                                        backgroundColor: palette.slice(0, labels.length),
                                        borderColor: 'rgba(0,0,0,0.3)',
                                        borderWidth: 0,
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    radius: '75%',
                                    cutout: '50%',
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            callbacks: {
                                                label: function(context) {
                                                    const v = context.parsed;
                                                    return `${context.label}: ${v} 件`;
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                    }

                    if (lossesCtx) {
                                window.scamLossesChart = new Chart(lossesCtx, {
                                type: 'doughnut',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        data: losses,
                                        backgroundColor: palette.slice(0, labels.length),
                                        borderColor: 'rgba(0,0,0,0.3)',
                                        borderWidth: 0,
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    radius: '75%',
                                    cutout: '50%',
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            callbacks: {
                                                label: function(context) {
                                                    const v = context.parsed;
                                                    return `${context.label}: ${v} 萬`;
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                    }
                        // Build custom legend on the left column
                        try {
                            const legendEl = document.getElementById('scamLegend');
                            if (legendEl) {
                                legendEl.innerHTML = ''; // clear
                                labels.forEach((lab, idx) => {
                                    const item = document.createElement('div');
                                        item.style.display = 'flex';
                                        item.style.alignItems = 'center';
                                        item.style.gap = '10px';
                                        item.style.fontSize = '13px';
                                        item.style.color = '#e6eef8';
                                        item.style.paddingBottom = '8px';

                                        const colorBox = document.createElement('span');
                                        colorBox.style.width = '14px';
                                        colorBox.style.height = '14px';
                                        colorBox.style.display = 'inline-block';
                                        colorBox.style.borderRadius = '3px';
                                        colorBox.style.background = palette[idx % palette.length];
                                        colorBox.style.flex = '0 0 14px';

                                        const title = document.createElement('div');
                                        title.textContent = lab;
                                        title.style.fontSize = '13px';
                                        title.style.color = '#ffffff';

                                        item.appendChild(colorBox);
                                        item.appendChild(title);
                                        legendEl.appendChild(item);
                                });
                            }
                        } catch (err) {
                            console.warn('建立自訂 legend 失敗：', err);
                        }
                } else {
                    // fallback to local scam_types_data for counts chart
                    const scamTypesResp = await fetch(`${API_BASE}/api/scam_types_data`);
                    if (scamTypesResp.ok) {
                        const scamTypesData = await scamTypesResp.json();
                        if (countsCtx && scamTypesData.labels && scamTypesData.data) {
                            new Chart(countsCtx, {
                                type: 'pie',
                                data: { labels: scamTypesData.labels, datasets: [{ data: scamTypesData.data, backgroundColor: palette.slice(0, scamTypesData.labels.length), borderColor: 'rgba(0,0,0,0.3)' }] },
                                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)' } } } }
                            });
                        }
                    }
                    // losses chart: show empty message or placeholder
                    if (lossesCtx) {
                        // create an empty chart with a single neutral slice to avoid blank space
                        new Chart(lossesCtx, {
                            type: 'pie',
                            data: { labels: ['無資料'], datasets: [{ data: [1], backgroundColor: ['rgba(100,100,100,0.3)'], borderColor: 'rgba(0,0,0,0.3)' }] },
                            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                        });
                    }
                }

        // 3. 載入受害者年齡分佈並繪製長條圖
        const victimAgesResp = await fetch(`${API_BASE}/api/victim_ages_data`);
        if (victimAgesResp.ok) {
            const victimAgesData = await victimAgesResp.json();
            const barCtx = document.getElementById('victimAgesChart');
            if (barCtx && victimAgesData.labels && victimAgesData.data) {
                new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: victimAgesData.labels,
                        datasets: [{
                            label: '件數',
                            data: victimAgesData.data,
                            backgroundColor: 'rgba(0, 243, 255, 0.6)',
                            borderColor: '#00f3ff',
                            borderWidth: 1,
                        }]
                    },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        indexAxis: 'y', // 改為橫向長條圖
                        scales: { 
                            x: { 
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            },
                            y: {
                                grid: { display: false },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        }

        // 4. 取得城市等級案件資料（由後端代理 165dashboard）並繪製排名長條圖
        //    我們會嘗試讀取今天的資料，並把其中的 City Name / Cases 畫成橫向長條圖；若包含「新竹市」會特別高亮
        const dateStr = new Date().toISOString().split('T')[0];
        const cityResp = await fetch(`${API_BASE}/api/daily_city_fraud?date=${dateStr}`);
        if (cityResp.ok) {
            let cityData = await cityResp.json();
            console.debug('DEBUG /api/daily_city_fraud ->', cityData);
            // If the backend returned an object wrapper, try to extract common array fields
            if (!Array.isArray(cityData)) {
                if (cityData && cityData.Data && Array.isArray(cityData.Data)) cityData = cityData.Data;
                else if (cityData && cityData.data && Array.isArray(cityData.data)) cityData = cityData.data;
                else if (cityData && cityData.items && Array.isArray(cityData.items)) cityData = cityData.items;
                else if (cityData && cityData.Body && Array.isArray(cityData.Body)) cityData = cityData.Body;
                else if (cityData && cityData.body && Array.isArray(cityData.body)) cityData = cityData.body;
                else if (cityData && typeof cityData === 'object') {
                    // attempt to convert numeric-keyed object to array
                    const numericKeys = Object.keys(cityData).filter(k => /^\d+$/.test(k));
                    if (numericKeys.length) {
                        cityData = numericKeys.map(k => cityData[k]);
                    }
                }
            }
            if (!Array.isArray(cityData) || !cityData.length) {
                console.warn('No city data available or unexpected format:', cityData);
            }
            const districtCtx = document.getElementById('hsinchuDistrictChart');
            if (districtCtx && Array.isArray(cityData) && cityData.length) {
                // sort by Cases descending (some APIs already return sorted)
                const sorted = cityData.slice().sort((a,b) => (Number(b.Cases||b.cases||0) - Number(a.Cases||a.cases||0)));
                const labels = sorted.map(r => r.Name || r.name || '未知');
                const casesData = sorted.map(r => Number(r.Cases || r.cases || 0));
                const lossesData = sorted.map(r => Number(r.Losses || r.losses || 0));

                // detect index of 新竹市 to highlight
                const hsinchuIdx = labels.findIndex(l => l.includes('新竹'));

                const defaultColor = 'rgba(188, 19, 254, 0.6)';
                const highlightColor = 'rgba(255, 99, 71, 0.85)';
                const bgColors = labels.map((_,i) => (i === hsinchuIdx ? highlightColor : defaultColor));

                // destroy previous chart if exists
                if (window.hsinchuDistrictChart && typeof window.hsinchuDistrictChart.destroy === 'function') window.hsinchuDistrictChart.destroy();
                window.hsinchuDistrictChart = new Chart(districtCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '通報案件數',
                            data: casesData,
                            backgroundColor: bgColors,
                            borderColor: bgColors.map(c => c.replace(/0\.6|0\.85/, '1') ),
                            borderWidth: 1,
                        }]
                    },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        indexAxis: 'y',
                        scales: {
                            x: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            },
                            y: {
                                grid: { display: false },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            title: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(ctx) {
                                        const v = ctx.raw;
                                        const loss = lossesData[ctx.dataIndex] || 0;
                                        return `案件: ${v} 件 ／ 財損: ${loss} 萬`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        // 5. 載入熱區圖資料並初始化地圖
        loadGoogleMaps();

    } catch (e) {
        console.warn('loadDashboardData error:', e);
    }
}

async function loadGoogleMaps() {
    try {
        const response = await fetch(`${API_BASE}/api/maps_key`);
        let data = null;
        try {
            data = await response.json();
        } catch (e) {
            console.error('解析 /api/maps_key 回傳 JSON 失敗：', e);
        }

        if (!response.ok || !data || !data.key) {
            console.error('無效的 /api/maps_key 回應：', response.status, data);
            const mapEl = document.getElementById('map');
            if (mapEl) mapEl.textContent = '地圖載入失敗：無法取得有效的 API 金鑰。請確認後端 `/api/maps_key` 回傳 { key: "..." }。';
            return;
        }

        const script = document.createElement('script');
        // Load without callback parameter and call initMap on load to follow recommended loading pattern.
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(data.key)}&libraries=visualization`;
        script.defer = true;
        script.async = true;
        // hint browser to lazy-load the script for better performance
        try { script.setAttribute('loading', 'lazy'); } catch(e) {}
        script.addEventListener('error', (ev) => {
            console.error('Google Maps script failed to load', ev);
            const mapEl = document.getElementById('map');
            if (mapEl) mapEl.textContent = '地圖載入失敗：無法載入 Google Maps 腳本。請檢查 API 金鑰或網路存取。';
        });
        script.addEventListener('load', () => {
            // call initMap if available
            if (typeof initMap === 'function') {
                try { initMap(); } catch (e) { console.error('initMap error after script load:', e); }
            } else {
                console.warn('Google Maps script loaded but initMap() not found.');
            }
        });
        document.head.appendChild(script);
    } catch (error) {
        console.error("無法載入 Google Maps API 金鑰:", error);
        document.getElementById('map').textContent = '地圖載入失敗：無法取得 API 金鑰。';
    }
}

async function initMap() {
    // 檢查 Google Maps API 是否已載入
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.warn("Google Maps API尚未載入，無法初始化地圖。");
        return;
    }

    // 深色地圖樣式
    const mapStyle = [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
        { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64779e" }] },
        { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#4b6878" }] },
        { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
        { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
        { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
        { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
        { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
        { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3C7680" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
        { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
        { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#255763" }] },
        { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#b0d5ce" }] },
        { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#023e58" }] },
        { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
        { featureType: "transit", elementType: "labels.text.stroke", stylers: [{ color: "#1d2c4d" }] },
        { featureType: "transit.line", elementType: "geometry.fill", stylers: [{ color: "#283d6a" }] },
        { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#3a4762" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
        { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
    ];

    try {
        const map = new google.maps.Map(document.getElementById("map"), {
            center: { lat: 24.804, lng: 120.972 },
            zoom: 12,
            styles: mapStyle,
            mapTypeControl: true,
            streetViewControl: true,
            zoomControl: true,
            fullscreenControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.TOP_RIGHT,
                mapTypeIds: ['roadmap', 'satellite', 'hybrid']
            },
        });

        // --- Store all layers in an object for easy management ---
        const layers = {};
        // expose for debugging from console
        window.dashboardLayers = layers;
        const infoWindow = new google.maps.InfoWindow();
        let activeLayer = 'overall_heatmap'; // Default active layer

        // --- 1. (移除) 整體 heatmap 已移除，改以單一里標記系統表示累積強度 ---

        // --- 2. 案件標記圖層 ---
        // 已移除「案件標記」圖層 (markers) — 若需再次啟用，請還原此區塊。
        
        // --- 3. 新增的五種詐騙熱區圖層 ---
        const villageScamResp = await fetch(`${API_BASE}/api/village_scam_data`);
        if(villageScamResp.ok) {
            const villageScamData = await villageScamResp.json();
            if(villageScamData && !villageScamData.error && Array.isArray(villageScamData)) {

                        // 加權分數設定與計算函式（35%,10%,20%,25%,10%）
                        const WEIGHTS = {
                            investment: 0.35,
                            shopping: 0.10,
                            auction: 0.20,
                            dating: 0.25,
                            marriage: 0.10
                        };
                        function computeWeighted(p) {
                            const inv = Number(p.investment) || 0;
                            const shop = Number(p.shopping) || 0;
                            const auc = Number(p.auction) || 0;
                            const dat = Number(p.dating) || 0;
                            const mar = Number(p.marriage) || 0;
                            const score = inv * WEIGHTS.investment + shop * WEIGHTS.shopping + auc * WEIGHTS.auction + dat * WEIGHTS.dating + mar * WEIGHTS.marriage;
                            return score; // 0..100 (加權後範圍仍在 0..100 內)
                        }

                const scamTypes = {
                    investment: '投資',
                    shopping: '網購',
                    auction: '假網拍',
                    dating: '假交友',
                    marriage: '徵婚'
                };

                // 建立單一里標記系統：每個里一個 marker，依目前被勾選的類型計算強度 (累加)，並用綠→黃→紅漸層與大小表示
                // defensive parsing: 支援不同欄位名稱，避免使用未宣告的識別字 (例如 p里名)
                const villages = villageScamData.map(p => {
                    const name = p.name || p['里名'] || p['village'] || p['里'] || p['name'] || '未知里名';
                    const lat = Number((p.location && (p.location.lat || p.location.latitude)) || p.lat || p.latitude || NaN);
                    const lng = Number((p.location && (p.location.lng || p.location.longitude)) || p.lng || p.longitude || NaN);
                    return { name, lat, lng, raw: p };
                });

                if (!Array.isArray(villages) || villages.length === 0) {
                    console.warn('village_scam_data 解析後為空陣列:', villageScamData);
                }
                console.debug('villages sample (first 10):', villages.slice(0, 10));

                const markersMap = {}; // name -> marker
                const circlesMap = {}; // name -> google.maps.Circle

                // helper: interpolate color from green->yellow->red based on t in [0,1]
                function getColorForValue(t) {
                    t = Math.max(0, Math.min(1, t));
                    if (t <= 0.5) {
                        // green (0,1,0) -> yellow (1,1,0)
                        const nt = t / 0.5;
                        const r = Math.round(0 + nt * 255);
                        const g = 255;
                        const b = 0;
                        return `rgb(${r},${g},${b})`;
                    } else {
                        // yellow -> red
                        const nt = (t - 0.5) / 0.5;
                        const r = 255;
                        const g = Math.round(255 - nt * 255);
                        const b = 0;
                        return `rgb(${r},${g},${b})`;
                    }
                }

                // create markers (one per village) and record name in the stored object
                villages.forEach((v, idx) => {
                    if (!isFinite(v.lat) || !isFinite(v.lng)) {
                        console.warn('跳過無效座標的里：', v.name, v.lat, v.lng, v.raw);
                        return;
                    }

                    const m = new google.maps.Marker({
                        position: { lat: v.lat, lng: v.lng },
                        map: null,
                        title: v.name,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: '#000000',
                            fillOpacity: 1,
                            scale: 2,
                            strokeColor: '#ffffff',
                            strokeWeight: 1
                        }
                    });

                    m.addListener('click', () => {
                        const p = v.raw;
                        const content = `
                            <div style="min-width:180px; font-family: 'Noto Sans TC', sans-serif; color:#111;">
                                <h4 style="margin:0 0 6px 0;">${v.name}</h4>
                                <div style="font-size:12px; line-height:1.4;">
                                    <div><strong>投資：</strong>${p.investment ?? '--'}</div>
                                    <div><strong>網購：</strong>${p.shopping ?? '--'}</div>
                                    <div><strong>假網拍：</strong>${p.auction ?? '--'}</div>
                                    <div><strong>假交友：</strong>${p.dating ?? '--'}</div>
                                    <div><strong>徵婚：</strong>${p.marriage ?? '--'}</div>
                                    <div><strong>加權分數（35% / 10% / 20% / 25% / 10%）：</strong>${computeWeighted(p).toFixed(2)}</div>
                                </div>
                            </div>`;
                        infoWindow.setContent(content);
                        infoWindow.open(map, m);
                    });

                    // store name explicitly to avoid depending on raw.name
                    markersMap[v.name] = { marker: m, data: v.raw, name: v.name };

                    // temporary visual debug: for first 3 villages add a visible debug marker so we can confirm markers appear
                    if (idx < 3) {
                        const dbg = new google.maps.Marker({
                            position: { lat: v.lat, lng: v.lng },
                            map: map,
                            title: `(DEBUG) ${v.name}`,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: '#ff0000',
                                fillOpacity: 0.9,
                                scale: 6,
                                strokeColor: '#ffffff',
                                strokeWeight: 1
                            }
                        });
                        // auto-remove after 8 seconds to avoid permanent clutter
                        setTimeout(() => dbg.setMap(null), 8000);
                    }
                });

                console.debug('markersMap populated, size =', Object.keys(markersMap).length);



                // create combined heatmap layer (initially hidden)
                let combinedHeatmap = null;
                const heatGradient = [
                    'rgba(0,255,0,0)',
                    'rgba(0,255,0,0.6)',
                    'rgba(255,255,0,0.75)',
                    'rgba(255,165,0,0.85)',
                    'rgba(255,0,0,0.95)'
                ];

                // attach markersMap and update function to layers for external usage
                layers['markersMap'] = markersMap;
                layers['circlesMap'] = circlesMap;
                layers['circlesEnabled'] = false;
                layers['combinedHeatmap'] = () => combinedHeatmap;

                // 更新 markers 與 heatmap 的函式（多類型時以『疊加多點』方式強化紅色融合）
                layers['updateMarkers'] = function updateMarkers(selectedTypes) {
                    console.debug('updateMarkers called with types:', selectedTypes);
                    const typeKeys = selectedTypes || [];
                    const heatPoints = [];

                    console.debug('markersMap size:', Object.keys(markersMap).length);

                    // 顏色對照（單一類型時使用）
                    const palette = {
                        investment: '#ff4d4f',
                        shopping: '#2db7f5',
                        auction: '#faad14',
                        dating: '#eb2f96',
                        marriage: '#52c41a'
                    };

                    Object.values(markersMap).forEach(({ marker, data }) => {
                        // Black marker 永遠顯示（即使某些值為 0），以利點擊資訊
                        marker.setMap(map);

                        // 疊加多個 heat points：每個勾選類型一個點，權重依該類型數值
                        typeKeys.forEach(k => {
                            const val = Number(data[k]) || 0;
                            if (val > 0) {
                                // 權重：val 0..100 -> (val/100)* 基底 60，並乘上類型總數的 0.4 以略微增加融合
                                const weight = (val / 100) * 60 * (1 + (typeKeys.length - 1) * 0.4);
                                heatPoints.push({
                                    location: new google.maps.LatLng(Number(data.location.lat), Number(data.location.lng)),
                                    weight: weight
                                });
                            }
                        });

                        // Circles 更新（若啟用）
                        if (layers['circlesEnabled']) {
                            let valueForCircle = 0;
                            let colorForCircle = '#00f3ff'; // 多類型或預設中性顏色
                            if (typeKeys.length === 1) {
                                const k = typeKeys[0];
                                valueForCircle = Number(data[k]) || 0;
                                colorForCircle = palette[k] || colorForCircle;
                            } else {
                                // 多選時使用加總
                                let tmpSum = 0;
                                typeKeys.forEach(k => { tmpSum += Number(data[k]) || 0; });
                                valueForCircle = tmpSum;
                            }

                            const radiusMeters = Math.max(20, Math.min(600, 30 + valueForCircle * 5));

                            let circle = circlesMap[data.name];
                            if (!circle) {
                                circle = new google.maps.Circle({
                                    strokeColor: colorForCircle,
                                    strokeOpacity: 0.9,
                                    strokeWeight: 1,
                                    fillColor: colorForCircle,
                                    fillOpacity: 0.2,
                                    center: { lat: Number(data.location.lat), lng: Number(data.location.lng) },
                                    radius: radiusMeters,
                                    map: null,
                                    clickable: true
                                });
                                circle.addListener('click', () => {
                                    const content = `
                                        <div style="min-width:180px; font-family: 'Noto Sans TC', sans-serif; color:#111;">
                                            <h4 style="margin:0 0 6px 0;">${data.name}</h4>
                                            <div style="font-size:12px; line-height:1.4;">
                                                <div><strong>投資：</strong>${data.investment ?? '--'}</div>
                                                <div><strong>網購：</strong>${data.shopping ?? '--'}</div>
                                                <div><strong>假網拍：</strong>${data.auction ?? '--'}</div>
                                                <div><strong>假交友：</strong>${data.dating ?? '--'}</div>
                                                <div><strong>徵婚：</strong>${data.marriage ?? '--'}</div>
                                                <div><strong>加權分數（35% / 10% / 20% / 25% / 10%）：</strong>${computeWeighted(data).toFixed(2)}</div>
                                            </div>
                                        </div>`;
                                    infoWindow.setContent(content);
                                    infoWindow.setPosition({ lat: Number(data.location.lat), lng: Number(data.location.lng) });
                                    infoWindow.open(map);
                                });
                                circlesMap[data.name] = circle;
                            }

                            circle.setOptions({
                                center: { lat: Number(data.location.lat), lng: Number(data.location.lng) },
                                radius: radiusMeters,
                                strokeColor: colorForCircle,
                                fillColor: colorForCircle
                            });
                            if (valueForCircle > 0) {
                                circle.setMap(map);
                            } else {
                                circle.setMap(null);
                            }
                        } else {
                            // 若未啟用 circles，確保全部隱藏
                            const circle = circlesMap[data.name];
                            if (circle) circle.setMap(null);
                        }
                    });

                    console.debug('heatPoints length after collect:', heatPoints.length);

                    if (!heatPoints.length) {
                        if (combinedHeatmap) combinedHeatmap.setMap(null);
                        return;
                    }

                    // 擴充漸層：增加中階與高階紅橘層次以呈現強烈融合
                    const fusionGradient = [
                        'rgba(0,255,0,0)',
                        'rgba(0,255,0,0.5)',
                        'rgba(170,255,0,0.7)',
                        'rgba(255,255,0,0.85)',
                        'rgba(255,180,0,0.9)',
                        'rgba(255,120,0,0.95)',
                        'rgba(255,60,0,0.98)',
                        'rgba(255,0,0,1)'
                    ];

                    if (!combinedHeatmap) {
                        combinedHeatmap = new google.maps.visualization.HeatmapLayer({
                            data: heatPoints,
                            map: map,
                            radius: 35,
                            opacity: 0.75,
                        });
                        combinedHeatmap.set('gradient', fusionGradient);
                    } else {
                        combinedHeatmap.setData(heatPoints);
                        combinedHeatmap.set('gradient', fusionGradient);
                        combinedHeatmap.set('radius', 35); // 略微縮小半徑使疊加更集中
                        combinedHeatmap.set('opacity', 0.75);
                        combinedHeatmap.setMap(map);
                    }
                };
            }
        }


        // --- 4. 建立圖層切換控制 UI (使用 Checkbox，若頁面上有 #map-layer-controls 則使用它) ---
        function createLayerControls(container) {
            container.innerHTML = '';
            const title = document.createElement('h4');
            title.style.margin = '0 0 8px 0';
            title.style.fontSize = '14px';
            title.style.fontWeight = '700';
            title.textContent = 'MAP LAYERS';
            container.appendChild(title);

            // 圈圈圖層切換（預設關閉）
            const circleWrapper = document.createElement('label');
            circleWrapper.style.display = 'flex';
            circleWrapper.style.alignItems = 'center';
            circleWrapper.style.gap = '8px';
            circleWrapper.style.fontSize = '12px';
            circleWrapper.style.margin = '0 0 8px 0';
            const circleCb = document.createElement('input');
            circleCb.type = 'checkbox';
            circleCb.checked = false;
            circleCb.addEventListener('change', () => {
                layers['circlesEnabled'] = !!circleCb.checked;
                const checked = Array.from(container.querySelectorAll('input[type="checkbox"][data-key]:checked')).map(c => c.dataset.key);
                if (layers['updateMarkers']) layers['updateMarkers'](checked);
            });
            const circleSpan = document.createElement('span');
            circleSpan.textContent = '顯示圈圈';
            circleWrapper.appendChild(circleCb);
            circleWrapper.appendChild(circleSpan);
            container.appendChild(circleWrapper);

            const items = [
                {id: 'investment', label: '投資', key: 'investment'},
                {id: 'shopping', label: '網購', key: 'shopping'},
                {id: 'auction', label: '假網拍', key: 'auction'},
                {id: 'dating', label: '假交友', key: 'dating'},
                {id: 'marriage', label: '徵婚', key: 'marriage'}
            ];

            items.forEach(it => {
                const wrapper = document.createElement('label');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '8px';
                wrapper.style.fontSize = '12px';
                wrapper.style.marginBottom = '6px';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = (it.id === 'investment');
                cb.dataset.key = it.key;
                cb.addEventListener('change', () => {
                    // 收集所有被勾選的類型 key，並呼叫 updateMarkers
                    const checked = Array.from(container.querySelectorAll('input[type="checkbox"][data-key]:checked')).map(c => c.dataset.key);
                    if (layers['updateMarkers']) {
                        layers['updateMarkers'](checked);
                    }
                });
                wrapper.appendChild(cb);
                const span = document.createElement('span');
                span.textContent = it.label;
                wrapper.appendChild(span);
                container.appendChild(wrapper);
            });
        }

        // 如果有 page DOM container，使用它；否則把 control 放到地圖控制欄
        const domContainer = document.getElementById('map-layer-controls');
        if (domContainer) {
            domContainer.style.minWidth = '160px';
            domContainer.style.padding = '8px';
            domContainer.style.background = 'rgba(5,5,5,0.7)';
            domContainer.style.border = '1px solid rgba(255,255,255,0.08)';
            domContainer.style.borderRadius = '6px';
            // Create controls inside the existing DOM container, then move it into the map's LEFT_TOP controls
            createLayerControls(domContainer);
            try {
                map.controls[google.maps.ControlPosition.LEFT_TOP].push(domContainer);
            } catch (e) {
                // fallback: if map not ready or push fails, leave it in DOM
                console.warn('無法將 controls 加入地圖 LEFT_TOP 控制欄:', e);
            }
        } else {
            const layerControlDiv = document.createElement("div");
            layerControlDiv.style.margin = "10px";
            layerControlDiv.style.padding = "8px";
            layerControlDiv.style.backgroundColor = "rgba(5, 5, 5, 0.8)";
            layerControlDiv.style.border = "1px solid rgba(255, 255, 255, 0.1)";
            layerControlDiv.style.borderRadius = "3px";
            layerControlDiv.style.color = "#fff";
            layerControlDiv.style.fontFamily = "'Orbitron', sans-serif";
            map.controls[google.maps.ControlPosition.LEFT_TOP].push(layerControlDiv);
            createLayerControls(layerControlDiv);
        }

        // 預設勾選投資類別並更新 markers 樣式
        try {
            const cb = document.querySelector('#map-layer-controls input[type="checkbox"][data-key="investment"]');
            if (cb) cb.checked = true;
            if (layers['updateMarkers']) layers['updateMarkers'](['investment']);
        } catch (e) {
            console.warn('無法預設顯示 investment layer:', e);
        }


    } catch (error) {
        console.error("初始化地圖失敗:", error);
        document.getElementById('map').textContent = '地圖載入時發生錯誤。';
    }
}