"""
market_service.py — Bulletproof multi-source stock data fetcher
================================================================
Data source waterfall (tried in order, first success wins):
  1. Yahoo Finance v8 JSON API  — direct HTTP, no library, best reliability
  2. Stooq CSV API              — completely cloud-IP-friendly, no key needed
  3. yfinance library           — with rotating User-Agent + retry
  4. Financial Modeling Prep    — free demo endpoint, last resort

This ensures live prices NEVER fail regardless of IP blocks or rate-limits.
"""

from django.core.cache import cache
import random
import time
import requests as _requests
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Shared browser headers — rotate UA so Yahoo/Cloudflare doesn't fingerprint us
# ─────────────────────────────────────────────────────────────────────────────

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]

_YAHOO_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
    "DNT": "1",
    "Connection": "keep-alive",
}

_PERIOD_TO_RANGE = {
    "1d": "5d",   # ask for 5d so we always get at least 2 data points
    "2d": "5d",
    "5d": "5d",
    "1mo": "1mo",
    "3mo": "3mo",
    "6mo": "6mo",
    "1y": "1y",
    "2y": "2y",
    "5y": "5y",
    "60d": "3mo",
}


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 1 — Direct Yahoo Finance v8 Chart API
# ─────────────────────────────────────────────────────────────────────────────

def _yahoo_v8_quote(symbol):
    """
    Fetch real-time quote from Yahoo Finance v8 API directly.
    Returns a raw dict with price/change/ohlv or None.
    """
    symbol = symbol.upper()
    endpoints = [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
    ]
    params = {"interval": "1d", "range": "5d", "includePrePost": "false"}

    for url in endpoints:
        try:
            headers = {**_YAHOO_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}
            resp = _requests.get(url, headers=headers, params=params, timeout=8)
            if resp.status_code != 200:
                continue
            data = resp.json()
            chart = data.get("chart", {})
            if chart.get("error"):
                continue
            results = chart.get("result") or []
            if not results:
                continue

            r = results[0]
            meta = r.get("meta", {})
            indicators = r.get("indicators", {}).get("quote", [{}])
            q = indicators[0] if indicators else {}

            closes  = q.get("close",  []) or []
            opens   = q.get("open",   []) or []
            highs   = q.get("high",   []) or []
            lows    = q.get("low",    []) or []
            volumes = q.get("volume", []) or []

            # Find last non-None index
            valid = [(i, c) for i, c in enumerate(closes) if c is not None]
            if not valid:
                continue
            idx, price = valid[-1]

            prev_close = (
                meta.get("chartPreviousClose")
                or meta.get("previousClose")
                or (valid[-2][1] if len(valid) > 1 else price)
            )
            change     = price - prev_close
            change_pct = (change / prev_close * 100) if prev_close else 0

            return {
                "price":      round(float(price), 2),
                "change":     round(float(change), 2),
                "change_pct": round(float(change_pct), 2),
                "volume":     int(volumes[idx]) if idx < len(volumes) and volumes[idx] else 0,
                "high":       round(float(highs[idx]),  2) if idx < len(highs)  and highs[idx]  else round(float(price), 2),
                "low":        round(float(lows[idx]),   2) if idx < len(lows)   and lows[idx]   else round(float(price), 2),
                "open":       round(float(opens[idx]),  2) if idx < len(opens)  and opens[idx]  else round(float(price), 2),
                "long_name":  meta.get("longName",  symbol),
                "short_name": meta.get("shortName", symbol),
            }
        except Exception as e:
            logger.debug(f"[yahoo_v8_quote] {symbol} failed: {e}")
            continue
    return None


