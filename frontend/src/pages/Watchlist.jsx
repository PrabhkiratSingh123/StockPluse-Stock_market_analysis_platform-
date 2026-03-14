import { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import StockLogo from '../components/StockLogo';
import api from '../api/axios';
import { useTour } from '../context/TourContext';
import styles from './Watchlist.module.css';

import { useSettings } from '../context/SettingsContext';

// ── Synthetic analyst firms (displayed from real recommendation data) ─────
const ANALYST_FIRMS = [
    { name: 'Goldman Sachs', tier: 'Tier 1' },
    { name: 'Morgan Stanley', tier: 'Tier 1' },
    { name: 'Wedbush Securities', tier: 'Tier 1' },
    { name: 'Bank of America', tier: 'Tier 1' },
    { name: 'JPMorgan Chase', tier: 'Tier 1' },
];

// ── RECOMMENDED LABELS ──────────────────────────────────────────────────
const getRecMeta = (t) => ({
    'strong_buy': { label: t('strong_buy'), color: '#10b981', bg: 'rgba(16,185,129,0.12)', bar: 95 },
    'buy': { label: t('buy_rec'), color: '#34d399', bg: 'rgba(52,211,153,0.12)', bar: 75 },
    'hold': { label: t('hold_rec'), color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', bar: 50 },
    'underperform': { label: t('underperform'), color: '#f97316', bg: 'rgba(249,115,22,0.12)', bar: 30 },
    'sell': { label: t('sell_rec'), color: '#ef4444', bg: 'rgba(239,68,68,0.12)', bar: 10 },
});

// ── Tiny SVG Sparkline ───────────────────────────────────────────────────────
function MiniSpark({ up }) {
    return (
        <svg width="48" height="22" viewBox="0 0 48 22" fill="none">
            {up ? (
                <polyline
                    points="0,18 8,14 16,16 24,10 32,12 40,6 48,3"
                    stroke="#10b981" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
                />
            ) : (
                <polyline
                    points="0,3 8,7 16,5 24,11 32,9 40,15 48,18"
                    stroke="#ef4444" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"
                />
            )}
        </svg>
    );
}

// ── Bio Parser — splits summary into bullet sentences (max 4) ─────────────
function parseBio(summary, max = 4) {
    if (!summary) return [];
    return summary.split('. ')
        .filter(s => s.trim().length > 20)
        .slice(0, max)
        .map(s => s.trim().replace(/\.$/, '') + '.');
}

// ── Metric Pill ──────────────────────────────────────────────────────────────
function MetricPill({ label, value, sub, highlight }) {
    return (
        <div className={styles.metricPill}>
            <span className={styles.metricLabel}>{label}</span>
            <span className={`${styles.metricValue} ${highlight ? styles.metricHighlight : ''}`}>{value}</span>
            {sub && <span className={styles.metricSub}>{sub}</span>}
        </div>
    );
}

// ── News Item ────────────────────────────────────────────────────────────────
function NewsItem({ item }) {
    const { t } = useSettings();
    const ts = item.providerPublishTime
        ? (() => {
            const now = Date.now() / 1000;
            const diff = now - item.providerPublishTime;
            if (diff < 3600) return t('m_ago', { n: Math.floor(diff / 60) });
            if (diff < 86400) return t('h_ago', { n: Math.floor(diff / 3600) });
            return new Date(item.providerPublishTime * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
        })()
        : '';

    const sourceBadge = item.source === 'rss' ? 'RSS' : null;

    return (
        <a href={item.link} target="_blank" rel="noreferrer" className={styles.newsItem}>
            {item.thumbnail && (
                <img src={item.thumbnail} alt="" className={styles.newsThumbnail}
                    onError={e => { e.currentTarget.style.display = 'none'; }} loading="lazy" />
            )}
            <div className={styles.newsContent}>
                <div className={styles.newsTop}>
                    <span className={styles.newsPublisher}>{item.publisher || 'News'}</span>
                    <div className={styles.newsTopRight}>
                        {sourceBadge && <span className={styles.newsSourceBadge}>{sourceBadge}</span>}
                        {ts && <span className={styles.newsTime}>{ts}</span>}
                    </div>
                </div>
                <p className={styles.newsTitle}>{item.title}</p>
                {item.summary && (
                    <p className={styles.newsSummary}>{item.summary.slice(0, 120)}{item.summary.length > 120 ? '…' : ''}</p>
                )}
            </div>
        </a>
    );

}

// ── Expert Analyst Card ──────────────────────────────────────────────────────
function ExpertCard({ firm, targetLow, targetHigh, targetMean, recKey, analysts, formatCurrency }) {
    const { t } = useSettings();
    const RECOMMEND_META = getRecMeta(t);
    const rec = RECOMMEND_META[recKey] || RECOMMEND_META['hold'];
    const priceDelta = targetMean ? formatCurrency(targetMean) : 'N/A';

    return (
        <div className={styles.expertCard}>
            <div className={styles.expertFirmRow}>
                <span className={styles.expertFirmDot} style={{ background: rec.color }} />
                <span className={styles.expertFirmName}>{firm.name}</span>
                <span className={styles.expertFirmTier}>{firm.tier}</span>
            </div>
            <div className={styles.expertMetaRow}>
                <span className={styles.expertTarget}>{priceDelta}</span>
                <span className={styles.expertLabel} style={{ color: rec.color, background: rec.bg }}>
                    {rec.label}
                </span>
            </div>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Watchlist Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function Watchlist() {
    const { t, formatCurrency, formatCurrencyCompact } = useSettings();
    const [items, setItems] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [liveMap, setLiveMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [symbol, setSymbol] = useState('');
    const [newsMap, setNewsMap] = useState({});
    const [newsLoading, setNewsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('bio');

    const { markPageReady } = useTour();

    // Ref so `load` can read selectedSymbol without it being a dep (prevents infinite loop)
    const selectedSymbolRef = useRef(null);
    useEffect(() => { selectedSymbolRef.current = selectedSymbol; }, [selectedSymbol]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/trading/watchlist/');
            const list = data?.results || (Array.isArray(data) ? data : []);
            setItems(list);
            if (list.length > 0 && !selectedSymbolRef.current) {
                setSelectedSymbol(list[0].symbol);
            }
            const liveResults = {};
            await Promise.allSettled(
                list.map(async (item) => {
                    try {
                        // fast=true: skips news/info for speed – just price data
                        const res = await api.get(`/trading/live/${item.symbol}/?fast=true`);
                        if (res.data?.price !== undefined) liveResults[item.symbol] = res.data;
                    } catch { }
                })
            );
            setLiveMap(liveResults);
        } catch { }
        setLoading(false);
    }, []); // ← empty deps, no infinite loop

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!loading) {
            markPageReady();
        }
    }, [loading, markPageReady]);

    // ── Fetch full live data (with company info) for selected symbol ──────────
    const fetchFullData = useCallback(async (sym) => {
        if (!sym) return;
        try {
            const res = await api.get(`/trading/live/${sym}/`);
            if (res.data?.price !== undefined) {
                setLiveMap(prev => ({ ...prev, [sym]: res.data }));
            }
        } catch { }
    }, []);

    // ── Fetch news for selected symbol ────────────────────────────────────────
    const fetchNews = useCallback(async (sym) => {
        if (!sym) return;
        setNewsLoading(true);
        try {
            const { data } = await api.get(`/trading/news/${sym}/`);
            if (data?.news) {
                setNewsMap(prev => ({ ...prev, [sym]: data.news }));
            }
        } catch { }
        setNewsLoading(false);
    }, []);

    // Fetch full data + news whenever selected symbol changes
    useEffect(() => {
        if (selectedSymbol) {
            fetchFullData(selectedSymbol);
            fetchNews(selectedSymbol);
        }
    }, [selectedSymbol, fetchFullData, fetchNews]);

    // Auto-refresh news every 3 minutes
    useEffect(() => {
        if (!selectedSymbol) return;
        const interval = setInterval(() => fetchNews(selectedSymbol), 3 * 60 * 1000);
        return () => clearInterval(interval);
    }, [selectedSymbol, fetchNews]);

    const add = async (e) => {
        if (e) e.preventDefault();
        if (!symbol.trim()) return;
        setError('');
        try {
            const sym = symbol.trim().toUpperCase();
            const { data } = await api.post('/trading/watchlist/', { symbol: sym });
            if (data.id || data.symbol) {
                setSymbol('');
                setSelectedSymbol(sym);
                load();
            } else {
                setError(data.error || t('could_not_add_symbol'));
            }
        } catch (e) {
            setError(e.response?.data?.error || t('failed_to_add'));
        }
    };

    const remove = async (e, sym) => {
        e.stopPropagation();
        try {
            await api.delete(`/trading/watchlist/remove/${sym}/`);
            setItems(prev => prev.filter(i => i.symbol !== sym));
            setLiveMap(prev => { const copy = { ...prev }; delete copy[sym]; return copy; });
            if (selectedSymbol === sym) {
                const remaining = items.filter(i => i.symbol !== sym);
                setSelectedSymbol(remaining.length > 0 ? remaining[0].symbol : null);
            }
        } catch { }
    };

    const activeData = selectedSymbol ? liveMap[selectedSymbol] : null;

    // Merge news: dedicated news endpoint takes priority, fall back to live data news
    const activeNews = newsMap[selectedSymbol] || activeData?.news || [];

    const RECOMMEND_META = getRecMeta(t);
    const rec = activeData?.recommendation ? RECOMMEND_META[activeData.recommendation] : RECOMMEND_META['hold'];
    const bioBullets = parseBio(activeData?.summary);


    return (
        <Layout pageTitle={t('watchlist')}>
            <div className={styles.shell}>

                {/* ── LEFT: Watchlist Sidebar ────────────────────────────── */}
                <aside className={styles.sidebar} data-tour="watch-sidebar">
                    <div className={styles.sidebarHeader}>
                        <div className={styles.sidebarTitle}>
                            <span className={styles.sidebarIcon}>⊞</span>
                            <span>{t('my_watchlist')}</span>
                        </div>
                        <span className={styles.sidebarCount}>{items.length}</span>
                    </div>

                    {/* Add ticker form */}
                    <div className={styles.addZone} data-tour="watch-add">
                        <form onSubmit={add} className={styles.addForm}>
                            <input
                                id="watchlist-ticker-input"
                                className={styles.addInput}
                                value={symbol}
                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                placeholder="e.g. TSLA"
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <button id="watchlist-add-btn" type="submit" className={styles.addBtn}>
                                <span>+</span>
                            </button>
                        </form>
                        {error && <div className={styles.errMsg}>{error}</div>}
                    </div>

                    {/* List */}
                    <div className={styles.sidebarList}>
                        {loading && !items.length ? (
                            [1, 2, 3].map(i => <div key={i} className={styles.skeletonRow} />)
                        ) : items.length === 0 ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyIcon}>👀</div>
                                <p>{t('watchlist_empty')}</p>
                                <span>{t('add_ticker_to_start')}</span>
                            </div>
                        ) : (
                            items.map(item => {
                                const live = liveMap[item.symbol];
                                const isActive = selectedSymbol === item.symbol;
                                const up = !live || live.change >= 0;
                                return (
                                    <div
                                        key={item.id}
                                        id={`watchlist-item-${item.symbol}`}
                                        onClick={() => setSelectedSymbol(item.symbol)}
                                        className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                                    >
                                        {/* Active accent bar */}
                                        {isActive && <div className={styles.activeBar} />}

                                        <div className={styles.sidebarItemLeft}>
                                            <StockLogo
                                                symbol={item.symbol}
                                                logoUrl={live?.logo_url || ''}
                                                name={live?.long_name || item.symbol}
                                                size={36}
                                            />
                                            <div className={styles.sidebarItemInfo}>
                                                <strong className={styles.sidebarSymbol}>{item.symbol}</strong>
                                                <span className={styles.sidebarName}>
                                                    {live?.short_name || live?.long_name || '—'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles.sidebarItemRight}>
                                            {live ? (
                                                <>
                                                    <span className={styles.sidebarPrice}>{formatCurrency(live.price)}</span>
                                                    <span className={`${styles.sidebarChange} ${up ? styles.up : styles.down}`}>
                                                        {up ? '▲' : '▼'} {Math.abs(live.change_pct ?? 0).toFixed(2)}%
                                                    </span>
                                                    <MiniSpark up={up} />
                                                </>
                                            ) : (
                                                <span className={styles.loadingDots}>···</span>
                                            )}
                                            <button
                                                id={`remove-${item.symbol}`}
                                                className={styles.removeBtn}
                                                onClick={(e) => remove(e, item.symbol)}
                                                title={`Remove ${item.symbol}`}
                                            >✕</button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* ── RIGHT: Crystal Clear Dashboard ────────────────────── */}
                <div className={styles.mainPanel} data-tour="watch-main">
                    {!selectedSymbol ? (
                        <div className={styles.emptyMain}>
                            <div className={styles.emptyMainIcon}>📊</div>
                            <h2>{t('select_stock_from_watchlist')}</h2>
                            <p>{t('add_tickers_to_explore')}</p>
                        </div>
                    ) : !activeData ? (
                        <div className={styles.emptyMain}>
                            <div className={`${styles.emptyMainIcon} ${styles.pulseAnim}`}>⚡</div>
                            <h2>{t('fetching_market_data')}</h2>
                            <p>{t('loading_live_data_for')} <strong>{selectedSymbol}</strong></p>
                        </div>
                    ) : (
                        <div className={styles.dashboard}>

                            {/* ── HERO HEADER ──────────────────────────── */}
                            <div className={styles.hero}>
                                <div className={styles.heroLeft}>
                                    <div className={styles.heroLogo}>
                                        <StockLogo
                                            symbol={selectedSymbol}
                                            logoUrl={activeData.logo_url}
                                            name={activeData.long_name || selectedSymbol}
                                            size={80}
                                        />
                                    </div>
                                    <div className={styles.heroText}>
                                        <h1 className={styles.heroName}>
                                            {activeData.long_name || activeData.short_name || selectedSymbol}
                                            <span className={styles.heroTicker}>({selectedSymbol})</span>
                                        </h1>
                                        <div className={styles.heroCrumbs}>
                                            {activeData.sector && <span className={styles.crumb}>{activeData.sector}</span>}
                                            {activeData.industry && <span className={styles.crumb}>{activeData.industry}</span>}
                                            {activeData.beta && (
                                                <span className={styles.crumb}>β {Number(activeData.beta).toFixed(2)}</span>
                                            )}
                                        </div>
                                        <p className={styles.heroTagline}>
                                            {activeData.summary
                                                ? activeData.summary.split('.')[0] + '.'
                                                : t('no_description')}
                                        </p>
                                    </div>
                                </div>

                                {/* Live price block */}
                                <div className={styles.heroPriceBlock}>
                                    <div className={styles.heroPrice}>{formatCurrency(activeData.price)}</div>
                                    <div className={`${styles.heroChange} ${activeData.change >= 0 ? styles.up : styles.down}`}>
                                        {activeData.change >= 0 ? '▲' : '▼'}&nbsp;
                                        {formatCurrency(Math.abs(activeData.change))}&nbsp;
                                        ({Math.abs(activeData.change_pct ?? 0).toFixed(2)}%)
                                    </div>
                                    <div className={styles.heroMeta}>
                                        {activeData.open && <span>{t('open_short')}: {formatCurrency(activeData.open)}</span>}
                                        {activeData.high && <span>{t('high_short')}: {formatCurrency(activeData.high)}</span>}
                                        {activeData.low && <span>{t('low_short')}: {formatCurrency(activeData.low)}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* ── SUMMARY RIBBON ───────────────────────── */}
                            <div className={styles.ribbon}>
                                <div className={styles.ribbonTopLine} />
                                <MetricPill label={t('market_cap')} value={formatCurrencyCompact(activeData.market_cap)} />
                                <div className={styles.ribbonDivider} />
                                <MetricPill label={t('pe_ratio')} value={activeData.pe_ratio ? `${Number(activeData.pe_ratio).toFixed(1)}×` : 'N/A'} />
                                <div className={styles.ribbonDivider} />
                                <MetricPill
                                    label={t('target_12mo')}
                                    value={formatCurrency(activeData.target_mean_price)}
                                    sub={t('analyst_avg')}
                                    highlight
                                />
                                <div className={styles.ribbonDivider} />
                                <MetricPill
                                    label={t('target_range')}
                                    value={`${formatCurrency(activeData.target_low_price)} – ${formatCurrency(activeData.target_high_price)}`}
                                    sub={`${t('low')} – ${t('high')}`}
                                />
                                <div className={styles.ribbonDivider} />
                                <MetricPill
                                    label={t('eps')}
                                    value={activeData.eps ? formatCurrency(activeData.eps) : 'N/A'}
                                />
                                <div className={styles.ribbonDivider} />
                                <MetricPill
                                    label={t('div_yield')}
                                    value={activeData.dividend_yield ? `${(activeData.dividend_yield * 100).toFixed(2)}%` : 'N/A'}
                                />
                                <div className={styles.ribbonDivider} />
                                <MetricPill label={t('volume')} value={Number(activeData.volume).toLocaleString()} />
                            </div>

                            {/* ── CONTENT AREA ─────────────────────────── */}
                            <div className={styles.contentGrid}>

                                {/* ── LEFT: Tabs (Bio / Expert / News) ── */}
                                <div className={styles.infoPanel}>
                                    <div className={styles.tabs}>
                                        {[
                                            { key: 'bio', label: `ℹ ${t('company_bio')}` },
                                            { key: 'expert', label: `★ ${t('expert_talks')}` },
                                            { key: 'news', label: `📰 ${t('news_feed')}` },
                                        ].map(t => (
                                            <button
                                                key={t.key}
                                                id={`tab-${t.key}`}
                                                className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
                                                onClick={() => setActiveTab(t.key)}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* ── BIO TAB ────────────────────── */}
                                    {activeTab === 'bio' && (
                                        <div className={styles.tabContent}>
                                            <div className={styles.bioHeader}>
                                                <div className={styles.bioIcon}>ℹ</div>
                                                <div>
                                                    <h3 className={styles.bioTitle}>{t('company_bio_strategy')}</h3>
                                                    <p className={styles.bioSubtitle}>
                                                        {activeData.sector} · {activeData.industry}
                                                    </p>
                                                </div>
                                            </div>
                                            {bioBullets.length > 0 ? (
                                                <ul className={styles.bioBullets}>
                                                    {bioBullets.map((s, i) => (
                                                        <li key={i} className={styles.bioBullet}>
                                                            <span className={styles.bioBulletDot} />
                                                            <span>{s}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className={styles.bioEmpty}>{t('no_description')}</p>
                                            )}
                                            {/* Key stats grid inside bio */}
                                            {(activeData.eps || activeData.beta || activeData.dividend_yield || activeData.market_cap) && (
                                                <div className={styles.bioStats}>
                                                    {activeData.sector && (
                                                        <div className={styles.bioStat}>
                                                            <span className={styles.bioStatLabel}>{t('sector')}</span>
                                                            <span className={styles.bioStatValue}>{activeData.sector}</span>
                                                        </div>
                                                    )}
                                                    {activeData.industry && (
                                                        <div className={styles.bioStat}>
                                                            <span className={styles.bioStatLabel}>{t('industry')}</span>
                                                            <span className={styles.bioStatValue}>{activeData.industry}</span>
                                                        </div>
                                                    )}
                                                    {activeData.beta && (
                                                        <div className={styles.bioStat}>
                                                            <span className={styles.bioStatLabel}>{t('beta')} (5Y)</span>
                                                            <span className={styles.bioStatValue}>{Number(activeData.beta).toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                    {activeData.market_cap && (
                                                        <div className={styles.bioStat}>
                                                            <span className={styles.bioStatLabel}>{t('market_cap_short')}</span>
                                                            <span className={styles.bioStatValue}>{formatCurrencyCompact(activeData.market_cap)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── EXPERT TAB ─────────────────── */}
                                    {activeTab === 'expert' && (
                                        <div className={styles.tabContent}>
                                            <div className={styles.expertHeader}>
                                                <div className={styles.expertIcon}>★</div>
                                                <div>
                                                    <h3 className={styles.expertTitle}>{t('expert_talks_sentiment')}</h3>
                                                    <p className={styles.expertSubtitle}>
                                                        {t('based_on_analysts').replace('{count}', activeData.number_of_analysts ?? t('multiple'))}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Consensus Bar */}
                                            <div className={styles.consensusBox}>
                                                <div className={styles.consensusLeft}>
                                                    <span className={styles.consensusLabel}>{t('wall_st_consensus')}</span>
                                                    <span
                                                        className={styles.consensusBadge}
                                                        style={{ color: rec?.color, background: rec?.bg }}
                                                    >
                                                        {rec?.label ?? t('hold_tag')}
                                                    </span>
                                                </div>
                                                <div className={styles.consensusBarTrack}>
                                                    <div
                                                        className={styles.consensusBarFill}
                                                        style={{ width: `${rec?.bar ?? 50}%`, background: rec?.color }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Target Price Blocks */}
                                            <div className={styles.targetRow}>
                                                <div className={styles.targetBlock}>
                                                    <span className={styles.targetLabel}>{t('target_low')}</span>
                                                    <span className={`${styles.targetValue} ${styles.targetLow}`}>{formatCurrency(activeData.target_low_price)}</span>
                                                </div>
                                                <div className={`${styles.targetBlock} ${styles.targetBlockMid}`}>
                                                    <span className={styles.targetLabel}>{t('target_avg')}</span>
                                                    <span className={`${styles.targetValue} ${styles.targetAvg}`}>{formatCurrency(activeData.target_mean_price)}</span>
                                                    <span className={styles.targetSub}>{t('estimate_12mo')}</span>
                                                </div>
                                                <div className={styles.targetBlock}>
                                                    <span className={styles.targetLabel}>{t('target_high')}</span>
                                                    <span className={`${styles.targetValue} ${styles.targetHigh}`}>{formatCurrency(activeData.target_high_price)}</span>
                                                </div>
                                            </div>

                                            {/* Analyst Firm Cards */}
                                            <div className={styles.expertGrid}>
                                                {ANALYST_FIRMS.map((firm, i) => (
                                                    <ExpertCard
                                                        key={i}
                                                        firm={firm}
                                                        targetLow={activeData.target_low_price}
                                                        targetHigh={activeData.target_high_price}
                                                        targetMean={activeData.target_mean_price}
                                                        recKey={activeData.recommendation}
                                                        analysts={activeData.number_of_analysts}
                                                        formatCurrency={formatCurrency}
                                                    />
                                                ))}
                                            </div>

                                            {/* Risk note */}
                                            <div className={styles.riskNote}>
                                                <span className={styles.riskIcon}>⚠</span>
                                                <p>{t('analyst_risk_note')}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── NEWS TAB ───────────────────── */}
                                    {activeTab === 'news' && (
                                        <div className={styles.tabContent}>
                                            <div className={styles.newsHeader}>
                                                <span className={styles.newsDot} />
                                                <h3 className={styles.newsTitle2}>{t('live_sentiment_feed')}</h3>
                                                <span className={styles.newsLiveBadge}>{t('live_tag_upper')}</span>
                                                {newsLoading && <span style={{ fontSize: '0.65rem', color: '#475569', marginLeft: 'auto' }}>{t('refreshing')}</span>}
                                                <button
                                                    onClick={() => selectedSymbol && fetchNews(selectedSymbol)}
                                                    title="Refresh news"
                                                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.9rem', marginLeft: '0.25rem', lineHeight: 1 }}
                                                >↻</button>
                                            </div>
                                            {activeNews.length > 0 ? (
                                                <div className={styles.newsList}>
                                                    {activeNews.map((n, i) => (
                                                        <NewsItem key={i} item={n} />
                                                    ))}
                                                </div>
                                            ) : newsLoading ? (
                                                <div className={styles.newsEmpty}>{t('loading_news')}</div>
                                            ) : (
                                                <div className={styles.newsEmpty}>{t('no_headlines')}</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── RIGHT: Sentiment Feed Sidebar ─────── */}
                                <div className={styles.newsPanel}>
                                    <div className={styles.newsPanelHeader}>
                                        <span className={styles.newsDot} />
                                        <span className={styles.newsPanelTitle}>{t('sentiment_feed')}</span>
                                        <span className={styles.newsLiveBadge}>{t('live_tag_upper')}</span>
                                    </div>
                                    <div className={styles.newsPanelBody}>
                                        {activeNews.length > 0 ? (
                                            activeNews.map((n, i) => (
                                                <NewsItem key={i} item={n} />
                                            ))
                                        ) : newsLoading ? (
                                            <div className={styles.newsEmpty}>{t('fetching_headlines')}</div>
                                        ) : (
                                            <div className={styles.newsEmpty}>{t('no_headlines_now')}</div>
                                        )}
                                    </div>
                                    <div className={styles.newsPanelFade} />
                                </div>


                            </div>{/* /contentGrid */}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
