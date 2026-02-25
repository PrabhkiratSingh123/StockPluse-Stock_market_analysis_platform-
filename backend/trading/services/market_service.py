from django.core.cache import cache


# ── News helpers ─────────────────────────────────────────────────────────────

def _parse_yf_news(raw_items):
    """
    Normalise yfinance news items into a consistent dict.
    yfinance ≥ 0.2 wraps everything in a 'content' key.
    Older versions had flat title/link/publisher/providerPublishTime.
    """
    import time as _time
    result = []
    for item in raw_items:
        try:
            # ── New format (yfinance ≥ 0.2) ──────────────────────────────
            if 'content' in item:
                c = item['content'] or {}
                prov = c.get('provider') or {}
                url_obj = c.get('clickThroughUrl') or c.get('canonicalUrl') or {}
                pub_str = c.get('pubDate', '')
                thumbnail = None
                thumb = c.get('thumbnail')
                if isinstance(thumb, dict):
                    resolutions = thumb.get('resolutions') or []
                    if resolutions:
                        # Pick smallest resolution for fast loading
                        thumbnail = sorted(resolutions, key=lambda x: x.get('width', 0))[0].get('url')

                # Convert ISO pubDate → unix timestamp
                ts = None
                if pub_str:
                    try:
                        from datetime import datetime, timezone
                        dt = datetime.fromisoformat(pub_str.replace('Z', '+00:00'))
                        ts = int(dt.timestamp())
                    except Exception:
                        ts = None

                result.append({
                    'title':               c.get('title', ''),
                    'summary':             c.get('summary', ''),
                    'publisher':           prov.get('displayName', '') if isinstance(prov, dict) else str(prov),
                    'link':                url_obj.get('url', '') if isinstance(url_obj, dict) else str(url_obj),
                    'providerPublishTime': ts,
                    'thumbnail':           thumbnail,
                    'source':              'yfinance',
                })

            # ── Old flat format ───────────────────────────────────────────
            else:
                result.append({
                    'title':               item.get('title', ''),
                    'summary':             item.get('summary', ''),
                    'publisher':           item.get('publisher', ''),
                    'link':                item.get('link', ''),
                    'providerPublishTime': item.get('providerPublishTime'),
                    'thumbnail':           None,
                    'source':              'yfinance',
                })
        except Exception:
            continue
    return [r for r in result if r.get('title')]


def _fetch_rss_news(symbol, max_items=8):
    """
    Pull real-time financial news for `symbol` using free RSS feeds.
    Sources: Yahoo Finance RSS, Seeking Alpha RSS, MarketWatch RSS.
    Uses stdlib only (requests already in venv, xml.etree built-in).
    """
    import requests
    import xml.etree.ElementTree as ET
    from datetime import datetime, timezone
    import time as _time
    from email.utils import parsedate_to_datetime

    FEEDS = [
        # Yahoo Finance RSS (symbol-specific)
        f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US",
        # Seeking Alpha RSS
        f"https://seekingalpha.com/api/sa/combined/{symbol}.xml",
        # MarketWatch (general market news – good fallback)
        "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    ]

    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    articles = []

    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; StockPulseBot/1.0)',
        'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    }

    for feed_url in FEEDS:
        if len(articles) >= max_items:
            break
        try:
            resp = requests.get(feed_url, headers=headers, timeout=6)
            if resp.status_code != 200:
                continue

            root = ET.fromstring(resp.content)

            # RSS 2.0: channel/item
            items = root.findall('.//item')
            for item in items[:6]:
                def _text(tag):
                    el = item.find(tag)
                    return el.text.strip() if el is not None and el.text else ''

                title     = _text('title')
                link      = _text('link') or _text('guid')
                pub_date  = _text('pubDate')
                publisher = _text('source') or feed_url.split('/')[2].replace('feeds.', '').replace('www.', '')
                summary   = _text('description')

                # Strip HTML from summary
                if summary:
                    import re
                    summary = re.sub(r'<[^>]+>', '', summary).strip()[:300]

                # Parse timestamp
                ts = None
                if pub_date:
                    try:
                        dt = parsedate_to_datetime(pub_date)
                        ts = int(dt.timestamp())
                    except Exception:
                        ts = None
                if not ts:
                    ts = int(_time.time())

                if title and link:
                    articles.append({
                        'title':               title,
                        'summary':             summary,
                        'publisher':           publisher,
                        'link':                link,
                        'providerPublishTime': ts,
                        'thumbnail':           None,
                        'source':              'rss',
                    })

        except Exception:
            continue

    # Sort by timestamp descending
    articles.sort(key=lambda x: x.get('providerPublishTime') or 0, reverse=True)
    return articles[:max_items]