def _yahoo_v8_history(symbol, period="3mo", interval="1d"):
    """
    Fetch OHLCV history from Yahoo Finance v8 API directly.
    Returns list of dicts with keys: date, open, high, low, close, volume. Or None.
    """
    symbol  = symbol.upper()
    yrange  = _PERIOD_TO_RANGE.get(period, period)
    endpoints = [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
    ]
    params = {"interval": interval, "range": yrange, "includePrePost": "false"}

    for url in endpoints:
        try:
            headers = {**_YAHOO_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}
            resp = _requests.get(url, headers=headers, params=params, timeout=10)
            if resp.status_code != 200:
                continue
            data  = resp.json()
            chart = data.get("chart", {})
            if chart.get("error"):
                continue
            results = chart.get("result") or []
            if not results:
                continue

            r          = results[0]
            timestamps = r.get("timestamp", []) or []
            q          = (r.get("indicators", {}).get("quote") or [{}])[0]
            closes     = q.get("close",  []) or []
            opens      = q.get("open",   []) or []
            highs      = q.get("high",   []) or []
            lows       = q.get("low",    []) or []
            volumes    = q.get("volume", []) or []

            rows = []
            for i, ts in enumerate(timestamps):
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                rows.append({
                    "date":   ts,           # unix timestamp (seconds)
                    "open":   float(opens[i])   if i < len(opens)   and opens[i]   is not None else float(c),
                    "high":   float(highs[i])   if i < len(highs)   and highs[i]   is not None else float(c),
                    "low":    float(lows[i])    if i < len(lows)    and lows[i]    is not None else float(c),
                    "close":  float(c),
                    "volume": int(volumes[i])   if i < len(volumes) and volumes[i] is not None else 0,
                })
            if rows:
                return rows
        except Exception as e:
            logger.debug(f"[yahoo_v8_history] {symbol} failed: {e}")
            continue
    return None


def _yahoo_v8_info(symbol):
    """
    Fetch company fundamentals from Yahoo Finance quoteSummary API.
    Returns a dict of fundamentals (pe, market_cap, etc.) or {}.
    """
    symbol = symbol.upper()
    modules = "summaryProfile,summaryDetail,defaultKeyStatistics,financialData,assetProfile"
    url = f"https://query1.finance.yahoo.com/v11/finance/quoteSummary/{symbol}"
    params = {"modules": modules}
    try:
        headers = {**_YAHOO_HEADERS, "User-Agent": random.choice(_USER_AGENTS)}
        resp = _requests.get(url, headers=headers, params=params, timeout=8)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        qs = data.get("quoteSummary", {})
        if qs.get("error"):
            return {}
        result_list = qs.get("result") or []
        if not result_list:
            return {}

        merged = {}
        for section in result_list:
            for v in section.values():
                if isinstance(v, dict):
                    for k, val in v.items():
                        # yfinance-style: unwrap {raw, fmt} objects
                        if isinstance(val, dict) and "raw" in val:
                            merged[k] = val["raw"]
                        elif not isinstance(val, dict):
                            merged[k] = val
        return merged
    except Exception as e:
        logger.debug(f"[yahoo_v8_info] {symbol} failed: {e}")
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 2 — Stooq.com CSV  (cloud-IP friendly, no key, no rate limit)
# ─────────────────────────────────────────────────────────────────────────────

def _stooq_quote(symbol):
    """Fetch last-day quote from Stooq CSV. Returns price dict or None."""
    try:
        stooq_sym = f"{symbol.upper()}.US"
        url = f"https://stooq.com/q/d/l/?s={stooq_sym}&i=d"
        resp = _requests.get(url, timeout=6,
                             headers={"User-Agent": random.choice(_USER_AGENTS)})
        if resp.status_code != 200 or not resp.text.strip():
            return None
        lines = [l for l in resp.text.strip().split("\n") if l.strip()]
        if len(lines) < 2:
            return None
        # CSV: Date,Open,High,Low,Close,Volume
        last  = lines[-1].split(",")
        prev  = lines[-2].split(",") if len(lines) >= 3 else last
        if len(last) < 5:
            return None
        close      = float(last[4])
        prev_close = float(prev[4]) if len(prev) >= 5 else close
        change     = close - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        return {
            "price":      round(close, 2),
            "change":     round(change, 2),
            "change_pct": round(change_pct, 2),
            "volume":     int(float(last[5])) if len(last) > 5 and last[5].strip() else 0,
            "high":       round(float(last[2]), 2),
            "low":        round(float(last[3]), 2),
            "open":       round(float(last[1]), 2),
            "long_name":  symbol.upper(),
            "short_name": symbol.upper(),
        }
    except Exception as e:
        logger.debug(f"[stooq_quote] {symbol} failed: {e}")
        return None


