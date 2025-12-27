/**
 * 高級回測系統 Pro - 主應用邏輯
 * 處理 UI 互動、API 呼叫與狀態管理
 */

// Render 後端 API 基礎 URL
const API_BASE_URL = 'https://strategy-backtest-pwa.onrender.com';

// 應用狀態
const AppState = {
    rawData: null,           // 解析後的原始資料
    fileName: '',            // 檔案名稱
    backtestResult: null,    // 回測結果
    optimizationResult: null // 優化結果
};

// ==========================================
// 初始化
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initFileUpload();
    initFormListeners();
    initButtons();
    loadSavedStrategies();
    registerServiceWorker();
});

// ==========================================
// Tab 切換
// ==========================================
function initTabs() {
    // 桌面版 Tab
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 手機版底部導航
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobileNavBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tabId) {
    // 更新 Tab 按鈕狀態
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // 更新 Tab 內容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });

    // 圖表重繪（解決隱藏時的大小問題）
    setTimeout(() => {
        const charts = ['price-chart', 'equity-chart', 'drawdown-chart'];
        charts.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.data) {
                Plotly.Plots.resize(id);
            }
        });
    }, 100);
}

// ==========================================
// 檔案上傳
// ==========================================
function initFileUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const selectBtn = document.getElementById('select-file-btn');

    // 點擊選擇檔案
    selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    uploadArea.addEventListener('click', () => fileInput.click());

    // 檔案選擇
    fileInput.addEventListener('change', handleFileSelect);

    // 拖曳上傳
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    });
}

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        await processFile(file);
    }
}

