/**
 * Firebase 設定檔
 * 使用現有的 backtesting-system-pro Firebase 專案
 */

// Firebase 設定
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // 需要從 Firebase Console 取得
    authDomain: "backtesting-system-pro.firebaseapp.com",
    databaseURL: "https://backtesting-system-pro-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "backtesting-system-pro",
    storageBucket: "backtesting-system-pro.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// 初始化 Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

/**
 * Firebase 操作函數
 */
const FirebaseService = {
    /**
     * 儲存最佳策略
     * @param {string} assetName - 資產名稱
     * @param {object} strategyData - 策略資料
     * @param {array} topStrategies - 前幾名策略（可選）
     * @returns {Promise<object>}
     */
    async saveStrategy(assetName, strategyData, topStrategies = null) {
        try {
            const ref = database.ref('best_strategies');

            // 建立唯一 key
            const backTestPeriod = strategyData.backtest_period || '';
            const uniqueKey = `${assetName}_${backTestPeriod}`.replace(/ /g, '').replace(/~/g, '_').replace(/\//g, '-');

            const saveData = {
                asset: assetName,
                strategy: strategyData.strategy,
                direction: strategyData.direction,
                ma_period: strategyData.ma_period || 0,
                leverage: strategyData.leverage,
                total_return: strategyData.total_return,
                cagr: strategyData.cagr,
                mdd: strategyData.mdd,
                sharpe: strategyData.sharpe,
                calmar: strategyData.calmar || 0,
                backtest_period: backTestPeriod,
                saved_at: new Date().toLocaleString('zh-TW')
            };

            // 儲存前幾名備選策略
            if (topStrategies && topStrategies.length > 1) {
                saveData.top_alternatives = topStrategies.slice(1, 6).map((alt, i) => ({
                    rank: i + 2,
                    strategy: alt.strategy,
                    direction: alt.direction,
                    ma_period: alt.ma_period || 0,
                    leverage: alt.leverage,
                    total_return: alt.total_return,
                    cagr: alt.cagr,
                    mdd: alt.mdd,
                    sharpe: alt.sharpe,
                    calmar: alt.calmar || 0
                }));
            }

            await ref.child(uniqueKey).set(saveData);
            return { success: true, message: '儲存成功' };
        } catch (error) {
            console.error('Firebase save error:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * 載入所有已儲存的策略
     * @returns {Promise<object>}
     */
    async loadStrategies() {
        try {
            const ref = database.ref('best_strategies');
            const snapshot = await ref.once('value');
            return snapshot.val() || {};
        } catch (error) {
            console.error('Firebase load error:', error);
            return {};
        }
    },

    /**
     * 刪除策略
     * @param {string} key - 策略的 key
     * @returns {Promise<object>}
     */
    async deleteStrategy(key) {
        try {
            const ref = database.ref('best_strategies');
            await ref.child(key).remove();
            return { success: true, message: '刪除成功' };
        } catch (error) {
            console.error('Firebase delete error:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * 即時監聽策略變化
     * @param {function} callback - 資料變化時的回調
     */
    onStrategiesChange(callback) {
        const ref = database.ref('best_strategies');
        ref.on('value', (snapshot) => {
            callback(snapshot.val() || {});
        });
    }
};

// 匯出供其他模組使用
window.FirebaseService = FirebaseService;
