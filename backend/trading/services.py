def get_live_price(symbol):
    # Lazy import — prevents yfinance from being called at Django startup
    import yfinance as yf
    ticker = yf.Ticker(symbol.upper())
    data = ticker.history(period="1d")
    if data.empty:
        return None
    return float(data["Close"].iloc[-1])
