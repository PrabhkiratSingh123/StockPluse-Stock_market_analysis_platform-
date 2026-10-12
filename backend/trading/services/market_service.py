from django.core.cache import cache
import random
import time
import requests as _requests


# ── Robust yfinance session ───────────────────────────────────────────────────
# Render/Railway share datacenter IPs that Yahoo Finance rate-limits/blocks.
# Passing a realistic browser session to yfinance and rotating User-Agents
# significantly reduces the chance of getting blocked.

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def _get_yf_session():
    """Return a requests.Session with browser-like headers for yfinance."""
    session = _requests.Session()
    session.headers.update({
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    })
    return session


def _yf_ticker(symbol, session=None):
    """Create a yfinance Ticker with a robust session."""
    import yfinance as yf
    return yf.Ticker(symbol.upper(), session=session or _get_yf_session())


def _fetch_history_with_retry(symbol, period="1d", interval="1d", max_retries=3):
    """
    Fetch ticker history with retry + exponential backoff.
    Returns (DataFrame, ticker) or (empty_df, None) on total failure.
    """
    import pandas as pd
    last_exc = None
    for attempt in range(max_retries):
        try:
            ticker = _yf_ticker(symbol)
            df = ticker.history(period=period, interval=interval)
            if not df.empty:
                return df, ticker
        except Exception as e:
            last_exc = e
        if attempt < max_retries - 1:
            time.sleep(0.5 * (2 ** attempt))  # 0.5s, 1s, 2s
    return None, None


# ── Free fallback: Financial Modeling Prep (no API key for basic quotes) ──────

def _fmp_get_price(symbol):
    """
    Fetch live price from Financial Modeling Prep free API.
    Returns a minimal dict compatible with get_live_data() result, or None.
    """
    try:
        url = f"https://financialmodelingprep.com/api/v3/quote-short/{symbol.upper()}?apikey=demo"
        resp = _requests.get(url, timeout=5, headers={"User-Agent": random.choice(_USER_AGENTS)})
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data or not isinstance(data, list):
            return None
        item = data[0]
        price = item.get("price")
        if not price:
            return None
        return {
            "symbol": symbol.upper(),
            "price": round(float(price), 2),
            "change": round(float(item.get("change", 0)), 2),
            "change_pct": round(float(item.get("changesPercentage", 0)), 2),
            "volume": int(item.get("volume", 0)),
            "high": round(float(price), 2),
            "low": round(float(price), 2),
            "open": round(float(price), 2),
            "logo_url": "",
            "long_name": symbol.upper(),
            "short_name": symbol.upper(),
            "summary": "",
            "sector": "",
            "industry": "",
            "market_cap": None,
            "pe_ratio": None,
            "eps": None,
            "dividend_yield": None,
            "beta": None,
            "target_mean_price": None,
            "target_high_price": None,
            "target_low_price": None,
            "recommendation": "",
            "number_of_analysts": None,
            "news": [],
        }
    except Exception:
        return None


