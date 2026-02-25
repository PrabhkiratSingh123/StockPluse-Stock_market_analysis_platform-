class IndicatorService:
    @staticmethod
    def calculate_indicators(symbol):
        import pandas as pd     # lazy — avoids OpenBLAS error at startup
        import yfinance as yf
        # Fetch 60 days of data to calculate 14-day indicators accurately
        ticker = yf.Ticker(symbol.upper())
        df = ticker.history(period="60d")
        
        if df.empty or len(df) < 20:
            return None

        # SMA
        df['SMA_14'] = df['Close'].rolling(window=14).mean()
        df['SMA_50'] = df['Close'].rolling(window=50).mean()
        
        # EMA
        df['EMA_14'] = df['Close'].ewm(span=14, adjust=False).mean()
        df['EMA_20'] = df['Close'].ewm(span=20, adjust=False).mean()
        
        # RSI
        delta = df['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['RSI'] = 100 - (100 / (1 + rs))
        
        # MACD
        exp1 = df['Close'].ewm(span=12, adjust=False).mean()
        exp2 = df['Close'].ewm(span=26, adjust=False).mean()
        df['MACD'] = exp1 - exp2
        df['Signal_Line'] = df['MACD'].ewm(span=9, adjust=False).mean()
        df['MACD_Histogram'] = df['MACD'] - df['Signal_Line']
        
        # Bollinger Bands
        df['BB_Middle'] = df['Close'].rolling(window=20).mean()
        bb_std = df['Close'].rolling(window=20).std()
        df['BB_Upper'] = df['BB_Middle'] + (bb_std * 2)
        df['BB_Lower'] = df['BB_Middle'] - (bb_std * 2)

        # ATR (Average True Range)
        high_low = df['High'] - df['Low']
        high_close = (df['High'] - df['Close'].shift()).abs()
        low_close = (df['Low'] - df['Close'].shift()).abs()
        import numpy as np
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        df['ATR'] = tr.rolling(window=14).mean()

        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest

        # Signal Logic
        rsi_val = round(float(latest['RSI']), 2) if not pd.isna(latest['RSI']) else None
        macd_val = round(float(latest['MACD']), 2) if not pd.isna(latest['MACD']) else None
        signal_val = round(float(latest['Signal_Line']), 2) if not pd.isna(latest['Signal_Line']) else None

        # Determine overall signal
        signal = "NEUTRAL"
        if rsi_val:
            if rsi_val < 30:
                signal = "OVERSOLD"
            elif rsi_val > 70:
                signal = "OVERBOUGHT"
            elif rsi_val < 45 and macd_val and macd_val > 0:
                signal = "BULLISH"
            elif rsi_val > 55 and macd_val and macd_val < 0:
                signal = "BEARISH"
        
        return {
            "symbol": symbol.upper(),
            "RSI": rsi_val,
            "MACD": macd_val,
            "Signal_Line": signal_val,
            "MACD_Histogram": round(float(latest['MACD_Histogram']), 2) if not pd.isna(latest.get('MACD_Histogram', float('nan'))) else None,
            "SMA_14": round(float(latest['SMA_14']), 2) if not pd.isna(latest['SMA_14']) else None,
            "SMA_50": round(float(latest['SMA_50']), 2) if not pd.isna(latest.get('SMA_50', float('nan'))) else None,
            "EMA_14": round(float(latest['EMA_14']), 2) if not pd.isna(latest['EMA_14']) else None,
            "EMA_20": round(float(latest['EMA_20']), 2) if not pd.isna(latest.get('EMA_20', float('nan'))) else None,
            "BB_Upper": round(float(latest['BB_Upper']), 2) if not pd.isna(latest.get('BB_Upper', float('nan'))) else None,
            "BB_Middle": round(float(latest['BB_Middle']), 2) if not pd.isna(latest.get('BB_Middle', float('nan'))) else None,
            "BB_Lower": round(float(latest['BB_Lower']), 2) if not pd.isna(latest.get('BB_Lower', float('nan'))) else None,
            "ATR": round(float(latest['ATR']), 2) if not pd.isna(latest.get('ATR', float('nan'))) else None,
            "signal": signal,
            "price_vs_ema20": "ABOVE" if latest['Close'] > latest['EMA_20'] else "BELOW",
        }