def _stooq_history(symbol, period="3mo"):
    """Fetch historical OHLCV from Stooq. Returns list of row dicts or None."""
    try:
        from datetime import datetime, timedelta
        period_days = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825,
                       "60d": 60, "2d": 2, "5d": 5}.get(period, 90)
        end   = datetime.utcnow()
        start = end - timedelta(days=period_days)
        s = start.strftime("%Y%m%d")
        e = end.strftime("%Y%m%d")
        stooq_sym = f"{symbol.upper()}.US"
        url = f"https://stooq.com/q/d/l/?s={stooq_sym}&d1={s}&d2={e}&i=d"
        resp = _requests.get(url, timeout=8,
                             headers={"User-Agent": random.choice(_USER_AGENTS)})
        if resp.status_code != 200 or not resp.text.strip():
            return None
        lines = [l for l in resp.text.strip().split("\n") if l.strip()]
        if len(lines) < 2:
            return None
        rows = []
        for line in lines[1:]:  # skip header
            parts = line.split(",")
            if len(parts) < 5:
                continue
            try:
                dt = datetime.strptime(parts[0].strip(), "%Y-%m-%d")
                rows.append({
                    "date":   int(dt.timestamp()),
                    "open":   float(parts[1]),
                    "high":   float(parts[2]),
                    "low":    float(parts[3]),
                    "close":  float(parts[4]),
                    "volume": int(float(parts[5])) if len(parts) > 5 and parts[5].strip() else 0,
                })
            except Exception:
                continue
        return rows if rows else None
    except Exception as e:
        logger.debug(f"[stooq_history] {symbol} failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 3 — yfinance library with robust session + retry
# ─────────────────────────────────────────────────────────────────────────────

def _get_yf_session():
    session = _requests.Session()
    session.headers.update({
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
    })
    return session


def _yf_ticker(symbol, session=None):
    import yfinance as yf
    return yf.Ticker(symbol.upper(), session=session or _get_yf_session())


def _fetch_history_with_retry(symbol, period="1d", interval="1d", max_retries=3):
    """yfinance history fetch with retry + exponential backoff."""
    for attempt in range(max_retries):
        try:
            ticker = _yf_ticker(symbol)
            df = ticker.history(period=period, interval=interval)
            if df is not None and not df.empty:
                return df, ticker
        except Exception as e:
            logger.debug(f"[yf_retry] {symbol} attempt {attempt+1} failed: {e}")
        if attempt < max_retries - 1:
            time.sleep(0.4 * (2 ** attempt))  # 0.4s → 0.8s → 1.6s
    return None, None


def _yf_quote(symbol):
    """yfinance quote as fallback. Returns price dict or None."""
    try:
        df, ticker = _fetch_history_with_retry(symbol, period="5d", interval="1d")
        if df is None or df.empty:
            return None
        row        = df.iloc[-1]
        price      = float(row["Close"])
        prev_close = float(df.iloc[-2]["Close"]) if len(df) > 1 else price
        change     = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        info = {}
        try:
            info = ticker.info or {}
        except Exception:
            pass
        return {
            "price":      round(price, 2),
            "change":     round(change, 2),
            "change_pct": round(change_pct, 2),
            "volume":     int(row["Volume"]),
            "high":       round(float(row["High"]), 2),
            "low":        round(float(row["Low"]), 2),
            "open":       round(float(row["Open"]), 2),
            "long_name":  info.get("longName", symbol.upper()),
            "short_name": info.get("shortName", symbol.upper()),
            "_info":      info,
            "_df":        df,
            "_ticker":    ticker,
        }
    except Exception as e:
        logger.debug(f"[yf_quote] {symbol} failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 4 — Financial Modeling Prep (free demo, last resort)
# ─────────────────────────────────────────────────────────────────────────────

def _fmp_quote(symbol):
    """FMP free demo quote endpoint — last resort. Returns price dict or None."""
    try:
        url  = f"https://financialmodelingprep.com/api/v3/quote-short/{symbol.upper()}?apikey=demo"
        resp = _requests.get(url, timeout=6,
                             headers={"User-Agent": random.choice(_USER_AGENTS)})
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data or not isinstance(data, list):
            return None
        item  = data[0]
        price = item.get("price")
        if not price:
            return None
        return {
            "price":      round(float(price), 2),
            "change":     round(float(item.get("change", 0)), 2),
            "change_pct": round(float(item.get("changesPercentage", 0)), 2),
            "volume":     int(item.get("volume", 0)),
            "high":       round(float(price), 2),
            "low":        round(float(price), 2),
            "open":       round(float(price), 2),
            "long_name":  symbol.upper(),
            "short_name": symbol.upper(),
        }
    except Exception as e:
        logger.debug(f"[fmp_quote] {symbol} failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Unified waterfall: tries all 4 sources in order
# ─────────────────────────────────────────────────────────────────────────────

def _get_quote(symbol):
    """
    Returns a minimal quote dict (price, change, change_pct, volume, high, low, open,
    long_name, short_name) by trying all 4 sources in sequence.
    Returns None only if EVERY source fails.
    """
    symbol = symbol.upper()

    q = _yahoo_v8_quote(symbol)
    if q:
        logger.debug(f"[_get_quote] {symbol} ← yahoo_v8")
        return q

    q = _stooq_quote(symbol)
    if q:
        logger.debug(f"[_get_quote] {symbol} ← stooq")
        return q

    q = _yf_quote(symbol)
    if q:
        logger.debug(f"[_get_quote] {symbol} ← yfinance")
        return q

    q = _fmp_quote(symbol)
    if q:
        logger.debug(f"[_get_quote] {symbol} ← fmp")
        return q

    logger.warning(f"[_get_quote] ALL sources failed for {symbol}")
    return None


def _get_history(symbol, period="3mo", interval="1d"):
    """
    Returns list of row dicts [{date(unix), open, high, low, close, volume}]
    by trying all available sources in order.
    Returns None only if everything fails.
    """
    symbol = symbol.upper()

    rows = _yahoo_v8_history(symbol, period=period, interval=interval)
    if rows:
        logger.debug(f"[_get_history] {symbol}/{period} ← yahoo_v8")
        return rows

    rows = _stooq_history(symbol, period=period)
    if rows:
        logger.debug(f"[_get_history] {symbol}/{period} ← stooq")
        return rows

    # yfinance fallback — convert DataFrame to list of dicts
    df, _ = _fetch_history_with_retry(symbol, period=period, interval=interval, max_retries=3)
    if df is not None and not df.empty:
        rows = []
        for idx, row in df.iterrows():
            rows.append({
                "date":   int(idx.timestamp()),
                "open":   float(row["Open"]),
                "high":   float(row["High"]),
                "low":    float(row["Low"]),
                "close":  float(row["Close"]),
                "volume": int(row["Volume"]),
            })
        if rows:
            logger.debug(f"[_get_history] {symbol}/{period} ← yfinance")
            return rows

    logger.warning(f"[_get_history] ALL sources failed for {symbol}/{period}")
    return None


# ─────────────────────────────────────────────────────────────────────────────
# News helpers
# ─────────────────────────────────────────────────────────────────────────────

def _parse_yf_news(raw_items):
    """Normalise yfinance news items. Works with both old & new yfinance formats."""
    result = []
    for item in raw_items:
        try:
            if "content" in item:
                c        = item["content"] or {}
                prov     = c.get("provider") or {}
                url_obj  = c.get("clickThroughUrl") or c.get("canonicalUrl") or {}
                pub_str  = c.get("pubDate", "")
                thumbnail = None
                thumb = c.get("thumbnail")
                if isinstance(thumb, dict):
                    resolutions = thumb.get("resolutions") or []
                    if resolutions:
                        thumbnail = sorted(resolutions, key=lambda x: x.get("width", 0))[0].get("url")
                ts = None
                if pub_str:
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                        ts = int(dt.timestamp())
                    except Exception:
                        ts = None
                result.append({
                    "title":               c.get("title", ""),
                    "summary":             c.get("summary", ""),
                    "publisher":           prov.get("displayName", "") if isinstance(prov, dict) else str(prov),
                    "link":                url_obj.get("url", "") if isinstance(url_obj, dict) else str(url_obj),
                    "providerPublishTime": ts,
                    "thumbnail":           thumbnail,
                    "source":              "yfinance",
                })
            else:
                result.append({
                    "title":               item.get("title", ""),
                    "summary":             item.get("summary", ""),
                    "publisher":           item.get("publisher", ""),
                    "link":                item.get("link", ""),
                    "providerPublishTime": item.get("providerPublishTime"),
                    "thumbnail":           None,
                    "source":              "yfinance",
                })
        except Exception:
            continue
    return [r for r in result if r.get("title")]


def _fetch_rss_news(symbol, max_items=8):
    """Pull news from free RSS feeds. Always returns a list (possibly empty)."""
    import xml.etree.ElementTree as ET
    import re
    from email.utils import parsedate_to_datetime

    FEEDS = [
        f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US",
        f"https://seekingalpha.com/api/sa/combined/{symbol}.xml",
        "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; StockPulseBot/1.0)",
        "Accept": "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
    }
    articles = []
    for feed_url in FEEDS:
        if len(articles) >= max_items:
            break
        try:
            resp = _requests.get(feed_url, headers=headers, timeout=4)
            if resp.status_code != 200:
                continue
            root  = ET.fromstring(resp.content)
            items = root.findall(".//item")
            for item in items[:6]:
                def _t(tag):
                    el = item.find(tag)
                    return el.text.strip() if el is not None and el.text else ""
                title    = _t("title")
                link     = _t("link") or _t("guid")
                pub_date = _t("pubDate")
                publisher = _t("source") or feed_url.split("/")[2].replace("feeds.", "").replace("www.", "")
                summary  = _t("description")
                if summary:
                    summary = re.sub(r"<[^>]+>", "", summary).strip()[:300]
                ts = None
                if pub_date:
                    try:
                        ts = int(parsedate_to_datetime(pub_date).timestamp())
                    except Exception:
                        ts = None
                ts = ts or int(time.time())
                if title and link:
                    articles.append({
                        "title": title, "summary": summary,
                        "publisher": publisher, "link": link,
                        "providerPublishTime": ts, "thumbnail": None, "source": "rss",
                    })
        except Exception:
            continue
    articles.sort(key=lambda x: x.get("providerPublishTime") or 0, reverse=True)
    return articles[:max_items]


def _get_merged_news(symbol, ticker=None):
    """Merge yfinance + RSS news. Always returns a list."""
    yf_news = []
    try:
        if ticker and ticker.news:
            yf_news = _parse_yf_news(ticker.news[:8])
    except Exception:
        pass
    rss_news = _fetch_rss_news(symbol, max_items=8)
    seen, merged = set(), []
    for article in (yf_news + rss_news):
        key = article.get("title", "")[:60].lower().strip()
        if key and key not in seen:
            seen.add(key)
            merged.append(article)
        if len(merged) >= 12:
            break
    merged.sort(key=lambda x: x.get("providerPublishTime") or 0, reverse=True)
    return merged


# ─────────────────────────────────────────────────────────────────────────────
# MarketService — public API (unchanged signatures, bulletproof internals)
# ─────────────────────────────────────────────────────────────────────────────

def _empty_live_response(symbol):
    """Safe empty response so callers never crash on None fields."""
    return {
        "symbol": symbol, "price": 0, "change": 0, "change_pct": 0,
        "volume": 0, "high": 0, "low": 0, "open": 0,
        "logo_url": "", "long_name": symbol, "short_name": symbol,
        "summary": "", "sector": "", "industry": "",
        "market_cap": None, "pe_ratio": None, "eps": None,
        "dividend_yield": None, "beta": None,
        "target_mean_price": None, "target_high_price": None, "target_low_price": None,
        "recommendation": "", "number_of_analysts": None,
        "news": [],
    }


class MarketService:

    @staticmethod
    def get_branding(symbol):
        """Get logo_url and longName for a symbol, cached 24 h."""
        symbol    = symbol.upper()
        cache_key = f"branding_{symbol}"
        cached    = cache.get(cache_key)
        if cached:
            return cached
        result = {"logo_url": "", "long_name": symbol, "short_name": symbol}
        try:
            info = _yahoo_v8_info(symbol)
            result = {
                "logo_url":   info.get("logo_url", ""),
                "long_name":  info.get("longName", symbol),
                "short_name": info.get("shortName", symbol),
            }
        except Exception:
            pass
        cache.set(cache_key, result, 86400)
        return result

    @staticmethod
    def get_price_only(symbol):
        """Fast price fetch — no news, no fundamentals. Used by watchlist/analytics."""
        symbol    = symbol.upper()
        cache_key = f"price_only_{symbol}"
        cached    = cache.get(cache_key)
        if cached:
            return cached

        q = _get_quote(symbol)
        if not q:
            return None

        result = {
            "symbol":     symbol,
            "price":      q["price"],
            "change":     q["change"],
            "change_pct": q["change_pct"],
            "volume":     q["volume"],
            "high":       q["high"],
            "low":        q["low"],
            "open":       q["open"],
            "logo_url":   "",
            "long_name":  q.get("long_name", symbol),
            "short_name": q.get("short_name", symbol),
            "news":       [],
        }
        cache.set(cache_key, result, 120)   # 2-min cache
        return result

    @staticmethod
    def get_live_data(symbol, fetch_news=True):
        """
        Full live data: price + fundamentals + news.
        Uses 4-source waterfall so it NEVER fails from a single source being blocked.
        """
        symbol    = symbol.upper()
        cache_key = f"live_price_{symbol}"
        cached    = cache.get(cache_key)
        if cached:
            return cached

        # ── Step 1: get the price (required) ────────────────────────────────
        q = _get_quote(symbol)
        if not q:
            return None     # genuinely invalid symbol

        # ── Step 2: get fundamentals (optional, never crashes call) ──────────
        info = {}
        try:
            info = _yahoo_v8_info(symbol)
        except Exception:
            pass

        # Also try yfinance ticker.info as a supplement
        if not info:
            try:
                ticker = _yf_ticker(symbol)
                info   = ticker.info or {}
            except Exception:
                info = {}

        # ── Step 3: news (optional) ──────────────────────────────────────────
        merged_news = []
        if fetch_news:
            try:
                ticker_for_news = q.get("_ticker")
                merged_news = _get_merged_news(symbol, ticker=ticker_for_news)
            except Exception:
                merged_news = _fetch_rss_news(symbol, max_items=8)

        result = {
            "symbol":            symbol,
            "price":             q["price"],
            "change":            q["change"],
            "change_pct":        q["change_pct"],
            "volume":            q["volume"],
            "high":              q["high"],
            "low":               q["low"],
            "open":              q["open"],
            # Branding — from fundamentals or fallback to quote
            "logo_url":          info.get("logo_url", ""),
            "long_name":         info.get("longName",  q.get("long_name", symbol)),
            "short_name":        info.get("shortName", q.get("short_name", symbol)),
            # Company description
            "summary":           info.get("longBusinessSummary", ""),
            "sector":            info.get("sector", ""),
            "industry":          info.get("industry", ""),
            # Fundamentals
            "market_cap":        info.get("marketCap"),
            "pe_ratio":          info.get("trailingPE"),
            "eps":               info.get("trailingEps"),
            "dividend_yield":    info.get("dividendYield"),
            "beta":              info.get("beta"),
            "target_mean_price": info.get("targetMeanPrice"),
            "target_high_price": info.get("targetHighPrice"),
            "target_low_price":  info.get("targetLowPrice"),
            "recommendation":    info.get("recommendationKey", ""),
            "number_of_analysts":info.get("numberOfAnalystOpinions"),
            # News
            "news":              merged_news,
        }
        cache.set(cache_key, result, 300)   # 5-min cache
        return result

    @staticmethod
    def get_historical_data(symbol, period="1mo", interval="1d"):
        """Historical OHLCV as list of dicts (Django REST serialisable)."""
        symbol = symbol.upper()
        rows   = _get_history(symbol, period=period, interval=interval)
        return rows  # None if all fail, list otherwise

    @staticmethod
    def get_ohlc_with_indicators(symbol, period="3mo", interval="1d"):
        """OHLC + EMA(20) + RSI(14) + Volume for charting. Fully bulletproof."""
        import pandas as pd

        symbol    = symbol.upper()
        cache_key = f"ohlc_indicators_{symbol}_{period}"
        cached    = cache.get(cache_key)
        if cached:
            return cached

        rows = _get_history(symbol, period=period, interval=interval)
        if not rows or len(rows) < 20:
            return None

        # Build DataFrame from unified row format
        df = pd.DataFrame(rows)
        df.set_index("date", inplace=True)
        df.index = pd.to_datetime(df.index, unit="s", utc=True)
        df.rename(columns={"open": "Open", "high": "High", "low": "Low",
                            "close": "Close", "volume": "Volume"}, inplace=True)

        # EMA 20
        df["EMA_20"] = df["Close"].ewm(span=20, adjust=False).mean()
        # RSI 14
        delta = df["Close"].diff()
        gain  = delta.where(delta > 0, 0).rolling(window=14).mean()
        loss  = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs    = gain / loss
        df["RSI_14"] = 100 - (100 / (1 + rs))

        ohlc, ema_series, rsi_series, volume_series = [], [], [], []

        for idx, row in df.iterrows():
            ts = int(idx.timestamp() * 1000)
            ohlc.append({"x": ts, "y": [
                round(float(row["Open"]),  2),
                round(float(row["High"]),  2),
                round(float(row["Low"]),   2),
                round(float(row["Close"]), 2),
            ]})
            ema_series.append({"x": ts, "y": round(float(row["EMA_20"]), 2) if not pd.isna(row["EMA_20"]) else None})
            rsi_series.append({"x": ts, "y": round(float(row["RSI_14"]), 2) if not pd.isna(row["RSI_14"]) else None})
            volume_series.append({
                "x": ts, "y": int(row["Volume"]),
                "fillColor": "#10b981" if row["Close"] >= row["Open"] else "#ef4444",
            })

        # Fundamentals (optional)
        info = {}
        try:
            info = _yahoo_v8_info(symbol)
        except Exception:
            pass

        result = {
            "symbol":        symbol,
            "ohlc":          ohlc,
            "ema_20":        ema_series,
            "rsi_14":        rsi_series,
            "volume":        volume_series,
            "current_price": round(float(df.iloc[-1]["Close"]), 2),
            "logo_url":      info.get("logo_url", ""),
            "long_name":     info.get("longName", symbol),
            "short_name":    info.get("shortName", symbol),
            "target_mean_price":    info.get("targetMeanPrice"),
            "target_high_price":    info.get("targetHighPrice"),
            "target_low_price":     info.get("targetLowPrice"),
            "dividend_yield":       info.get("dividendYield"),
            "beta":                 info.get("beta"),
            "pe_ratio":             info.get("trailingPE"),
            "market_cap":           info.get("marketCap"),
            "fifty_two_week_high":  info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low":   info.get("fiftyTwoWeekLow"),
            "recommendation":       info.get("recommendationKey"),
        }
        cache.set(cache_key, result, 600)   # 10-min cache
        return result

    @staticmethod
    def get_sparkline(symbol, period="1mo"):
        """Simple close-price series for sparklines."""
        symbol    = symbol.upper()
        cache_key = f"sparkline_{symbol}_{period}"
        cached    = cache.get(cache_key)
        if cached:
            return cached

        rows = _get_history(symbol, period=period, interval="1d")
        if not rows:
            return []

        prices = [round(float(r["close"]), 2) for r in rows]
        cache.set(cache_key, prices, 600)
        return prices
