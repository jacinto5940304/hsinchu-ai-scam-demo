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
                    const resp = await fetch(`${API_BASE}/preset_script`);
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
                            const replyResp = await fetch(`${API_BASE}/chat_reply`, {
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
                                    const retryResp = await fetch(`${API_BASE}/chat_reply`, {
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

            // 根據發送者添加對齊 class
            if (from === 'user') {
                msgElement.classList.add('self-end'); // 靠右
            } else {
                msgElement.classList.add('self-start'); // 靠左
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
        // 1. 載入 KPI 數據
        const kpiResp = await fetch(`${API_BASE}/api/kpi_data`);
        if (kpiResp.ok) {
            const kpis = await kpiResp.json();
            const lossEl = document.getElementById('kpi-monthly-loss');
            const casesEl = document.getElementById('kpi-monthly-cases');
            const aiEl = document.getElementById('kpi-ai-interceptions');
            if (lossEl) lossEl.textContent = kpis.monthly_loss ?? '--';
            if (casesEl) casesEl.textContent = (kpis.monthly_cases ?? '--').toString();
            if (aiEl) aiEl.textContent = (kpis.ai_interceptions ?? '--').toString();
        }

        // 2. 載入詐騙類型分佈並繪製圓餅圖
        const scamTypesResp = await fetch(`${API_BASE}/api/scam_types_data`);
        if (scamTypesResp.ok) {
            const scamTypesData = await scamTypesResp.json();
            const pieCtx = document.getElementById('scamTypesChart');
            if (pieCtx && scamTypesData.labels && scamTypesData.data) {
                new Chart(pieCtx, {
                    type: 'pie',
                    data: {
                        labels: scamTypesData.labels,
                        datasets: [{
                            data: scamTypesData.data,
                            backgroundColor: ['#00f3ff', '#bc13fe', '#00ff87', '#ffdd00', '#ff005d'],
                            borderColor: 'rgba(0,0,0,0.3)',
                        }]
                    },
                    options: { 
                        responsive: true,
                        maintainAspectRatio: false, 
                        plugins: { 
                            legend: { 
                                position: 'bottom',
                                labels: {
                                    color: 'rgba(255, 255, 255, 0.7)',
                                }
                            } 
                        } 
                    }
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
                        scales: { 
                            y: { 
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: 'rgba(255, 255, 255, 0.7)' }
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        }

        // 4. 載入新竹各區資料並繪製橫向長條圖
        const districtResp = await fetch(`${API_BASE}/api/hsinchu_district_data`);
        if (districtResp.ok) {
            const districtData = await districtResp.json();
            const districtCtx = document.getElementById('hsinchuDistrictChart');
            if (districtCtx && districtData.labels && districtData.data) {
                new Chart(districtCtx, {
                    type: 'bar',
                    data: {
                        labels: districtData.labels,
                        datasets: [{
                            label: '通報案件數',
                            data: districtData.data,
                            backgroundColor: 'rgba(188, 19, 254, 0.6)',
                            borderColor: '#bc13fe',
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
                            title: { display: false }
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
        const data = await response.json();
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.key}&libraries=visualization&callback=initMap`;
        script.defer = true;
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

        // --- 1. 熱區圖層 ---
        const heatmapResp = await fetch(`${API_BASE}/api/heatmap_data`);
        if (!heatmapResp.ok) throw new Error(`無法獲取熱區圖資料 (HTTP ${heatmapResp.status})`);
        const heatmapData = await heatmapResp.json();

        let heatmap;
        if (heatmapData && !heatmapData.error && Array.isArray(heatmapData) && heatmapData.length > 0) {
            const heatMapPoints = heatmapData.map(point => ({
                location: new google.maps.LatLng(point.lat, point.lng),
                weight: point.weight
            }));

            heatmap = new google.maps.visualization.HeatmapLayer({
                data: heatMapPoints,
                map: map // 預設顯示
            });

            heatmap.set("radius", 20);
            heatmap.set("opacity", 0.7);
            heatmap.set("gradient", [
                "rgba(0, 243, 255, 0)",
                "rgba(0, 243, 255, 1)",
                "rgba(188, 19, 254, 1)",
                "rgba(255, 0, 93, 1)"
            ]);
        } else {
            console.warn("熱區圖資料格式錯誤或為空。", heatmapData.error || '');
        }

        // --- 2. 案件標記圖層 ---
        const markersResp = await fetch(`${API_BASE}/api/crime_data`);
        let markers = [];
        if (markersResp.ok) {
            const crimeData = await markersResp.json();
            const infoWindow = new google.maps.InfoWindow();

            if (crimeData && Array.isArray(crimeData)) {
                markers = crimeData.map(crime => {
                    const marker = new google.maps.Marker({
                        position: { lat: crime.lat, lng: crime.lng },
                        map: null, // 預設不顯示
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 5,
                            fillColor: "#FF4136", // 亮紅色
                            fillOpacity: 0.8,
                            strokeWeight: 1,
                            strokeColor: "#fff"
                        },
                        title: crime.type || '詐騙案件'
                    });

                    marker.addListener('click', () => {
                        const content = `
                            <div style="color: #333; font-family: 'Noto Sans TC', sans-serif;">
                                <h4 style="font-weight: bold; margin-bottom: 5px;">${crime.type || '詐騙案件'}</h4>
                                <p>日期: ${crime.date || '未知'}</p>
                                <p>地點: ${crime.location || '未知'}</p>
                            </div>`;
                        infoWindow.setContent(content);
                        infoWindow.open(map, marker);
                    });
                    return marker;
                });
            }
        } else {
            console.warn("無法獲取案件標記資料。");
        }

        // --- 3. 建立圖層切換控制 UI ---
        const layerControlDiv = document.createElement("div");
        layerControlDiv.style.margin = "10px";
        layerControlDiv.style.padding = "5px";
        layerControlDiv.style.backgroundColor = "rgba(5, 5, 5, 0.8)";
        layerControlDiv.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        layerControlDiv.style.borderRadius = "3px";
        layerControlDiv.style.color = "#fff";
        layerControlDiv.style.fontFamily = "'Orbitron', sans-serif";
        layerControlDiv.innerHTML = `
            <h4 style="margin: 0 0 5px 0; font-size: 14px; font-weight: bold;">LAYERS</h4>
            <label style="display: block; font-size: 12px; margin-bottom: 5px;">
                <input type="checkbox" id="toggle-heatmap" checked /> Heatmap
            </label>
            <label style="display: block; font-size: 12px;">
                <input type="checkbox" id="toggle-markers" /> Markers
            </label>
        `;
        map.controls[google.maps.ControlPosition.LEFT_TOP].push(layerControlDiv);

        // --- 4. 綁定圖層切換事件 ---
        const toggleHeatmap = document.getElementById('toggle-heatmap');
        if (toggleHeatmap && heatmap) {
            toggleHeatmap.addEventListener('change', (e) => {
                heatmap.setMap(e.target.checked ? map : null);
            });
        }

        const toggleMarkers = document.getElementById('toggle-markers');
        if (toggleMarkers && markers.length > 0) {
            toggleMarkers.addEventListener('change', (e) => {
                const targetMap = e.target.checked ? map : null;
                markers.forEach(marker => marker.setMap(targetMap));
            });
        }

    } catch (error) {
        console.error("初始化地圖失敗:", error);
        document.getElementById('map').textContent = '地圖載入時發生錯誤。';
    }
}