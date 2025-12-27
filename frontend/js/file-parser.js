/**
 * Excel 檔案解析模組
 * 使用 SheetJS 解析上傳的 Excel 檔案
 */

const FileParser = {
    // 日期欄位候選名稱
    DATE_CANDIDATES: ['date', '日期', 'data', 'time', 'Date', 'DATE'],

    // 價格欄位候選名稱
    PRICE_CANDIDATES: ['close', '收盤價', 'price', '價格', 'Close', 'CLOSE', 'Price'],

    /**
     * 解析上傳的 Excel 檔案
     * @param {File} file - 上傳的檔案
     * @returns {Promise<object>} - 解析後的資料
     */
    async parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                    // 讀取第一個工作表
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];

                    // 轉換為 JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

                    if (jsonData.length === 0) {
                        reject(new Error('Excel 檔案沒有資料'));
                        return;
                    }

                    // 識別欄位
                    const columns = Object.keys(jsonData[0]);
                    const dateCol = this.findColumn(columns, this.DATE_CANDIDATES);
                    const priceCol = this.findColumn(columns, this.PRICE_CANDIDATES);

                    if (!dateCol) {
                        reject(new Error("找不到日期欄位（請確保欄位名稱包含 'date', '日期' 等）"));
                        return;
                    }

                    if (!priceCol) {
                        reject(new Error("找不到價格欄位（請確保欄位名稱包含 'close', '收盤價' 等）"));
                        return;
                    }

                    // 處理並清理資料
                    const processedData = this.processData(jsonData, dateCol, priceCol);

                    if (processedData.length === 0) {
                        reject(new Error('處理後沒有有效資料'));
                        return;
                    }

                    resolve({
                        data: processedData,
                        dateCol: dateCol,
                        priceCol: priceCol,
                        fileName: file.name.replace(/\.(xlsx|xls)$/i, ''),
                        totalRows: processedData.length,
                        dateRange: {
                            start: processedData[0].date,
                            end: processedData[processedData.length - 1].date
                        }
                    });

                } catch (error) {
                    reject(new Error('Excel 解析失敗: ' + error.message));
                }
            };

            reader.onerror = () => {
                reject(new Error('檔案讀取失敗'));
            };

            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * 在欄位中尋找匹配的候選名稱
     * @param {array} columns - 欄位名稱陣列
     * @param {array} candidates - 候選名稱陣列
     * @returns {string|null}
     */
    findColumn(columns, candidates) {
        for (const col of columns) {
            const lowerCol = col.toLowerCase();
            for (const candidate of candidates) {
                if (lowerCol.includes(candidate.toLowerCase())) {
                    return col;
                }
            }
        }
        return null;
    },

    /**
     * 處理並清理資料
     * @param {array} rawData - 原始資料
     * @param {string} dateCol - 日期欄位名稱
     * @param {string} priceCol - 價格欄位名稱
     * @returns {array}
     */
    processData(rawData, dateCol, priceCol) {
        const processed = [];

        for (const row of rawData) {
            const dateValue = row[dateCol];
            const priceValue = row[priceCol];

            // 跳過缺失資料
            if (!dateValue || !priceValue) continue;

            // 解析日期
            const date = this.parseDate(dateValue);
            if (!date) continue;

            // 解析價格
            const price = parseFloat(String(priceValue).replace(/,/g, ''));
            if (isNaN(price) || price <= 0) continue;

            processed.push({
                date: date,
                dateStr: this.formatDate(date),
                price: price
            });
        }

        // 按日期排序
        processed.sort((a, b) => a.date - b.date);

        return processed;
    },

    /**
     * 解析日期
     * @param {any} value - 日期值
     * @returns {Date|null}
     */
    parseDate(value) {
        if (value instanceof Date) {
            return isNaN(value.getTime()) ? null : value;
        }

        if (typeof value === 'number') {
            // Excel 序號日期
            const excelEpoch = new Date(1899, 11, 30);
            return new Date(excelEpoch.getTime() + value * 86400000);
        }

        if (typeof value === 'string') {
            // 嘗試解析字串日期
            const date = new Date(value);
            return isNaN(date.getTime()) ? null : date;
        }

        return null;
    },

    /**
     * 格式化日期為字串
     * @param {Date} date - 日期物件
     * @returns {string}
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};

// 匯出供其他模組使用
window.FileParser = FileParser;
