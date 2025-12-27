"""
策略優化器模組
網格搜尋最佳策略參數組合
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from backtest import BacktestEngine


class StrategyOptimizer:
    """策略參數優化器"""
    
    def __init__(
        self,
        data: List[Dict],
        ma_range: List[int] = [10, 60],
        ma_step: int = 10,
        lev_range: List[float] = [1.0, 3.0],
        lev_step: float = 0.5,
        max_mdd: float = 0.5,
        filter_liquidation: bool = True,
        target: str = 'total_return',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ):
        self.data = data
        self.ma_range = ma_range
        self.ma_step = ma_step
        self.lev_range = lev_range
        self.lev_step = lev_step
        self.max_mdd = max_mdd
        self.filter_liquidation = filter_liquidation
        self.target = target
        self.start_date = start_date
        self.end_date = end_date
        
        # 策略類型
        self.strategies = ['buy-hold', 'single-ma']
        
        # 操作方向
        self.directions = ['long-only']
    
    def run(self) -> Dict[str, Any]:
        """執行優化搜尋"""
        results = []
        
        # 產生參數組合
        ma_values = list(range(self.ma_range[0], self.ma_range[1] + 1, self.ma_step))
        lev_values = []
        lev = self.lev_range[0]
        while lev <= self.lev_range[1]:
            lev_values.append(lev)
            lev += self.lev_step
        
        total_combinations = len(ma_values) * len(lev_values) * len(self.strategies) * len(self.directions)
        tested = 0
        
        for ma_period in ma_values:
            for leverage in lev_values:
                for strategy in self.strategies:
                    for direction in self.directions:
                        tested += 1
                        
                        try:
                            # 執行回測
                            engine = BacktestEngine(
                                data=self.data,
                                initial_cash=100000,
                                leverage=leverage,
                                fee_rate=0.001,
                                slippage=0.0005,
                                strategy_mode=strategy,
                                ma_fast=ma_period,
                                ma_slow=ma_period * 3,  # 雙均線時的慢線
                                trade_direction=direction,
                                do_rebalance=True,
                                enable_yield=False,
                                annual_yield=0.04,
                                start_date=self.start_date,
                                end_date=self.end_date
                            )
                            
                            result = engine.run()
                            
                            # 檢查爆倉
                            is_liquidated = result['final_value'] < 15000
                            
                            results.append({
                                "strategy": self._get_strategy_name(strategy),
                                "direction": self._get_direction_name(direction),
                                "ma_period": ma_period if strategy != 'buy-hold' else '-',
                                "leverage": leverage,
                                "total_return": result['total_return'],
                                "cagr": result['cagr'],
                                "mdd": result['mdd'],
                                "sharpe": result['sharpe'],
                                "calmar": result['cagr'] / result['mdd'] if result['mdd'] > 0 else 0,
                                "is_liquidated": is_liquidated
                            })
                            
                        except Exception as e:
                            # 跳過失敗的組合
                            continue
        
        # 過濾結果
        filtered_results = results.copy()
        
        if self.filter_liquidation:
            filtered_results = [r for r in filtered_results if not r['is_liquidated']]
        
        # 過濾超過 MDD 上限的組合
        filtered_results = [r for r in filtered_results if r['mdd'] <= self.max_mdd]
        
        # 去重：對於 buy-hold 策略，只保留每個槓桿的一筆
        dedup_results = []
        seen_buyhold = set()
        
        for r in filtered_results:
            if r['strategy'] == '永遠做多':
                key = r['leverage']
                if key not in seen_buyhold:
                    seen_buyhold.add(key)
                    r['ma_period'] = '-'
                    r['direction'] = '-'
                    dedup_results.append(r)
            else:
                dedup_results.append(r)
        
        # 排序
        sort_key = {
            'total_return': 'total_return',
            'cagr': 'cagr',
            'sharpe': 'sharpe',
            'calmar': 'calmar'
        }.get(self.target, 'total_return')
        
        dedup_results.sort(key=lambda x: x[sort_key], reverse=True)
        
        # 移除內部欄位
        for r in dedup_results:
            r.pop('is_liquidated', None)
        
        return {
            "total_tested": tested,
            "valid_results": len(dedup_results),
            "top_results": dedup_results[:10]
        }
    
    def _get_strategy_name(self, strategy: str) -> str:
        """取得策略中文名稱"""
        names = {
            'buy-hold': '永遠做多',
            'single-ma': '單均線策略',
            'dual-ma': '雙均線策略'
        }
        return names.get(strategy, strategy)
    
    def _get_direction_name(self, direction: str) -> str:
        """取得方向中文名稱"""
        names = {
            'long-only': '僅做多',
            'long-short': '做多與做空'
        }
        return names.get(direction, direction)
