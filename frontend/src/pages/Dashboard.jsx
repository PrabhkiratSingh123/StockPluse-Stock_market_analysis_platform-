import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useTour } from '../context/TourContext';
import { useSettings } from '../context/SettingsContext';
import styles from './Dashboard.module.css';
import Chart from 'react-apexcharts';

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Dashboard() {
    const { t, formatCurrency, formatCurrencyCompact, currentCurrency } = useSettings();
    const [summary, setSummary] = useState(null);
    const [holdings, setHoldings] = useState([]);
    const [allocation, setAllocation] = useState([]);
    const [txList, setTxList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [perfPeriod, setPerfPeriod] = useState('1M');
    const [perfData, setPerfData] = useState({ labels: [], values: [] });
    const [perfLoading, setPerfLoading] = useState(false);
    const [hoverData, setHoverData] = useState(null);
    const { markPageReady } = useTour();
    const sym = currentCurrency.symbol;

    const load = useCallback(async () => {
        try {
            const [analytics, txData] = await Promise.all([
                api.get('/portfolio/analytics/'),
                api.get('/portfolio/transactions/?page=1&page_size=5'),
            ]);
            setSummary(analytics.data.summary);
            setHoldings(analytics.data.holdings || []);
            setAllocation(analytics.data.allocation || []);
            const list = txData.data?.results || txData.data;
            setTxList(Array.isArray(list) ? list : []);
        } catch { }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!loading) {
            markPageReady();
        }
    }, [loading, markPageReady]);

    // Fetch portfolio performance data whenever period changes
    const loadPerf = useCallback(async (period) => {
        setPerfLoading(true);
        try {
            const { data } = await api.get(`/portfolio/portfolio_performance/?period=${period}`);
            setPerfData({
                labels: data.labels || [],
                values: data.values || [],
            });
        } catch {
            setPerfData({ labels: [], values: [] });
        }
        setPerfLoading(false);
    }, []);

    useEffect(() => {
        loadPerf(perfPeriod);
    }, [perfPeriod, loadPerf]);

    const plClass = (v) => v > 0 ? styles.positive : v < 0 ? styles.negative : styles.neutral;

    // Dynamic x-axis label format based on period
    const xLabelFormatter = (val) => {
        if (!val) return '';
        const d = new Date(val);
        if (perfPeriod === '1D' || perfPeriod === '1W') {
            return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    };

    const areaChartOptions = {
        chart: {
            type: 'area',
            height: 280,
            background: 'transparent',
            toolbar: { show: false },
            zoom: { enabled: false },
            sparkline: { enabled: false },
            animations: { enabled: true, speed: 400 },
            events: {
                mouseMove: (event, chartContext, config) => {
                    const idx = config.dataPointIndex;
                    if (idx > -1 && perfData.values[idx]) {
                        const val = perfData.values[idx];
                        const invested = summary?.total_investment || 0;
                        const pL = val - invested;
                        const pLPct = invested > 0 ? (pL / invested * 100) : 0;
                        setHoverData({
                            value: val,
                            label: perfData.labels[idx],
                            pL,
                            pLPct
                        });
                    }
                },
                mouseLeave: () => setHoverData(null),
            }
        },
        colors: ['#3b82f6'],
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.45,
                opacityTo: 0.05,
                stops: [0, 100],
                colorStops: [
                    { offset: 0, color: '#3b82f6', opacity: 0.4 },
                    { offset: 100, color: '#8b5cf6', opacity: 0.05 },
                ]
            }
        },
        stroke: { curve: 'smooth', width: 2.5 },
        markers: {
            size: 0,
            hover: { size: 5, strokeColors: '#0f172a', strokeWidth: 2, colors: '#3b82f6' }
        },
        grid: {
            borderColor: 'rgba(255,255,255,0.06)',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
        },
        xaxis: {
            type: 'datetime',
            categories: perfData.labels,
            labels: { show: false },
            axisBorder: { show: false },
            axisTicks: { show: false },
            crosshairs: {
                show: true,
                stroke: { color: '#3b82f6', width: 1.5, dashArray: 4 },
                alpha: 0.6,
                tooltip: { enabled: false } // Fix: explicitly disable the black box at the bottom
            },
            tooltip: { enabled: false },
        },
        yaxis: {
            labels: {
                style: { colors: '#64748b', fontSize: '11px' },
                formatter: (v) => `${sym}${v?.toFixed(0)}`,
            },
        },
        tooltip: {
            theme: 'dark',
            shared: true,
            intersect: false,
            followCursor: true,
            x: {
                show: true,
                formatter: (v) => {
                    const d = new Date(v);
                    if (perfPeriod === '1D' || perfPeriod === '1W') {
                        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    }
                    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }
            },
            y: {
                formatter: (v) => formatCurrency(v),
                title: { formatter: () => '' }
            },
            marker: { show: false }
        },
        dataLabels: { enabled: false },
    };

    const areaChartSeries = [{
        name: 'Portfolio Value',
        data: perfData.values,
    }];

    // Donut chart for asset allocation
    const donutOptions = {
        chart: {
            type: 'donut',
            background: 'transparent',
        },
        labels: allocation.map(a => a.symbol),
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'],
        stroke: { show: true, width: 2, colors: ['#0f172a'] },
        fill: { opacity: 1 },
        plotOptions: {
            pie: {
                donut: {
                    size: '70%',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            fontSize: '14px',
                            color: '#f1f5f9',
                        },
                        value: {
                            show: true,
                            fontSize: '18px',
                            fontWeight: 700,
                            color: '#f1f5f9',
                            formatter: (v) => `${Number(v).toFixed(1)}%`,
                        },
                        total: {
                            show: true,
                            showAlways: true,
                            label: t('equity'),
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#64748b',
                            formatter: () => `${allocation.length} ${t('stocks')}`,
                        }
                    }
                }
            }
        },
        legend: {
            position: 'bottom',
            labels: { colors: '#94a3b8' },
            fontSize: '12px',
            markers: { size: 6 },
            formatter: (name, opts) => {
                const pct = allocation[opts.seriesIndex]?.percentage || 0;
                return `${name} (${pct}%)`;
            }
        },
        tooltip: {
            theme: 'dark',
            y: { formatter: (v) => formatCurrency(v) },
        },
        dataLabels: { enabled: false },
    };
    const donutSeries = allocation.map(a => a.value);

    // Sparkline chart config helper
    const getSparkOpts = (data, color) => ({
        chart: { type: 'line', sparkline: { enabled: true }, height: 35, width: 100 },
        stroke: { curve: 'smooth', width: 1.5 },
        colors: [color],
        tooltip: { enabled: false },
    });

    // Fear & Greed mock (based on average RSI logic)
    const avgPl = summary ? summary.total_p_l_pct : 0;
    const fearGreedAngle = Math.max(-90, Math.min(90, avgPl * 3));
    const fearGreedLabel = avgPl > 5 ? 'GREEDY' : avgPl > 0 ? 'NEUTRAL' : avgPl > -5 ? 'CAUTIOUS' : 'FEARFUL';

    return (
        <Layout pageTitle={t('nav_dashboard')}>
            {/* Stat Cards */}
            <div className={styles.statsGrid} data-tour="dash-stats">
                {[
                    { icon: '💰', label: t('total_invested'), value: summary ? formatCurrency(summary.total_investment) : '—', accent: '#3b82f6' },
                    {
                        icon: '📊',
                        label: hoverData ? `${t('value_on')} ${xLabelFormatter(hoverData.label)}` : t('current_value'),
                        value: hoverData ? formatCurrency(hoverData.value) : (summary ? formatCurrency(summary.total_current_value) : '—'),
                        accent: '#8b5cf6',
                        active: !!hoverData
                    },
                    { icon: '🗂️', label: t('stocks_held'), value: summary ? summary.stock_count : '—', accent: '#f59e0b' },
                ].map(({ icon, label, value, accent, active }) => (
                    <div key={label} className={`${styles.statCard} ${active ? styles.statCardActive : ''}`} style={{ borderTop: `3px solid ${accent}` }}>
                        <span className={styles.statIcon}>{icon}</span>
                        <div>
                            <div className={styles.statLabel}>{label}</div>
                            <div className={styles.statValue}>{value}</div>
                        </div>
                    </div>
                ))}

                {/* P&L card with colour */}
                <div
                    className={`${styles.statCard} ${hoverData ? styles.statCardActive : ''}`}
                    style={{ borderTop: `3px solid ${hoverData ? (hoverData.pL >= 0 ? '#10b981' : '#ef4444') : (summary && summary.total_p_l >= 0 ? '#10b981' : '#ef4444')}` }}
                >
                    <span className={styles.statIcon}>🎯</span>
                    <div>
                        <div className={styles.statLabel}>{hoverData ? t('gain_on_date') : t('total_pl')}</div>
                        <div className={`${styles.statValue} ${hoverData ? plClass(hoverData.pL) : (summary ? plClass(summary.total_p_l) : '')}`}>
                            {hoverData
                                ? `${hoverData.pL >= 0 ? '+' : ''}${formatCurrency(hoverData.pL)} (${hoverData.pLPct.toFixed(2)}%)`
                                : (summary ? `${summary.total_p_l >= 0 ? '+' : ''}${formatCurrency(summary.total_p_l)} (${summary.total_p_l_pct.toFixed(2)}%)` : '—')
                            }
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.mainGrid}>
                {/* Portfolio Performance Chart */}
                <div className={styles.card + ' ' + styles.chartCard} data-tour="dash-performance">
                    <div className={styles.cardHeader}>
                        <h3>{t('portfolio_performance')}</h3>
                        <div className={styles.periodTabs}>
                            {['1D', '1W', '1M', '1Y'].map(p => (
                                <button key={p}
                                    className={`${styles.periodBtn} ${perfPeriod === p ? styles.periodActive : ''}`}
                                    onClick={() => setPerfPeriod(p)}
                                >{p}</button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        {perfLoading ? (
                            <div className={styles.shimmer} style={{ height: 280 }} />
                        ) : perfData.values.length > 0 ? (
                            <Chart options={areaChartOptions} series={areaChartSeries} type="area" height={280} />
                        ) : (
                            <Empty icon="📈" text={t('add_stocks')} />
                        )}
                    </div>
                </div>

                {/* Asset Allocation Donut */}
                <div className={styles.card} data-tour="dash-allocation">
                    <div className={styles.cardHeader}><h3>{t('asset_allocation')}</h3></div>
                    <div className={styles.cardBody} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280 }}>
                        {allocation.length > 0 ? (
                            <Chart options={donutOptions} series={donutSeries} type="donut" height={280} width={320} />
                        ) : (
                            <Empty icon="🥧" text={t('no_stocks_portfolio')} />
                        )}
                    </div>
                </div>
            </div>

            {/* Holdings with Sparklines + Market Sentiment */}
            <div className={styles.mainGrid}>
                <div className={styles.card} data-tour="dash-holdings">
                    <div className={styles.cardHeader}>
                        <h3>{t('holdings_overview')}</h3>
                        <button className={styles.refreshBtn} onClick={load}>{t('refresh')}</button>
                    </div>
                    <div className={styles.cardBody}>
                        {loading ? <div className={styles.shimmer} /> :
                            holdings.length ? holdings.map(h => (
                                <div key={h.symbol} className={styles.holdingRow}>
                                    <div className={styles.holdingLeft}>
                                        <div className={styles.holdingSymbolWrap}>
                                            <span className={styles.hSymbol}>{h.symbol}</span>
                                            <span className={styles.hQty}>{h.quantity} {t('shares')}</span>
                                        </div>
                                        <div className={styles.sparkWrap}>
                                            {h.sparkline && h.sparkline.length > 2 && (
                                                <Chart
                                                    options={getSparkOpts(h.sparkline, h.p_l >= 0 ? '#10b981' : '#ef4444')}
                                                    series={[{ data: h.sparkline }]}
                                                    type="line"
                                                    height={35}
                                                    width={100}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div className={styles.holdingRight}>
                                        <span className={styles.holdingPrice}>{formatCurrency(h.live_price)}</span>
                                        <span className={plClass(h.p_l)}>
                                            {h.p_l >= 0 ? '+' : ''}{formatCurrency(h.p_l)} ({h.p_l_pct >= 0 ? '+' : ''}{h.p_l_pct.toFixed(2)}%)
                                        </span>
                                    </div>
                                </div>
                            )) : <Empty icon="💼" text={t('no_holdings')} />
                        }
                    </div>
                </div>

                {/* Market Sentiment */}
                <div className={styles.card} data-tour="dash-sentiment">
                    <div className={styles.cardHeader}><h3>{t('market_sentiment')}</h3></div>
                    <div className={styles.cardBody}>
                        {txList.length ? txList.map((tx, i) => (
                            <div key={i} className={styles.txRow}>
                                <span className={`${styles.txBadge} ${tx.transaction_type === 'BUY' ? styles.buy : styles.sell}`}>{tx.transaction_type}</span>
                                <span className={styles.txSymbol}>{tx.stock_symbol}</span>
                                <span className={styles.txInfo}>{tx.quantity} {t('shares')}</span>
                                <span className={styles.txPrice}>{formatCurrency(tx.price)}</span>
                                <span className={styles.txDate}>{fmtDate(tx.timestamp)}</span>
                            </div>
                        )) : <Empty icon="📋" text={t('no_transactions')} />}

                        {/* Fear & Greed Gauge */}
                        <div className={styles.gaugeCard}>
                            <div className={styles.gaugeLabel}>{t('fear_greed_index')}</div>
                            <div className={styles.gauge}>
                                <div className={styles.gaugeArc}>
                                    <div className={styles.gaugeNeedle} style={{ transform: `rotate(${fearGreedAngle}deg)` }} />
                                </div>
                                <div className={styles.gaugeText}>{fearGreedLabel}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}

function Empty({ icon, text }) {
    return (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#475569' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.6rem', opacity: 0.5 }}>{icon}</div>
            <div style={{ fontSize: '0.875rem' }}>{text}</div>
        </div>
    );
}