async function processFile(file) {
    try {
        showToast('正在解析檔案...', 'info');

        const result = await FileParser.parseExcel(file);

        AppState.rawData = result.data;
        AppState.fileName = result.fileName;

        // 更新狀態卡片
        document.getElementById('data-count').textContent = result.totalRows.toLocaleString();
        document.getElementById('date-range-start').textContent = result.dateRange.start.toLocaleDateString('zh-TW');
        document.getElementById('date-range-end').textContent = result.dateRange.end.toLocaleDateString('zh-TW');

        // 顯示狀態卡片和圖表
        document.getElementById('data-status').classList.remove('hidden');
        document.getElementById('price-chart-container').classList.remove('hidden');

        // 繪製價格圖
        ChartRenderer.drawPriceChart('price-chart', result.data);

        // 更新日期選擇器
        const startDateInput = document.getElementById('start-date');
        const endDateInput = document.getElementById('end-date');
        startDateInput.value = formatDateForInput(result.dateRange.start);
        endDateInput.value = formatDateForInput(result.dateRange.end);
        startDateInput.min = formatDateForInput(result.dateRange.start);
        startDateInput.max = formatDateForInput(result.dateRange.end);
        endDateInput.min = formatDateForInput(result.dateRange.start);
        endDateInput.max = formatDateForInput(result.dateRange.end);

        showToast(`成功載入 ${result.totalRows.toLocaleString()} 筆資料`, 'success');

    } catch (error) {
        showToast(error.message, 'error');
    }
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

// ==========================================
// 表單監聽
// ==========================================
function initFormListeners() {
    // 策略類型變更
    const strategyMode = document.getElementById('strategy-mode');
    const maSlowGroup = document.getElementById('ma-slow-group');

    strategyMode.addEventListener('change', () => {
        // 只有雙均線策略才顯示慢線設定
        maSlowGroup.style.display = strategyMode.value === 'dual-ma' ? 'flex' : 'none';
    });

    // 逆價差開關
    const enableYield = document.getElementById('enable-yield');
    const yieldRateGroup = document.getElementById('yield-rate-group');

    enableYield.addEventListener('change', () => {
        yieldRateGroup.style.display = enableYield.checked ? 'flex' : 'none';
    });

    // 逆價差滑桿顯示
    const yieldRate = document.getElementById('yield-rate');
    const yieldDisplay = document.getElementById('yield-rate-display');

    yieldRate.addEventListener('input', () => {
        yieldDisplay.textContent = `${yieldRate.value}%`;
    });

    // 初始隱藏
    maSlowGroup.style.display = 'none';
    yieldRateGroup.style.display = 'none';
}

// ==========================================
// 按鈕事件
// ==========================================
function initButtons() {
    // 執行回測
    document.getElementById('run-backtest-btn').addEventListener('click', runBacktest);

    // 執行優化
    document.getElementById('run-optimization-btn').addEventListener('click', runOptimization);

    // 儲存優化策略
    document.getElementById('save-strategy-btn').addEventListener('click', saveStrategy);

    // 儲存回測結果
    document.getElementById('save-backtest-btn').addEventListener('click', saveBacktestResult);
}

// ==========================================
// 執行回測
// ==========================================
async function runBacktest() {
    if (!AppState.rawData) {
        showToast('請先上傳資料檔案', 'error');
        switchTab('data-preview');
        return;
    }

    const loading = document.getElementById('backtest-loading');
    loading.classList.remove('hidden');

    try {
        // 收集參數
        const params = {
            data: AppState.rawData.map(d => ({
                date: d.dateStr,
                price: d.price
            })),
            initial_cash: parseFloat(document.getElementById('init-cash').value),
            leverage: parseFloat(document.getElementById('leverage').value),
            fee_rate: parseFloat(document.getElementById('fee-rate').value) / 100,
            slippage: parseFloat(document.getElementById('slippage').value) / 100,
            strategy_mode: document.getElementById('strategy-mode').value,
            ma_fast: parseInt(document.getElementById('ma-fast').value),
            ma_slow: parseInt(document.getElementById('ma-slow').value),
            trade_direction: document.getElementById('trade-direction').value,
            do_rebalance: document.getElementById('rebalance').checked,
            enable_yield: document.getElementById('enable-yield').checked,
            annual_yield: parseFloat(document.getElementById('yield-rate').value) / 100,
            start_date: document.getElementById('start-date').value,
            end_date: document.getElementById('end-date').value
        };

        // 呼叫後端 API
        const response = await fetch(`${API_BASE_URL}/api/backtest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            throw new Error('回測 API 呼叫失敗');
        }

        const result = await response.json();
        AppState.backtestResult = result;

        // 顯示結果
        displayBacktestResults(result);
        displayTradeDetails(result);

        showToast('回測完成！', 'success');
        switchTab('backtest-report');

    } catch (error) {
        showToast('回測失敗: ' + error.message, 'error');
    } finally {
        loading.classList.add('hidden');
    }
}

function displayBacktestResults(result) {
    // 顯示報表區塊
    document.getElementById('report-placeholder').classList.add('hidden');
    document.getElementById('report-content').classList.remove('hidden');

    // 更新指標
    document.getElementById('final-value').textContent = `$${result.final_value.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}`;
    document.getElementById('total-return').textContent = `${(result.total_return * 100).toFixed(2)}%`;
    document.getElementById('cagr').textContent = `${(result.cagr * 100).toFixed(2)}%`;
    document.getElementById('mdd').textContent = `${(result.mdd * 100).toFixed(2)}%`;
    document.getElementById('sharpe').textContent = result.sharpe.toFixed(2);

    // 繪製圖表
    ChartRenderer.drawEquityChart('equity-chart', result.equity_curve);
    ChartRenderer.drawDrawdownChart('drawdown-chart', result.equity_curve);
}

function displayTradeDetails(result) {
    // 顯示交易明細區塊
    document.getElementById('trades-placeholder').classList.add('hidden');
    document.getElementById('trades-content').classList.remove('hidden');

    // 更新統計
    const stats = result.trade_stats;
    document.getElementById('total-trades').textContent = stats.total_trades;
    document.getElementById('win-rate').textContent = `${stats.win_rate.toFixed(1)}%`;
    document.getElementById('profit-loss-ratio').textContent = stats.profit_loss_ratio.toFixed(2);
    document.getElementById('profit-factor').textContent = stats.profit_factor.toFixed(2);

    // 填充交易表格
    const tbody = document.querySelector('#trades-table tbody');
    tbody.innerHTML = '';

    for (const trade of result.trades) {
        const row = document.createElement('tr');
        const profitClass = trade.pnl >= 0 ? 'profit' : 'loss';

        row.innerHTML = `
            <td>${trade.direction}</td>
            <td>${trade.entry_date}</td>
            <td>${trade.exit_date}</td>
            <td>${trade.entry_price.toFixed(2)}</td>
            <td>${trade.exit_price.toFixed(2)}</td>
            <td class="${profitClass}">${trade.pnl.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}</td>
            <td class="${profitClass}">${(trade.pnl_pct * 100).toFixed(2)}%</td>
        `;
        tbody.appendChild(row);
    }
}

// ==========================================
// 執行優化
// ==========================================
async function runOptimization() {
    if (!AppState.rawData) {
        showToast('請先上傳資料檔案', 'error');
        switchTab('data-preview');
        return;
    }

    const progress = document.getElementById('opt-progress');
    const progressFill = document.getElementById('opt-progress-fill');
    const statusText = document.getElementById('opt-status-text');
    const resultsDiv = document.getElementById('opt-results');

    progress.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    progressFill.style.width = '0%';

    try {
        // 收集參數
        const params = {
            data: AppState.rawData.map(d => ({
                date: d.dateStr,
                price: d.price
            })),
            ma_range: [
                parseInt(document.getElementById('opt-ma-min').value),
                parseInt(document.getElementById('opt-ma-max').value)
            ],
            ma_step: parseInt(document.getElementById('opt-ma-step').value),
            lev_range: [
                parseFloat(document.getElementById('opt-lev-min').value),
                parseFloat(document.getElementById('opt-lev-max').value)
            ],
            lev_step: parseFloat(document.getElementById('opt-lev-step').value),
            max_mdd: parseFloat(document.getElementById('opt-max-mdd').value) / 100,
            filter_liquidation: document.getElementById('opt-filter-liquidation').checked,
            target: document.getElementById('opt-target').value,
            start_date: document.getElementById('start-date').value,
            end_date: document.getElementById('end-date').value
        };

        statusText.textContent = '正在連接後端...';
        progressFill.style.width = '10%';

        // 呼叫後端 API
        const response = await fetch(`${API_BASE_URL}/api/optimize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });

        progressFill.style.width = '90%';
        statusText.textContent = '正在處理結果...';

        if (!response.ok) {
            throw new Error('優化 API 呼叫失敗');
        }

        const result = await response.json();
        AppState.optimizationResult = result;

        progressFill.style.width = '100%';

        // 顯示結果
        displayOptimizationResults(result);

        setTimeout(() => {
            progress.classList.add('hidden');
            resultsDiv.classList.remove('hidden');
        }, 500);

        showToast(`優化完成！共測試 ${result.total_tested} 個組合`, 'success');

    } catch (error) {
        showToast('優化失敗: ' + error.message, 'error');
        progress.classList.add('hidden');
    }
}

