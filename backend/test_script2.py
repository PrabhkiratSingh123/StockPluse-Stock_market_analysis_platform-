import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stock_project.settings')
django.setup()

from trading.services.market_service import MarketService
from trading.services.indicator_service import IndicatorService
from trading.services.ml_service import MLService

try:
    print("Testing get_live_data...")
    live = MarketService.get_live_data('AAPL', fetch_news=False)
    print("Live Data Keys:", list(live.keys()) if live else live)
except Exception as e:
    print("Error in get_live_data:", e)

try:
    print("\nTesting get_ohlc_with_indicators...")
    ohlc = MarketService.get_ohlc_with_indicators('AAPL')
    print("OHLC Data Keys:", list(ohlc.keys()) if ohlc else ohlc)
except Exception as e:
    print("Error in ohlc:", e)

try:
    print("\nTesting indicators...")
    ind = IndicatorService.calculate_indicators('AAPL')
    print("Indicators:", ind)
except Exception as e:
    print("Error in indicators:", e)
