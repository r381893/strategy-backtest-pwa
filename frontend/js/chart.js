/**
 * 圖表繪製模組
 * 使用 Plotly.js 繪製各種圖表
 */

const ChartRenderer = {
    // 共用圖表設定
    commonLayout: {
        font: {
            family: 'Noto Sans TC, sans-serif'
        },
        margin: { l: 50, r: 30, t: 40, b: 50 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: {
            gridcolor: 'rgba(0,0,0,0.05)',
            linecolor: 'rgba(0,0,0,0.1)'
        },
        yaxis: {
            gridcolor: 'rgba(0,0,0,0.05)',
            linecolor: 'rgba(0,0,0,0.1)'
        }
    },

    commonConfig: {
        responsive: true,
        displayModeBar: false
    },

    /**
     * 繪製價格走勢圖
     * @param {string} containerId - 容器 ID
     * @param {array} data - 資料陣列 [{date, price}]
     */
    drawPriceChart(containerId, data) {
        const trace = {
            x: data.map(d => d.date),
            y: data.map(d => d.price),
            type: 'scatter',
            mode: 'lines',
            name: '價格',
            line: {
                color: '#1f77b4',
                width: 2
            }
        };

        const layout = {
            ...this.commonLayout,
            title: {
                text: '標的價格走勢圖',
                font: { size: 16, color: '#2c3e50' }
            },
            xaxis: {
                ...this.commonLayout.xaxis,
                title: '日期'
            },
            yaxis: {
                ...this.commonLayout.yaxis,
                title: '價格'
            },
            hovermode: 'x unified'
        };

        Plotly.newPlot(containerId, [trace], layout, this.commonConfig);
    },

    /**
     * 繪製淨值曲線圖
     * @param {string} containerId - 容器 ID
     * @param {array} equityCurve - 淨值曲線 [{date, value}]
     */
    drawEquityChart(containerId, equityCurve) {
        const trace = {
            x: equityCurve.map(d => d.date),
            y: equityCurve.map(d => d.value),
            type: 'scatter',
            mode: 'lines',
            name: '淨值',
            fill: 'tozeroy',
            line: {
                color: '#00b894',
                width: 2.5
            },
            fillcolor: 'rgba(0, 184, 148, 0.15)'
        };

        const layout = {
            ...this.commonLayout,
            hovermode: 'x unified',
            xaxis: {
                ...this.commonLayout.xaxis,
                title: '日期'
            },
            yaxis: {
                ...this.commonLayout.yaxis,
                title: '淨值 (TWD)',
                tickformat: ',.0f'
            }
        };

        Plotly.newPlot(containerId, [trace], layout, this.commonConfig);
    },

    /**
     * 繪製回撤圖
     * @param {string} containerId - 容器 ID
     * @param {array} equityCurve - 淨值曲線 [{date, value}]
     */
    drawDrawdownChart(containerId, equityCurve) {
        // 計算回撤
        const drawdowns = this.calculateDrawdowns(equityCurve);

        const trace = {
            x: drawdowns.map(d => d.date),
            y: drawdowns.map(d => d.drawdown),
            type: 'scatter',
            mode: 'lines',
            name: '回撤',
            fill: 'tozeroy',
            line: {
                color: '#e74c3c',
                width: 1.5
            },
            fillcolor: 'rgba(231, 76, 60, 0.2)'
        };

        const layout = {
            ...this.commonLayout,
            hovermode: 'x unified',
            xaxis: {
                ...this.commonLayout.xaxis,
                title: '日期'
            },
            yaxis: {
                ...this.commonLayout.yaxis,
                title: '回撤幅度',
                tickformat: '.1%'
            }
        };

        Plotly.newPlot(containerId, [trace], layout, this.commonConfig);
    },

    /**
     * 計算回撤序列
     * @param {array} equityCurve - 淨值曲線
     * @returns {array}
     */
    calculateDrawdowns(equityCurve) {
        const result = [];
        let peak = equityCurve[0].value;

        for (const point of equityCurve) {
            if (point.value > peak) {
                peak = point.value;
            }
            const drawdown = (point.value - peak) / peak;
            result.push({
                date: point.date,
                drawdown: drawdown
            });
        }

        return result;
    },

    /**
     * 更新圖表大小（響應式）
     * @param {string} containerId - 容器 ID
     */
    resize(containerId) {
        Plotly.Plots.resize(containerId);
    },

    /**
     * 清除圖表
     * @param {string} containerId - 容器 ID
     */
    clear(containerId) {
        Plotly.purge(containerId);
    }
};

// 監聽視窗大小變化
window.addEventListener('resize', () => {
    const charts = ['price-chart', 'equity-chart', 'drawdown-chart'];
    charts.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.data) {
            ChartRenderer.resize(id);
        }
    });
});

// 匯出供其他模組使用
window.ChartRenderer = ChartRenderer;
