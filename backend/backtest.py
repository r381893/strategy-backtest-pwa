"""
回測引擎模組
從原有 Streamlit 應用提取的核心回測邏輯
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional


class BacktestEngine:
    """回測引擎"""
    
    def __init__(
        self,
        data: List[Dict],
        initial_cash: float = 100000,
        leverage: float = 2.0,
        fee_rate: float = 0.001,
        slippage: float = 0.0005,
        strategy_mode: str = 'buy-hold',
        ma_fast: int = 20,
        ma_slow: int = 60,
        trade_direction: str = 'long-only',
        do_rebalance: bool = True,
        enable_yield: bool = False,
        annual_yield: float = 0.04,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ):
        self.initial_cash = initial_cash
        self.leverage = leverage
        self.fee_rate = fee_rate
        self.slippage = slippage
        self.strategy_mode = strategy_mode
        self.ma_fast = ma_fast
        self.ma_slow = ma_slow
        self.trade_direction = trade_direction
        self.do_rebalance = do_rebalance
        self.enable_yield = enable_yield
        self.annual_yield = annual_yield
        
        # 轉換資料為 DataFrame
        self.df = pd.DataFrame(data)
        self.df['date'] = pd.to_datetime(self.df['date'])
        self.df = self.df.sort_values('date').reset_index(drop=True)
        
        # 日期篩選
        if start_date:
            self.df = self.df[self.df['date'] >= start_date]
        if end_date:
            self.df = self.df[self.df['date'] <= end_date]
        
        self.df = self.df.reset_index(drop=True)
    
    def run(self) -> Dict[str, Any]:
        """執行回測"""
        df = self.df.copy()
        
        if len(df) < 30:
            raise ValueError("資料筆數不足，需要至少 30 筆")
        
        # 計算均線
        df['MA_Fast'] = df['price'].rolling(window=self.ma_fast).mean()
        
        # 產生信號
        if self.strategy_mode == 'buy-hold':
            df['Signal_Buy'] = False
            df.loc[df.index[0], 'Signal_Buy'] = True
            df['Signal_Sell'] = False
            start_idx = 0
        elif self.strategy_mode == 'dual-ma':
            df['MA_Slow'] = df['price'].rolling(window=self.ma_slow).mean()
            df['Signal_Buy'] = (df['MA_Fast'] > df['MA_Slow']) & (df['MA_Fast'].shift(1) <= df['MA_Slow'].shift(1))
            df['Signal_Sell'] = (df['MA_Fast'] < df['MA_Slow']) & (df['MA_Fast'].shift(1) >= df['MA_Slow'].shift(1))
            start_idx = self.ma_slow
        else:  # single-ma
            df['Signal_Buy'] = (df['price'] > df['MA_Fast']) & (df['price'].shift(1) <= df['MA_Fast'].shift(1))
            df['Signal_Sell'] = (df['price'] < df['MA_Fast']) & (df['price'].shift(1) >= df['MA_Fast'].shift(1))
            start_idx = self.ma_fast
        
        # 回測執行
        cash = float(self.initial_cash)
        pos = 0  # 1=做多, -1=做空, 0=空倉
        entry_price = 0.0
        entry_date = None
        units = 0.0
        
        equity_curve = []
        trades = []
        
        df = df.iloc[start_idx:].reset_index(drop=True)
        
        for i in range(len(df)):
            price = df['price'].iloc[i]
            current_date = df['date'].iloc[i]
            prev_date = df['date'].iloc[i-1] if i > 0 else current_date
            
            # 計算當前淨值
            current_equity = cash
            if pos != 0:
                unrealized_pnl = (price - entry_price) * units * pos
                
                # 逆價差收益（僅做多時）
                if self.enable_yield and pos == 1 and i > 0:
                    prev_price = df['price'].iloc[i-1]
                    daily_yield_rate = self.annual_yield / 252
                    yield_pnl = prev_price * daily_yield_rate * units
                    cash += yield_pnl
                
                current_equity = cash + unrealized_pnl
                
                # 爆倉檢測
                if current_equity < (self.initial_cash * 0.15):
                    current_equity = 0
                    equity_curve.append({
                        "date": current_date.strftime('%Y-%m-%d'),
                        "value": 0
                    })
                    break
            
            equity_curve.append({
                "date": current_date.strftime('%Y-%m-%d'),
                "value": current_equity
            })
            
            # 每月月初再平衡
            if self.do_rebalance and i > 0 and current_date.month != prev_date.month and pos != 0 and cash > 0:
                realized_pnl = (price - entry_price) * units * pos
                cash = cash + realized_pnl
                target_units = (cash * self.leverage) / price
                diff_units = abs(target_units - units)
                rebalance_fee = diff_units * price * self.fee_rate
                cash = cash - rebalance_fee
                
                trades.append({
                    "direction": "再平衡",
                    "entry_date": current_date.strftime('%Y-%m-%d'),
                    "exit_date": current_date.strftime('%Y-%m-%d'),
                    "entry_price": price,
                    "exit_price": price,
                    "units": target_units,
                    "pnl": -rebalance_fee,
                    "pnl_pct": -rebalance_fee / current_equity if current_equity > 0 else 0
                })
                
                units = target_units
                entry_price = price
            
            sig_buy = df['Signal_Buy'].iloc[i]
            sig_sell = df['Signal_Sell'].iloc[i]
            
            # 處理交易信號
            if pos == 1 and sig_sell:
                exit_p = price * (1 - self.slippage)
                pnl = (exit_p - entry_price) * units
                fee = exit_p * units * self.fee_rate
                net_pnl = pnl - fee
                
                trades.append({
                    "direction": "做多",
                    "entry_date": entry_date.strftime('%Y-%m-%d') if entry_date else "",
                    "exit_date": current_date.strftime('%Y-%m-%d'),
                    "entry_price": entry_price,
                    "exit_price": exit_p,
                    "units": units,
                    "pnl": net_pnl,
                    "pnl_pct": net_pnl / cash if cash > 0 else 0
                })
                
                cash += net_pnl
                pos, units = 0, 0
                
                if self.trade_direction == 'long-short' and cash > 0:
                    pos = -1
                    entry_price = price * (1 - self.slippage)
                    units = (cash * self.leverage) / entry_price / (1 + self.fee_rate)
                    entry_date = current_date
            
            elif pos == -1 and sig_buy:
                exit_p = price * (1 + self.slippage)
                pnl = (entry_price - exit_p) * units
                fee = exit_p * units * self.fee_rate
                net_pnl = pnl - fee
                
                trades.append({
                    "direction": "做空",
                    "entry_date": entry_date.strftime('%Y-%m-%d') if entry_date else "",
                    "exit_date": current_date.strftime('%Y-%m-%d'),
                    "entry_price": entry_price,
                    "exit_price": exit_p,
                    "units": units,
                    "pnl": net_pnl,
                    "pnl_pct": net_pnl / cash if cash > 0 else 0
                })
                
                cash += net_pnl
                pos, units = 0, 0
                
                if cash > 0:
                    pos = 1
                    entry_price = price * (1 + self.slippage)
                    units = (cash * self.leverage) / entry_price / (1 + self.fee_rate)
                    entry_date = current_date
            
            elif pos == 0 and cash > 0:
                if sig_buy:
                    pos = 1
                    entry_price = price * (1 + self.slippage)
                    units = (cash * self.leverage) / entry_price / (1 + self.fee_rate)
                    entry_date = current_date
                elif sig_sell and self.trade_direction == 'long-short':
                    pos = -1
                    entry_price = price * (1 - self.slippage)
                    units = (cash * self.leverage) / entry_price / (1 + self.fee_rate)
                    entry_date = current_date
        
        # 回測結束時平倉
        if pos != 0 and cash > 0 and len(df) > 0:
            final_price = df['price'].iloc[-1]
            final_date = df['date'].iloc[-1]
            exit_p = final_price * (1 - self.slippage) if pos == 1 else final_price * (1 + self.slippage)
            pnl = (exit_p - entry_price) * units * pos
            fee = exit_p * units * self.fee_rate
            net_pnl = pnl - fee
            
            trades.append({
                "direction": "做多" if pos == 1 else "做空",
                "entry_date": entry_date.strftime('%Y-%m-%d') if entry_date else "",
                "exit_date": final_date.strftime('%Y-%m-%d'),
                "entry_price": entry_price,
                "exit_price": exit_p,
                "units": units,
                "pnl": net_pnl,
                "pnl_pct": net_pnl / cash if cash > 0 else 0
            })
            cash += net_pnl
        
        # 計算績效指標
        final_value = equity_curve[-1]['value'] if equity_curve else self.initial_cash
        total_return = (final_value / self.initial_cash - 1)
        
        # CAGR
        days = (df['date'].iloc[-1] - df['date'].iloc[0]).days
        years = max(days / 365.25, 0.01)
        cagr = (final_value / self.initial_cash) ** (1 / years) - 1
        
        # MDD
        values = [e['value'] for e in equity_curve]
        mdd = self._calc_max_drawdown(values)
        
        # Sharpe
        sharpe = self._calc_sharpe(values)
        
        # 交易統計
        trade_stats = self._calc_trade_stats(trades)
        
        return {
            "final_value": final_value,
            "total_return": total_return,
            "cagr": cagr,
            "mdd": mdd,
            "sharpe": sharpe,
            "equity_curve": equity_curve,
            "trades": trades,
            "trade_stats": trade_stats
        }
    
    def _calc_max_drawdown(self, values: List[float]) -> float:
        """計算最大回撤"""
        if not values:
            return 0
        
        values = np.array(values)
        peaks = np.maximum.accumulate(values)
        drawdowns = (values - peaks) / peaks
        return abs(drawdowns.min()) if len(drawdowns) > 0 else 0
    
    def _calc_sharpe(self, values: List[float], risk_free_rate: float = 0.02) -> float:
        """計算夏普比率"""
        if len(values) < 2:
            return 0
        
        returns = pd.Series(values).pct_change().dropna()
        if returns.std() == 0:
            return 0
        
        avg_return = returns.mean() * 252
        std_dev = returns.std() * np.sqrt(252)
        
        return (avg_return - risk_free_rate) / std_dev
    
    def _calc_trade_stats(self, trades: List[Dict]) -> Dict:
        """計算交易統計"""
        # 排除再平衡
        pure_trades = [t for t in trades if t['direction'] != '再平衡']
        
        if not pure_trades:
            return {
                "total_trades": 0,
                "win_rate": 0,
                "profit_loss_ratio": 0,
                "profit_factor": 0
            }
        
        wins = [t for t in pure_trades if t['pnl'] > 0]
        losses = [t for t in pure_trades if t['pnl'] <= 0]
        
        total_trades = len(pure_trades)
        win_rate = (len(wins) / total_trades) * 100 if total_trades > 0 else 0
        
        avg_win = np.mean([t['pnl'] for t in wins]) if wins else 0
        avg_loss = abs(np.mean([t['pnl'] for t in losses])) if losses else 0
        
        profit_loss_ratio = avg_win / avg_loss if avg_loss > 0 else 0
        
        total_profit = sum(t['pnl'] for t in wins)
        total_loss = abs(sum(t['pnl'] for t in losses))
        profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')
        
        return {
            "total_trades": total_trades,
            "win_rate": win_rate,
            "profit_loss_ratio": profit_loss_ratio,
            "profit_factor": profit_factor
        }
