def get_live_price(symbol):
    # Lazy import to avoid yfinance network calls during Django startup
    from .market_service import MarketService
    data = MarketService.get_live_data(symbol)
    return data['price'] if data else None