function displayOptimizationResults(result) {
    // 填充表格
    const tbody = document.querySelector('#opt-results-table tbody');
    tbody.innerHTML = '';

    for (const row of result.top_results) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.strategy}</td>
            <td>${row.direction}</td>
            <td>${row.ma_period}</td>
            <td>${row.leverage.toFixed(1)}x</td>
            <td>${(row.total_return * 100).toFixed(2)}%</td>
            <td>${(row.cagr * 100).toFixed(2)}%</td>
            <td>${(row.mdd * 100).toFixed(2)}%</td>
            <td>${row.sharpe.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    }

    // 顯示最佳參數卡片
    if (result.top_results.length > 0) {
        const best = result.top_results[0];
        const card = document.getElementById('best-params-card');
        card.innerHTML = `
            <h3>🥇 最佳參數 - ${AppState.fileName}</h3>
            <p><strong>策略：</strong>${best.strategy} | <strong>方向：</strong>${best.direction}</p>
            <p><strong>均線：</strong>MA${best.ma_period} | <strong>槓桿：</strong>${best.leverage.toFixed(1)}x</p>
            <p><strong>總報酬：</strong>${(best.total_return * 100).toFixed(2)}% | <strong>年化報酬：</strong>${(best.cagr * 100).toFixed(2)}%</p>
            <p><strong>最大回撤：</strong>${(best.mdd * 100).toFixed(2)}% | <strong>夏普比率：</strong>${best.sharpe.toFixed(2)}</p>
        `;
    }
}

// ==========================================
// 儲存策略
// ==========================================
async function saveStrategy() {
    if (!AppState.optimizationResult || AppState.optimizationResult.top_results.length === 0) {
        showToast('沒有可儲存的策略', 'error');
        return;
    }

    const best = AppState.optimizationResult.top_results[0];
    const strategyData = {
        strategy: best.strategy,
        direction: best.direction,
        ma_period: best.ma_period,
        leverage: best.leverage,
        total_return: best.total_return,
        cagr: best.cagr,
        mdd: best.mdd,
        sharpe: best.sharpe,
        calmar: best.calmar || 0,
        backtest_period: `${document.getElementById('start-date').value} ~ ${document.getElementById('end-date').value}`
    };

    try {
        const result = await FirebaseService.saveStrategy(
            AppState.fileName,
            strategyData,
            AppState.optimizationResult.top_results
        );

        if (result.success) {
            showToast('策略已儲存到 Firebase！', 'success');
            loadSavedStrategies();
        } else {
            showToast('儲存失敗: ' + result.message, 'error');
        }
    } catch (error) {
        showToast('儲存失敗: ' + error.message, 'error');
    }
}

