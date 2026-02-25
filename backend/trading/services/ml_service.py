import random
from .indicator_service import IndicatorService
from django.core.cache import cache

class MLService:
    @staticmethod
    def predict_trend(symbol):
        symbol = symbol.upper()
        cache_key = f"prediction_{symbol}"
        cached_pred = cache.get(cache_key)
        
        if cached_pred:
            return cached_pred

        indicators = IndicatorService.calculate_indicators(symbol)
        if not indicators:
            return None
            
        # Mock ML logic based on indicators
        rsi = indicators['RSI']
        macd = indicators['MACD']
        
        trend = "Neutral"
        confidence = random.uniform(60, 85)
        
        if rsi and rsi < 40:
            trend = "Bullish"
        elif rsi and rsi > 60:
            trend = "Bearish"
            
        if macd and macd > 0:
            trend = "Bullish" if trend != "Bearish" else "Neutral"
            
        # Mock 7-day forecast
        # In a real app, this would use a saved .pkl model (LSTM/Regression)
        result = {
            "symbol": symbol.upper(),
            "trend": trend,
            "confidence_score": round(confidence, 2),
            "forecast_7d": "Higher" if trend == "Bullish" else ("Lower" if trend == "Bearish" else "Stable"),
            "model_type": "RandomForestRegressor (Mock)",
            "accuracy": "82.4%"
        }
        
        # Cache prediction for 1 hour
        cache.set(cache_key, result, 3600)
        return result
