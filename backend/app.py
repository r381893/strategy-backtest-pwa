"""
高級回測系統 Pro - Render 後端 API
Flask REST API 處理回測計算和參數優化
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import datetime
import os

# 導入回測模組
from backtest import BacktestEngine
from optimizer import StrategyOptimizer

app = Flask(__name__)

# 設定 CORS 允許所有來源（生產環境應限制）
CORS(app, resources={
    r"/api/*": {
        "origins": ["*"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})


@app.route('/')
def index():
    """API 健康檢查"""
    return jsonify({
        "status": "ok",
        "message": "高級回測系統 Pro API",
        "version": "1.0.0"
    })


@app.route('/api/backtest', methods=['POST'])
def run_backtest():
    """
    執行單次回測
    
    Request Body:
    {
        "data": [{"date": "2024-01-01", "price": 100.0}, ...],
        "initial_cash": 100000,
        "leverage": 2.0,
        "fee_rate": 0.001,
        "slippage": 0.0005,
        "strategy_mode": "buy-hold" | "single-ma" | "dual-ma",
        "ma_fast": 20,
        "ma_slow": 60,
        "trade_direction": "long-only" | "long-short",
        "do_rebalance": true,
        "enable_yield": false,
        "annual_yield": 0.04,
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }
    """
    try:
        data = request.get_json()
        
        # 驗證必要欄位
        required_fields = ['data', 'initial_cash', 'leverage', 'strategy_mode']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"缺少必要欄位: {field}"}), 400
        
        # 建立回測引擎並執行
        engine = BacktestEngine(
            data=data['data'],
            initial_cash=data['initial_cash'],
            leverage=data['leverage'],
            fee_rate=data.get('fee_rate', 0.001),
            slippage=data.get('slippage', 0.0005),
            strategy_mode=data['strategy_mode'],
            ma_fast=data.get('ma_fast', 20),
            ma_slow=data.get('ma_slow', 60),
            trade_direction=data.get('trade_direction', 'long-only'),
            do_rebalance=data.get('do_rebalance', True),
            enable_yield=data.get('enable_yield', False),
            annual_yield=data.get('annual_yield', 0.04),
            start_date=data.get('start_date'),
            end_date=data.get('end_date')
        )
        
        result = engine.run()
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/optimize', methods=['POST'])
def run_optimization():
    """
    執行參數優化
    
    Request Body:
    {
        "data": [{"date": "2024-01-01", "price": 100.0}, ...],
        "ma_range": [10, 60],
        "ma_step": 10,
        "lev_range": [1.0, 3.0],
        "lev_step": 0.5,
        "max_mdd": 0.5,
        "filter_liquidation": true,
        "target": "total_return" | "cagr" | "sharpe" | "calmar",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }
    """
    try:
        data = request.get_json()
        
        # 驗證必要欄位
        if 'data' not in data:
            return jsonify({"error": "缺少資料欄位"}), 400
        
        # 建立優化器並執行
        optimizer = StrategyOptimizer(
            data=data['data'],
            ma_range=data.get('ma_range', [10, 60]),
            ma_step=data.get('ma_step', 10),
            lev_range=data.get('lev_range', [1.0, 3.0]),
            lev_step=data.get('lev_step', 0.5),
            max_mdd=data.get('max_mdd', 0.5),
            filter_liquidation=data.get('filter_liquidation', True),
            target=data.get('target', 'total_return'),
            start_date=data.get('start_date'),
            end_date=data.get('end_date')
        )
        
        result = optimizer.run()
        
        return jsonify(result)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
