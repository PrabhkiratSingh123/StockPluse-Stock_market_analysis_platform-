import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useTour } from '../context/TourContext';
import styles from './Dashboard.module.css';
import Chart from 'react-apexcharts';

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtCompact = (n) => {
    if (!n) return '—';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${fmt(n)}`;
};

export default function Dashboard() {
    const [summary, setSummary] = useState(null);
    const [holdings, setHoldings] = useState([]);
    const [allocation, setAllocation] = useState([]);
    const [txList, setTxList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [perfPeriod, setPerfPeriod] = useState('1M');
    const { markPageReady } = useTour();

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

    const plClass = (v) => v > 0 ? styles.positive : v < 0 ? styles.negative : styles.neutral;

    // Portfolio performance area chart data (uses sparkline from first holding or aggregate)
    const perfData = holdings.length > 0 ? holdings[0]?.sparkline || [] : [];

    const areaChartOptions = {
        chart: {
            type: 'area',
            height: 280,
            background: 'transparent',
            toolbar: { show: false },
            zoom: { enabled: false },
            sparkline: { enabled: false },
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
        stroke: {
            curve: 'smooth',
            width: 2.5,
        },
        grid: {
            borderColor: 'rgba(255,255,255,0.06)',
            strokeDashArray: 4,
            xaxis: { lines: { show: false } },
        },
        xaxis: {
            categories: perfData.map((_, i) => i),
            labels: { show: false },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            labels: {
                style: { colors: '#64748b', fontSize: '11px' },
                formatter: (v) => `$${v?.toFixed(0)}`,
            },
        },
        tooltip: {
            theme: 'dark',
            y: { formatter: (v) => `$${fmt(v)}` },
        },
        dataLabels: { enabled: false },
    };

    const areaChartSeries = [{
        name: 'Portfolio Value',
        data: perfData,
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
                            label: 'EQUITY',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#64748b',
                            formatter: () => `${allocation.length} Stocks`,
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
            y: { formatter: (v) => `$${fmt(v)}` },
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
        <Layout pageTitle="Dashboard">
            {/* Stat Cards */}
            <div className={styles.statsGrid} data-tour="dash-stats">
                {[
                    { icon: '💰', label: 'Total Invested', value: summary ? `$${fmt(summary.total_investment)}` : '—', accent: '#3b82f6' },
                    { icon: '📊', label: 'Current Value', value: summary ? `$${fmt(summary.total_current_value)}` : '—', accent: '#8b5cf6' },
                    { icon: '🗂️', label: 'Stocks Held', value: summary ? summary.stock_count : '—', accent: '#f59e0b' },
                ].map(({ icon, label, value, accent }) => (
                    <div key={label} className={styles.statCard} style={{ borderTop: `3px solid ${accent}` }}>
                        <span className={styles.statIcon}>{icon}</span>
                        <div>
                            <div className={styles.statLabel}>{label}</div>
                            <div className={styles.statValue}>{value}</div>
                        </div>
                    </div>
                ))}

                {/* P&L card with colour */}
                <div className={styles.statCard} style={{ borderTop: `3px solid ${summary && summary.total_p_l >= 0 ? '#10b981' : '#ef4444'}` }}>
                    <span className={styles.statIcon}>🎯</span>
                    <div>
                        <div className={styles.statLabel}>Total P&amp;L</div>
                        <div className={`${styles.statValue} ${summary ? plClass(summary.total_p_l) : ''}`}>
                            {summary ? `${summary.total_p_l >= 0 ? '+' : ''}$${fmt(summary.total_p_l)} (${summary.total_p_l_pct.toFixed(2)}%)` : '—'}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.mainGrid}>
                {/* Portfolio Performance Chart */}
                <div className={styles.card + ' ' + styles.chartCard} data-tour="dash-performance">
                    <div className={styles.cardHeader}>
                        <h3>Portfolio Performance</h3>
                        <div className={styles.periodTabs}>
                            {['1D', '1W', 'M', '1Y'].map(p => (
                                <button key={p}
                                    className={`${styles.periodBtn} ${perfPeriod === p ? styles.periodActive : ''}`}
                                    onClick={() => setPerfPeriod(p)}
                                >{p}</button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        {perfData.length > 0 ? (
                            <Chart options={areaChartOptions} series={areaChartSeries} type="area" height={280} />
                        ) : (
                            <Empty icon="📈" text="Add stocks to see performance" />
                        )}
                    </div>
                </div>

                {/* Asset Allocation Donut */}
                <div className={styles.card} data-tour="dash-allocation">
                    <div className={styles.cardHeader}><h3>Asset Allocation</h3></div>
                    <div className={styles.cardBody} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280 }}>
                        {allocation.length > 0 ? (
                            <Chart options={donutOptions} series={donutSeries} type="donut" height={280} width={320} />
                        ) : (
                            <Empty icon="🥧" text="No stocks in portfolio" />
                        )}
                    </div>
                </div>
            </div>

            {/* Holdings with Sparklines + Market Sentiment */}
            <div className={styles.mainGrid}>
                <div className={styles.card} data-tour="dash-holdings">
                    <div className={styles.cardHeader}>
                        <h3>Holdings Overview</h3>
                        <button className={styles.refreshBtn} onClick={load}>↻ Refresh</button>
                    </div>
                    <div className={styles.cardBody}>
                        {loading ? <div className={styles.shimmer} /> :
                            holdings.length ? holdings.map(h => (
                                <div key={h.symbol} className={styles.holdingRow}>
                                    <div className={styles.holdingLeft}>
                                        <div className={styles.holdingSymbolWrap}>
                                            <span className={styles.hSymbol}>{h.symbol}</span>
                                            <span className={styles.hQty}>{h.quantity} shares</span>
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
                                        <span className={styles.holdingPrice}>${fmt(h.live_price)}</span>
                                        <span className={plClass(h.p_l)}>
                                            {h.p_l >= 0 ? '+' : ''}${fmt(h.p_l)} ({h.p_l_pct >= 0 ? '+' : ''}{h.p_l_pct.toFixed(2)}%)
                                        </span>
                                    </div>
                                </div>
                            )) : <Empty icon="💼" text="No holdings. Start trading!" />
                        }
                    </div>
                </div>

                {/* Market Sentiment */}
                <div className={styles.card} data-tour="dash-sentiment">
                    <div className={styles.cardHeader}><h3>Market Sentiment</h3></div>
                    <div className={styles.cardBody}>
                        {txList.length ? txList.map((t, i) => (
                            <div key={i} className={styles.txRow}>
                                <span className={`${styles.txBadge} ${t.transaction_type === 'BUY' ? styles.buy : styles.sell}`}>{t.transaction_type}</span>
                                <span className={styles.txSymbol}>{t.stock_symbol}</span>
                                <span className={styles.txInfo}>{t.quantity} shares</span>
                                <span className={styles.txPrice}>${fmt(t.price)}</span>
                                <span className={styles.txDate}>{fmtDate(t.timestamp)}</span>
                            </div>
                        )) : <Empty icon="📋" text="No transactions yet." />}

                        {/* Fear & Greed Gauge */}
                        <div className={styles.gaugeCard}>
                            <div className={styles.gaugeLabel}>Fear & Greed Index</div>
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
