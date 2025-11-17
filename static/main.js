// static/main.js (已整合所有功能)

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
                const response = await fetch("/analyze", { // 使用相對路徑
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ text: textToAnalyze })
                });

                if (!response.ok) {
                    throw new Error(`API 請求失敗 (HTTP ${response.status})`);
                }

                // 取得 API 回傳的 JSON (第一層)
                const data = await response.json();
                
                // 關鍵：解析 AI 產出的 JSON "字串" (第二層)
                const llmResult = JSON.parse(data.raw_llm_output);
                
                // 顯示格式化的結果
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
            riskText = `低風險 (${llmResult.risk_score}%)`;
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
    const simBody = simChat.querySelector(".sim-body");
    const simFooter = simChat.querySelector(".sim-footer");
    const simInput = simFooter.querySelector("input[type='text']");
        // 儲存對話歷史（僅 user/scammer），用於產生續聊
    const chatHistory = [];
    let presetPersona = null;
    let presetTitle = null;

        // 預先在頁面載入時就向後端取得一段「預設腳本」，減少點擊等待時間
        const prefetchPromise = (async () => {
            try {
                    const resp = await fetch("/preset_script");
                    const data = await resp.json();
                    // 保存人設與標題以供後續續聊與 UI 使用
                    presetPersona = data.persona || null;
                    presetTitle = data.title || null;
                    return Array.isArray(data.script) ? data.script : [];
            } catch (e) {
                console.warn("預先生成腳本失敗。", e);
                return [];
            }
        })();

    // 點擊「開始模擬」按鈕
        startSimButton.addEventListener("click", async () => {
            // 顯示聊天室並隱藏按鈕
            simChat.style.display = "block";
            startSimButton.style.display = "none";
            
            // 清空舊訊息
            simBody.innerHTML = ""; 

            // 優先使用預先生成的腳本，避免點擊時等待
            let script = [];
            try {
                script = await prefetchPromise;
            } catch (e) {
                console.warn("取得預設腳本失敗。", e);
                // 若仍失敗，留空即可（後續依然可續聊）
                script = [];
            }

            // 只顯示到「詐騙方」的最後一句，讓使用者接續回覆
            let displayScript = script.slice();
            if (displayScript.length && displayScript[displayScript.length - 1].from !== "scammer") {
                // 若最後一句是 user，就砍掉最後一句，確保結尾是 scammer
                displayScript.pop();
            }

            // 顯示腳本（若為空則不顯示）
            let delay = 500; // 0.5 秒
            displayScript.forEach((message, index) => {
                setTimeout(() => {
                    appendSimMessage(message.from, message.text); // 也會同步記錄到 chatHistory
                }, delay * (index + 1));
            });

            // 若有標題，更新聊天室標頭
            const simHeader = simChat.querySelector('.sim-header');
            if (simHeader && presetTitle) {
                simHeader.textContent = `${presetTitle}`;
            }

            // 允許輸入（移除 disabled）
            if (simInput) {
                simInput.disabled = false;
                simInput.placeholder = "請回覆詐騙訊息（按 Enter 送出）";

                // 綁定送出事件（Enter）
                simInput.addEventListener("keydown", async (ev) => {
                    if (ev.key === "Enter") {
                        const text = simInput.value.trim();
                        if (!text) return;
                        // 顯示使用者訊息
                        appendSimMessage("user", text); // 也會同步記錄
                        simInput.value = "";

                        // 不再顯示或呼叫 AI 分析，專注於對話續聊

                        // 無論分析是否成功，都嘗試讓詐騙者續聊
                        try {
                            const historyPayload = chatHistory.filter(m => m.from === "user" || m.from === "scammer");
                            const replyResp = await fetch("/chat_reply", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    scenario: "fake_investment",
                                    persona: presetPersona,
                                    history: historyPayload.slice(-10)
                                })
                            });
                            let replyData = await replyResp.json();

                            const recentScammers = [...chatHistory].filter(m => m.from === "scammer").slice(-3);
                            const isDup = replyData && replyData.text && recentScammers.some(m => m.text.trim() === replyData.text.trim());

                            let attempts = 0;
                            while (isDup && attempts < 2) {
                                attempts += 1;
                                try {
                                    const retryResp = await fetch("/chat_reply", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            scenario: "fake_investment",
                                            persona: presetPersona,
                                            history: chatHistory.slice(-10)
                                        })
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
                            } else {
                                // 不插入 system 泡泡，避免干擾對話；亦可選擇提示一條淡化訊息
                            }
                        } catch (err) {
                            console.error("/chat_reply 失敗：", err);
                            appendSimMessage("system", "（系統）產生續聊失敗。", false);
                        }
                    }
                });
            }
        });

        // 自動開始：進入頁面後自動觸發一次（保留按鈕做為備援）
        setTimeout(() => {
            if (getComputedStyle(startSimButton).display !== "none") {
                startSimButton.click();
            }
        }, 0);

        function appendSimMessage(from, text, record = true) {
            const msgElement = document.createElement("div");
            msgElement.classList.add("sim-message", from);
            msgElement.textContent = text;
            simBody.appendChild(msgElement);
            simBody.scrollTop = simBody.scrollHeight;
            if (record && (from === "user" || from === "scammer")) {
                chatHistory.push({ from, text });
            }
        }
    }

}); // 確保 DOMContentLoaded 是最外層的括號

// ------------- 儀表板：載入資料與繪圖 -------------
async function loadDashboardData() {
    try {
        const resp = await fetch('/api/dashboard_data');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // KPI
        const kpis = data.kpis || {};
        const lossEl = document.getElementById('kpi-monthly-loss');
        const casesEl = document.getElementById('kpi-monthly-cases');
        const aiEl = document.getElementById('kpi-ai-interceptions');
        if (lossEl) lossEl.textContent = kpis.monthly_loss ?? '--';
        if (casesEl) casesEl.textContent = (kpis.monthly_cases ?? '--').toString();
        if (aiEl) aiEl.textContent = (kpis.ai_interceptions ?? '--').toString();

        // 如果沒有載入 Chart.js，則不畫圖
        if (typeof Chart === 'undefined') return;

        // 圓餅圖：詐騙類型
        const scamTypes = data.scam_types || { labels: [], data: [] };
        const pieCtx = document.getElementById('scamTypesChart');
        if (pieCtx) {
            new Chart(pieCtx, {
                type: 'pie',
                data: {
                    labels: scamTypes.labels,
                    datasets: [{
                        data: scamTypes.data,
                        backgroundColor: ['#005a9c', '#00a6fb', '#13c4a3', '#f77f00', '#adb5bd'],
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

        // 長條圖：受害族群年齡
        const victimAges = data.victim_ages || { labels: [], data: [] };
        const barCtx = document.getElementById('victimAgesChart');
        if (barCtx) {
            new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: victimAges.labels,
                    datasets: [{
                        label: '件數',
                        data: victimAges.data,
                        backgroundColor: '#00a6fb',
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        // 若成功載入動態儀表板，可選擇隱藏備援圖
        const fallback = document.querySelector('.dashboard-fallback');
        if (fallback) fallback.style.display = 'none';
    } catch (e) {
        // 若失敗，保留備援圖
        console.warn('loadDashboardData error:', e);
    }
}