def _stooq_get_price(symbol):
    """
    Secondary free fallback: Stooq.com daily data (no API key, no rate limits for cloud IPs).
    Returns a minimal price dict, or None.
    """
    try:
        # Stooq uses .US suffix for US stocks
        stooq_sym = f"{symbol.upper()}.US"
        url = f"https://stooq.com/q/d/l/?s={stooq_sym}&i=d"
        resp = _requests.get(url, timeout=5, headers={"User-Agent": random.choice(_USER_AGENTS)})
        if resp.status_code != 200 or not resp.text.strip():
            return None
        lines = resp.text.strip().split("\n")
        if len(lines) < 2:
            return None
        # CSV: Date,Open,High,Low,Close,Volume
        last = lines[-1].split(",")
        if len(last) < 5:
            return None
        close = float(last[4])
        prev_line = lines[-2].split(",") if len(lines) >= 3 else last
        prev_close = float(prev_line[4]) if len(prev_line) >= 5 else close
        change = close - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        return {
            "symbol": symbol.upper(),
            "price": round(close, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "volume": int(float(last[5])) if len(last) > 5 else 0,
            "high": round(float(last[2]), 2),
            "low": round(float(last[3]), 2),
            "open": round(float(last[1]), 2),
            "logo_url": "",
            "long_name": symbol.upper(),
            "short_name": symbol.upper(),
            "summary": "",
            "sector": "",
            "industry": "",
            "market_cap": None,
            "pe_ratio": None,
            "eps": None,
            "dividend_yield": None,
            "beta": None,
            "target_mean_price": None,
            "target_high_price": None,
            "target_low_price": None,
            "recommendation": "",
            "number_of_analysts": None,
            "news": [],
        }
    except Exception:
        return None


# ── News helpers ─────────────────────────────────────────────────────────────

def _parse_yf_news(raw_items):
    """
    Normalise yfinance news items into a consistent dict.
    yfinance ≥ 0.2 wraps everything in a 'content' key.
    Older versions had flat title/link/publisher/providerPublishTime.
    """
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
    import xml.etree.ElementTree as ET
    from datetime import datetime, timezone
    from email.utils import parsedate_to_datetime
    import re

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
            resp = _requests.get(feed_url, headers=headers, timeout=3)
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
                    ts = int(time.time())

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
        symbol = symbol.upper()
        cache_key = f"branding_{symbol}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            ticker = _yf_ticker(symbol)
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
    def get_price_only(symbol):
        """Fast method: only fetches price/OHLC. No ticker.info, no news. Used by analytics."""
        symbol = symbol.upper()
        cache_key = f"price_only_{symbol}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        # --- Try yfinance with retry ---
        df, ticker = _fetch_history_with_retry(symbol, period="2d", interval="1d")

        if df is not None and not df.empty:
            try:
                row = df.iloc[-1]
                price = float(row['Close'])
                prev = float(df.iloc[-2]['Close']) if len(df) > 1 else price
                change = price - prev
                change_pct = (change / prev * 100) if prev else 0
                result = {
                    "symbol": symbol,
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "change_pct": round(change_pct, 2),
                    "volume": int(row['Volume']),
                    "high": round(float(row['High']), 2),
                    "low": round(float(row['Low']), 2),
                    "open": round(float(row['Open']), 2),
                    "logo_url": "", "long_name": "", "short_name": "", "news": [],
                }
                cache.set(cache_key, result, 120)  # 2 min cache
                return result
            except Exception:
                pass

        # --- Fallback: FMP ---
        result = _fmp_get_price(symbol)
        if result:
            cache.set(cache_key, result, 120)
            return result

        # --- Fallback: Stooq ---
        result = _stooq_get_price(symbol)
        if result:
            cache.set(cache_key, result, 120)
        return result

    @staticmethod
    def get_live_data(symbol, fetch_news=True):
        symbol = symbol.upper()
        # Always use the same cache key – news is just extra data layered on top
        cache_key = f"live_price_{symbol}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

        # --- Try yfinance with retry ---
        df, ticker = _fetch_history_with_retry(symbol, period="2d", interval="1d")

        if df is not None and not df.empty:
            try:
                latest = df.iloc[-1]

                # Fetch ticker.info separately — don't let it crash the whole call
                info = {}
                try:
                    info = ticker.info or {}
                except Exception:
                    info = {}

                fast_info = getattr(ticker, 'fast_info', None)
                prev_close = info.get('previousClose')
                if prev_close is None and fast_info:
                    prev_close = getattr(fast_info, 'previous_close', None)
                if prev_close is None:
                    # Use previous day's close from history if available
                    prev_close = float(df.iloc[-2]['Close']) if len(df) > 1 else float(latest['Close'])

                change = float(latest['Close']) - float(prev_close)
                change_pct = (change / float(prev_close)) * 100 if prev_close else 0

                merged_news = []
                if fetch_news:
                    try:
                        yf_news = _parse_yf_news(ticker.news[:8] if ticker.news else [])
                    except Exception:
                        yf_news = []
                    rss_news = _fetch_rss_news(symbol, max_items=8)
                    seen_titles = set()
                    for article in (yf_news + rss_news):
                        key = article.get('title', '')[:60].lower().strip()
                        if key and key not in seen_titles:
                            seen_titles.add(key)
                            merged_news.append(article)
                        if len(merged_news) >= 12:
                            break
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
                    "logo_url": info.get('logo_url', ''),
                    "long_name": info.get('longName', ''),
                    "short_name": info.get('shortName', ''),
                    "summary": info.get('longBusinessSummary', ''),
                    "sector": info.get('sector', ''),
                    "industry": info.get('industry', ''),
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
                    "news": merged_news,
                }
                cache.set(cache_key, result, 300)  # 5 min cache
                return result
            except Exception:
                pass

        # --- Fallback: FMP (no API key, returns basic price data) ---
        result = _fmp_get_price(symbol)
        if result:
            if fetch_news:
                result["news"] = _fetch_rss_news(symbol, max_items=8)
            cache.set(cache_key, result, 300)
            return result

        # --- Fallback: Stooq ---
        result = _stooq_get_price(symbol)
        if result:
            if fetch_news:
                result["news"] = _fetch_rss_news(symbol, max_items=8)
            cache.set(cache_key, result, 300)
        return result


    @staticmethod
    def get_historical_data(symbol, period="1mo", interval="1d"):
        df, _ = _fetch_history_with_retry(symbol, period=period, interval=interval)
        if df is None or df.empty:
            return None
        return df.reset_index().to_dict(orient='records')

    @staticmethod
    def get_ohlc_with_indicators(symbol, period="3mo", interval="1d"):
        """Return OHLC data with EMA(20) and RSI(14) time-series for charting."""
        import pandas as pd

        symbol = symbol.upper()
        cache_key = f"ohlc_indicators_{symbol}_{period}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        df, ticker = _fetch_history_with_retry(symbol, period=period, interval=interval, max_retries=3)

        if df is None or df.empty or len(df) < 20:
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

        # Fundamentals — non-fatal if ticker is None
        info = {}
        try:
            if ticker:
                info = ticker.info or {}
        except Exception:
            info = {}

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
        symbol = symbol.upper()
        cache_key = f"sparkline_{symbol}_{period}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        df, _ = _fetch_history_with_retry(symbol, period=period, interval="1d")

        if df is None or df.empty:
            return []

        prices = [round(float(c), 2) for c in df['Close'].tolist()]
        cache.set(cache_key, prices, 600)
        return prices