class MarketService:
    @staticmethod
    def get_branding(symbol):
        """Get logo_url and longName for a symbol, cached for 24h."""
        import yfinance as yf
        symbol = symbol.upper()
        cache_key = f"branding_{symbol}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
            result = {
                "logo_url": info.get('logo_url', ''),
                "long_name": info.get('longName', ''),
                "short_name": info.get('shortName', ''),
            }
        except Exception:
            result = {"logo_url": "", "long_name": "", "short_name": ""}

        cache.set(cache_key, result, 86400)  # Cache 24 hours
        return result

    @staticmethod
    def get_live_data(symbol):
        import yfinance as yf
        symbol = symbol.upper()
        cache_key = f"live_price_{symbol}"
        cached_data = cache.get(cache_key)

        if cached_data:
            return cached_data

        ticker = yf.Ticker(symbol)
        data = ticker.history(period="1d")

        if data.empty:
            return None

        latest = data.iloc[-1]
        info = ticker.info or {}
        prev_close = info.get('previousClose', latest['Close'])
        change = latest['Close'] - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else 0

        # ── News: yfinance + RSS merged ────────────────────────────────
        yf_news = _parse_yf_news(ticker.news[:8] if ticker.news else [])
        rss_news = _fetch_rss_news(symbol, max_items=8)

        # Deduplicate by first ~60 chars of title
        seen_titles = set()
        merged_news = []
        for article in (yf_news + rss_news):
            key = article.get('title', '')[:60].lower().strip()
            if key and key not in seen_titles:
                seen_titles.add(key)
                merged_news.append(article)
            if len(merged_news) >= 12:
                break

        # Sort by publishTime descending
        merged_news.sort(key=lambda x: x.get('providerPublishTime') or 0, reverse=True)

        result = {
            "symbol": symbol,
            "price": round(float(latest['Close']), 2),
            "change": round(float(change), 2),
            "change_pct": round(float(change_pct), 2),
            "volume": int(latest['Volume']),
            "high": round(float(latest['High']), 2),
            "low": round(float(latest['Low']), 2),
            "open": round(float(latest['Open']), 2),
            # Company branding & Bio
            "logo_url": info.get('logo_url', ''),
            "long_name": info.get('longName', ''),
            "short_name": info.get('shortName', ''),
            "summary": info.get('longBusinessSummary', ''),
            "sector": info.get('sector', ''),
            "industry": info.get('industry', ''),
            # Fundamental data
            "market_cap": info.get('marketCap'),
            "pe_ratio": info.get('trailingPE'),
            "eps": info.get('trailingEps'),
            "dividend_yield": info.get('dividendYield'),
            "beta": info.get('beta'),
            "target_mean_price": info.get('targetMeanPrice'),
            "target_high_price": info.get('targetHighPrice'),
            "target_low_price": info.get('targetLowPrice'),
            "recommendation": info.get('recommendationKey', ''),
            "number_of_analysts": info.get('numberOfAnalystOpinions'),
            # Real-time news (yfinance + RSS merged)
            "news": merged_news,
        }

        # Cache live data for 5 minutes
        cache.set(cache_key, result, 300)
        return result


    @staticmethod
    def get_historical_data(symbol, period="1mo", interval="1d"):
        import yfinance as yf
        ticker = yf.Ticker(symbol.upper())
        data = ticker.history(period=period, interval=interval)
        
        if data.empty:
            return None
            
        return data.reset_index().to_dict(orient='records')

    @staticmethod
    def get_ohlc_with_indicators(symbol, period="3mo", interval="1d"):
        """Return OHLC data with EMA(20) and RSI(14) time-series for charting."""
        import yfinance as yf
        import pandas as pd
        
        symbol = symbol.upper()
        cache_key = f"ohlc_indicators_{symbol}_{period}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        
        if df.empty or len(df) < 20:
            return None

        # EMA 20
        df['EMA_20'] = df['Close'].ewm(span=20, adjust=False).mean()
        
        # RSI 14
        delta = df['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['RSI_14'] = 100 - (100 / (1 + rs))

        # OHLC for candlestick
        ohlc = []
        ema_series = []
        rsi_series = []

        for idx, row in df.iterrows():
            ts = int(idx.timestamp() * 1000)  # millisecond timestamp
            ohlc.append({
                "x": ts,
                "y": [
                    round(float(row['Open']), 2),
                    round(float(row['High']), 2),
                    round(float(row['Low']), 2),
                    round(float(row['Close']), 2),
                ]
            })
            ema_val = round(float(row['EMA_20']), 2) if not pd.isna(row['EMA_20']) else None
            ema_series.append({"x": ts, "y": ema_val})

            rsi_val = round(float(row['RSI_14']), 2) if not pd.isna(row['RSI_14']) else None
            rsi_series.append({"x": ts, "y": rsi_val})

        # Volume series
        volume_series = []
        for idx, row in df.iterrows():
            ts = int(idx.timestamp() * 1000)
            volume_series.append({
                "x": ts,
                "y": int(row['Volume']),
                "fillColor": '#10b981' if row['Close'] >= row['Open'] else '#ef4444'
            })

        # Fundamentals
        info = ticker.info or {}

        result = {
            "symbol": symbol,
            "ohlc": ohlc,
            "ema_20": ema_series,
            "rsi_14": rsi_series,
            "volume": volume_series,
            "current_price": round(float(df.iloc[-1]['Close']), 2),
            # Branding
            "logo_url": info.get('logo_url', ''),
            "long_name": info.get('longName', ''),
            "short_name": info.get('shortName', ''),
            # Fundamentals
            "target_mean_price": info.get('targetMeanPrice'),
            "target_high_price": info.get('targetHighPrice'),
            "target_low_price": info.get('targetLowPrice'),
            "dividend_yield": info.get('dividendYield'),
            "beta": info.get('beta'),
            "pe_ratio": info.get('trailingPE'),
            "market_cap": info.get('marketCap'),
            "fifty_two_week_high": info.get('fiftyTwoWeekHigh'),
            "fifty_two_week_low": info.get('fiftyTwoWeekLow'),
            "recommendation": info.get('recommendationKey'),
        }

        cache.set(cache_key, result, 600)  # Cache 10 min
        return result

    @staticmethod
    def get_sparkline(symbol, period="1mo"):
        """Return simple close price series for sparklines."""
        import yfinance as yf
        
        symbol = symbol.upper()
        cache_key = f"sparkline_{symbol}_{period}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period)
        
        if df.empty:
            return []

        prices = [round(float(c), 2) for c in df['Close'].tolist()]
        cache.set(cache_key, prices, 600)
        return prices