// ==========================================
// 儲存回測結果
// ==========================================
async function saveBacktestResult() {
    if (!AppState.backtestResult) {
        showToast('沒有可儲存的回測結果', 'error');
        return;
    }

    const result = AppState.backtestResult;
    const strategyMode = document.getElementById('strategy-mode').value;
    const strategyNames = {
        'buy-hold': '永遠做多',
        'single-ma': '單均線策略',
        'dual-ma': '雙均線策略'
    };
    const directionNames = {
        'long-only': '僅做多',
        'long-short': '做多與做空'
    };

    const strategyData = {
        strategy: strategyNames[strategyMode] || strategyMode,
        direction: directionNames[document.getElementById('trade-direction').value] || '-',
        ma_period: strategyMode === 'buy-hold' ? 0 : parseInt(document.getElementById('ma-fast').value),
        leverage: parseFloat(document.getElementById('leverage').value),
        total_return: result.total_return,
        cagr: result.cagr,
        mdd: result.mdd,
        sharpe: result.sharpe,
        calmar: result.mdd > 0 ? result.cagr / result.mdd : 0,
        backtest_period: `${document.getElementById('start-date').value} ~ ${document.getElementById('end-date').value}`
    };

    try {
        const saveResult = await FirebaseService.saveStrategy(
            AppState.fileName,
            strategyData,
            null
        );

        if (saveResult.success) {
            showToast('回測結果已儲存到 Firebase！', 'success');
            loadSavedStrategies();
        } else {
            showToast('儲存失敗: ' + saveResult.message, 'error');
        }
    } catch (error) {
        showToast('儲存失敗: ' + error.message, 'error');
    }
}

// ==========================================
// 載入已儲存策略
// ==========================================
async function loadSavedStrategies() {
    try {
        const strategies = await FirebaseService.loadStrategies();
        displaySavedStrategies(strategies);
    } catch (error) {
        console.error('載入策略失敗:', error);
    }
}

function displaySavedStrategies(strategies) {
    const container = document.getElementById('saved-strategies-list');

    if (!strategies || Object.keys(strategies).length === 0) {
        container.innerHTML = '<div class="placeholder-msg"><p>📭 尚無已儲存的策略</p></div>';
        return;
    }

    container.innerHTML = '';

    for (const [key, value] of Object.entries(strategies)) {
        const card = document.createElement('div');
        card.className = 'saved-card';
        card.innerHTML = `
            <h3>🏆 ${value.asset}</h3>
            <p><strong>策略：</strong>${value.strategy} | <strong>方向：</strong>${value.direction}</p>
            <p><strong>均線：</strong>MA${value.ma_period} | <strong>槓桿：</strong>${value.leverage.toFixed(1)}x</p>
            <p><strong>總報酬：</strong>${(value.total_return * 100).toFixed(2)}% | <strong>年化報酬：</strong>${(value.cagr * 100).toFixed(2)}%</p>
            <p><strong>最大回撤：</strong>${(value.mdd * 100).toFixed(2)}% | <strong>夏普比率：</strong>${value.sharpe.toFixed(2)}</p>
            <p class="date-info">📅 ${value.backtest_period}</p>
            <p class="date-info">更新於 ${value.saved_at}</p>
            <button class="btn btn-danger" onclick="deleteStrategy('${key}')">🗑️ 刪除</button>
        `;
        container.appendChild(card);
    }
}

async function deleteStrategy(key) {
    if (!confirm('確定要刪除此策略嗎？')) return;

    try {
        const result = await FirebaseService.deleteStrategy(key);
        if (result.success) {
            showToast('策略已刪除', 'success');
            loadSavedStrategies();
        } else {
            showToast('刪除失敗: ' + result.message, 'error');
        }
    } catch (error) {
        showToast('刪除失敗: ' + error.message, 'error');
    }
}

// ==========================================
// Toast 通知
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// Service Worker 註冊
// ==========================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker 註冊成功'))
            .catch(err => console.error('Service Worker 註冊失敗:', err));
    }
}

// 匯出全域函數
window.deleteStrategy = deleteStrategy;
