from trading.services.market_service import MarketService
from trading.services.indicator_service import IndicatorService

try:
    print("Testing get_live_data...")
    live = MarketService.get_live_data('AAPL', fetch_news=False)
    print("Live Data Keys:", list(live.keys()) if live else live)
except Exception as e:
    import traceback
    traceback.print_exc()

try:
    print("\nTesting get_ohlc_with_indicators...")
    ohlc = MarketService.get_ohlc_with_indicators('AAPL')
    print("OHLC Data Keys:", list(ohlc.keys()) if ohlc else ohlc)
except Exception as e:
    import traceback
    traceback.print_exc()
