import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useSettings } from '../context/SettingsContext';
import { useTour } from '../context/TourContext';
import Chart from 'react-apexcharts';
import styles from './Market.module.css';
export default function Market() {
    const { t, formatCurrency, formatCurrencyCompact, currentCurrency, currency } = useSettings();
    const [liveSymbol, setLiveSymbol] = useState('');
    const [liveData, setLiveData] = useState(null);
    const [liveLoading, setLiveLoading] = useState(false);
    const [liveErr, setLiveErr] = useState('');

    // Chart data
    const [chartData, setChartData] = useState(null);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartPeriod, setChartPeriod] = useState('3mo');

    // Order state
    const [orderSymbol, setOrderSymbol] = useState('');
    const [orderQty, setOrderQty] = useState('');
    const [orderType, setOrderType] = useState('BUY');
    const [orderErr, setOrderErr] = useState('');
    const [orderOk, setOrderOk] = useState('');
    const [orderLoading, setOrderLoading] = useState(false);

    // Wallet balance
    const [walletBalance, setWalletBalance] = useState(null);

    // Indicators state
    const [indData, setIndData] = useState(null);
    const [indLoading, setIndLoading] = useState(false);

    // Predict state
    const [predData, setPredData] = useState(null);
    const [predLoading, setPredLoading] = useState(false);

    // Call markPageReady on load
    const { markPageReady } = useTour();
    useEffect(() => { markPageReady(); }, [markPageReady]);

    const fetchLive = async () => {
        if (!liveSymbol.trim()) return;
        setLiveErr(''); setLiveData(null); setLiveLoading(true);
        setChartLoading(true); setIndData(null); setPredData(null);
        const sym = liveSymbol.trim().toUpperCase();
        try {
            const [liveRes, chartRes, indRes, predRes, walletRes] = await Promise.allSettled([
                api.get(`/trading/live/${sym}/`),
                api.get(`/trading/chart/${sym}/?period=${chartPeriod}`),
                api.get(`/trading/indicators/${sym}/`),
                api.get(`/trading/predict/${sym}/`),
                api.get('/users/wallet/'),
            ]);

            if (liveRes.status === 'fulfilled' && liveRes.value.data?.price !== undefined) {
                setLiveData(liveRes.value.data);
                setOrderSymbol(sym);
            } else {
                setLiveErr(t('no_data_symbol'));
            }

            if (chartRes.status === 'fulfilled') setChartData(chartRes.value.data);
            if (indRes.status === 'fulfilled' && !indRes.value.data?.error) setIndData(indRes.value.data);
            if (predRes.status === 'fulfilled' && !predRes.value.data?.error) setPredData(predRes.value.data);
            if (walletRes.status === 'fulfilled') setWalletBalance(walletRes.value.data.balance);
        } catch {
            setLiveErr(t('network_error'));
        }
        setLiveLoading(false); setChartLoading(false);
    };

    const changePeriod = async (p) => {
        if (!liveData) return;
        setChartPeriod(p);
        setChartLoading(true);
        try {
            const { data } = await api.get(`/trading/chart/${liveData.symbol}/?period=${p}`);
            setChartData(data);
        } catch { }
        setChartLoading(false);
    };

    const placeOrder = async () => {
        setOrderErr(''); setOrderOk('');
        if (!orderSymbol || !orderQty || Number(orderQty) <= 0) { setOrderErr(t('enter_valid_order')); return; }
        setOrderLoading(true);
        try {
            const { data } = await api.post('/trading/order/', { symbol: orderSymbol.toUpperCase(), quantity: Number(orderQty), type: orderType });
            if (data.status) {
                setOrderOk(`✅ ${data.status} — ${t('price')}: ${formatCurrency(data.executed_price)}`);
                setOrderQty('');
                // Refresh wallet balance after trade
                const wRes = await api.get('/users/wallet/');
                setWalletBalance(wRes.data.balance);
            }
            else setOrderErr(data.error || t('order_failed'));
        } catch (e) { setOrderErr(e.response?.data?.error || t('order_failed')); }
        setOrderLoading(false);
    };

    // Build candlestick chart
    const buildCandleOpts = () => {
        if (!chartData) return { options: {}, series: [] };
        const ohlc = chartData.ohlc || [];
        const ema = (chartData.ema_20 || []).filter(e => e.y !== null);
        const targetPrice = chartData.target_mean_price;

        const annotations = {};
        if (targetPrice && ohlc.length > 0) {
            annotations.yaxis = [{
                y: targetPrice,
                borderColor: '#f59e0b',
                strokeDashArray: 6,
                label: {
                    text: `${t('analyst_target')}: ${formatCurrency(targetPrice)}`,
                    style: { color: '#0f172a', background: '#f59e0b', fontSize: '10px', fontWeight: 700, padding: { left: 6, right: 6, top: 3, bottom: 3 } },
                    position: 'front',
                }
            }];
        }

        return {
            options: {
                chart: { type: 'candlestick', height: 380, background: 'transparent', toolbar: { show: true, tools: { download: false } }, zoom: { enabled: true } },
                plotOptions: { candlestick: { colors: { upward: '#10b981', downward: '#ef4444' }, wick: { useFillColor: true } } },
                xaxis: { type: 'datetime', labels: { style: { colors: '#64748b', fontSize: '10px' }, datetimeUTC: false }, axisBorder: { color: 'rgba(255,255,255,0.06)' } },
                yaxis: { tooltip: { enabled: true }, labels: { style: { colors: '#64748b', fontSize: '10px' }, formatter: v => formatCurrency(v) } },
                grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                annotations,
                tooltip: { theme: 'dark' },
            },
            series: [
                { name: t('price'), type: 'candlestick', data: ohlc },
                { name: 'EMA 20', type: 'line', data: ema },
            ]
        };
    };

    // RSI chart
    const buildRsiOpts = () => {
        if (!chartData) return { options: {}, series: [] };
        const rsi = (chartData.rsi_14 || []).filter(e => e.y !== null);
        return {
            options: {
                chart: { type: 'line', height: 150, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
                colors: ['#8b5cf6'],
                stroke: { curve: 'smooth', width: 2 },
                xaxis: { type: 'datetime', labels: { style: { colors: '#64748b', fontSize: '10px' }, datetimeUTC: false } },
                yaxis: { min: 0, max: 100, tickAmount: 4, labels: { style: { colors: '#64748b', fontSize: '10px' } } },
                grid: { borderColor: 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                annotations: {
                    yaxis: [
                        { y: 70, borderColor: '#ef4444', strokeDashArray: 3, label: { text: '70', style: { color: '#ef4444', background: 'transparent', fontSize: '9px' } } },
                        { y: 30, borderColor: '#10b981', strokeDashArray: 3, label: { text: '30', style: { color: '#10b981', background: 'transparent', fontSize: '9px' } } },
                    ]
                },
                tooltip: { theme: 'dark' },
                dataLabels: { enabled: false },
            },
            series: [{ name: 'RSI (14)', data: rsi }],
        };
    };

    const { options: candleOpts, series: candleSeries } = buildCandleOpts();
    const { options: rsiOpts, series: rsiSeries } = buildRsiOpts();

    const trend = predData ? (predData.trend || '').toUpperCase() : '';
    const signalCls = trend.includes('BULL') ? styles.bullish : trend.includes('BEAR') ? styles.bearish : styles.neutralSignal;

    return (
        <Layout pageTitle={t('market')}>
            {/* Search + Add Symbol */}
            <div className={styles.searchSection} data-tour="market-search">
                <div className={styles.searchBar}>
                    <div className={styles.searchInputWrap}>
                        <span className={styles.searchIcon}>🔍</span>
                        <input className={styles.searchInput} value={liveSymbol} onChange={e => setLiveSymbol(e.target.value)}
                            placeholder={t('search_stock_placeholder')} onKeyDown={e => e.key === 'Enter' && fetchLive()} />
                    </div>
                    <button className={styles.btnSearch} onClick={fetchLive} disabled={liveLoading}>
                        {liveLoading ? `⏳ ${t('loading')}` : `🚀 ${t('analyze')}`}
                    </button>
                </div>
                {liveErr && <div className={styles.error}>{liveErr}</div>}
            </div>

            {liveData && (
                <div className={styles.mainLayout}>
                    {/* Left: Charts */}
                    <div className={styles.chartsColumn} data-tour="market-chart">
                        {/* Stock Info Header */}
                        <div className={styles.card} data-tour="market-stats">
                            <div className={styles.stockHeader}>
                                <div className={styles.stockTitleArea}>
                                    <h2 className={styles.stockTicker}>{liveData.symbol}</h2>
                                    <span className={styles.stockCompany}>{liveData.short_name || ''}</span>
                                    {liveData.sector && <span className={styles.sectorTag}>{liveData.sector}</span>}
                                </div>
                                <div className={styles.priceArea}>
                                    <div className={styles.priceMain}>{formatCurrency(liveData.price)}</div>
                                    <div className={`${styles.priceChange} ${liveData.change >= 0 ? styles.positive : styles.negative}`}>
                                        {liveData.change >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(liveData.change))} ({liveData.change_pct?.toFixed(2)}%)
                                    </div>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className={styles.statsGrid}>
                                {[
                                    { label: t('open'), value: formatCurrency(liveData.open) },
                                    { label: t('high'), value: formatCurrency(liveData.high) },
                                    { label: t('low'), value: formatCurrency(liveData.low) },
                                    { label: t('volume'), value: Number(liveData.volume).toLocaleString() },
                                    { label: t('avg_volume'), value: liveData.avg_volume ? Number(liveData.avg_volume).toLocaleString() : '—' },
                                    { label: t('market_cap'), value: formatCurrencyCompact(liveData.market_cap) },
                                    { label: t('pe_ratio'), value: liveData.pe_ratio ? liveData.pe_ratio.toFixed(2) : '—' },
                                    { label: t('eps'), value: liveData.eps ? formatCurrency(liveData.eps) : '—' },
                                    { label: t('beta'), value: liveData.beta ? liveData.beta.toFixed(2) : '—' },
                                    { label: t('div_yield'), value: liveData.dividend_yield ? `${(liveData.dividend_yield * 100).toFixed(2)}%` : '—' },
                                    { label: t('high_52w'), value: liveData.fifty_two_week_high ? formatCurrency(liveData.fifty_two_week_high) : '—' },
                                    { label: t('low_52w'), value: liveData.fifty_two_week_low ? formatCurrency(liveData.fifty_two_week_low) : '—' },
                                ].map(({ label, value }) => (
                                    <div key={label} className={styles.statItem}>
                                        <span className={styles.statLabel}>{label}</span>
                                        <span className={styles.statValue}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Candlestick Chart */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3>📊 {t('price_chart')}</h3>
                                <div className={styles.periodTabs}>
                                    {['1mo', '3mo', '6mo', '1y'].map(p => (
                                        <button key={p}
                                            className={`${styles.periodBtn} ${chartPeriod === p ? styles.periodActive : ''}`}
                                            onClick={() => changePeriod(p)}
                                        >{p.toUpperCase()}</button>
                                    ))}
                                </div>
                            </div>
                            <div className={styles.cardBody}>
                                {chartLoading ? <div className={styles.shimmer} style={{ height: 380 }} /> :
                                    chartData ? (
                                        <Chart options={candleOpts} series={candleSeries} type="line" height={380} />
                                    ) : null
                                }
                            </div>
                        </div>

                        {/* RSI Chart */}
                        {chartData && (
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <h3>📈 RSI ({t('rsi_name')})</h3>
                                </div>
                                <div className={styles.cardBody}>
                                    <Chart options={rsiOpts} series={rsiSeries} type="line" height={270} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar */}
                    <div className={styles.sideColumn}>
                        {/* Place Order */}
                        <div className={styles.card} data-tour="market-trade">
                            <div className={styles.cardHeader}><h3>⚡ {t('place_order')}</h3></div>
                            <div className={styles.cardBody}>
                                <div className={styles.formGroup}>
                                    <label>{t('symbol_upper')}</label>
                                    <input className={styles.input} value={orderSymbol} onChange={e => setOrderSymbol(e.target.value)} placeholder="e.g. AAPL" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>{t('quantity_upper')}</label>
                                    <input className={styles.input} type="number" value={orderQty} min="1"
                                        onChange={e => setOrderQty(e.target.value)} placeholder={t('shares_placeholder')} />
                                </div>
                                <div className={styles.orderTypeBtns}>
                                    <button className={`${styles.btnBuy} ${orderType === 'BUY' ? '' : styles.dimmed}`} onClick={() => setOrderType('BUY')}>{t('buy_btn')}</button>
                                    <button className={`${styles.btnSell} ${orderType === 'SELL' ? '' : styles.dimmed}`} onClick={() => setOrderType('SELL')}>{t('sell_btn')}</button>
                                </div>

                                {walletBalance !== null && (
                                    <div className={styles.walletNote}>
                                        {t('available_purse_balance')}: <b>{formatCurrency(walletBalance)}</b>
                                    </div>
                                )}

                                {orderErr && <div className={styles.error}>{orderErr}</div>}
                                {orderOk && <div className={styles.success}>{orderOk}</div>}
                                <button className={styles.btnExecute} onClick={placeOrder} disabled={orderLoading}>
                                    {orderLoading ? `⏳ ${t('executing')}` : t('execute_order_btn')}
                                </button>
                            </div>
                        </div>

                        {/* Technical Indicators */}
                        {indData && !indData.error && (
                            <div className={styles.card}>
                                <div className={styles.cardHeader}><h3>🔬 {t('technical_indicators')}</h3></div>
                                <div className={styles.cardBody}>
                                    {/* Signal Badge */}
                                    {indData.signal && (
                                        <div className={styles.signalBox}>
                                            <span className={styles.signalLabel}>{t('overall_signal')}</span>
                                            <span className={`${styles.signalBadge} ${styles[`signal${indData.signal}`]}`}>
                                                {indData.signal}
                                            </span>
                                        </div>
                                    )}
                                    <div className={styles.indGrid}>
                                        {Object.entries(indData)
                                            .filter(([k]) => !['symbol', 'signal', 'price_vs_ema20'].includes(k))
                                            .map(([k, v]) => (
                                                <div key={k} className={styles.indItem}>
                                                    <span className={styles.indLabel}>{k.replace(/_/g, ' ')}</span>
                                                    <span className={styles.indValue}>{typeof v === 'number' ? v.toFixed(2) : String(v ?? '—')}</span>
                                                </div>
                                            ))}
                                    </div>
                                    {indData.price_vs_ema20 && (
                                        <div className={styles.emaNote}>
                                            {t('price_is')} <strong className={indData.price_vs_ema20 === 'ABOVE' ? styles.positive : styles.negative}>
                                                {indData.price_vs_ema20}
                                            </strong> EMA(20)
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* AI Prediction */}
                        {predData && !predData.error && (
                            <div className={styles.card}>
                                <div className={styles.cardHeader}><h3>🤖 {t('ai_trend_prediction')}</h3></div>
                                <div className={styles.cardBody}>
                                    <div className={styles.predBox}>
                                        <div className={styles.predMain}>
                                            <div className={styles.predLabelText}>{t('ai_signal_for')} <b>{liveData.symbol}</b></div>
                                            <div className={`${styles.predSignal} ${signalCls}`}>{trend || t('neutral_signal')}</div>
                                        </div>
                                        {predData.confidence_score && (
                                            <div className={styles.confBar}>
                                                <div className={styles.confLabel}>{t('confidence')}</div>
                                                <div className={styles.confTrack}>
                                                    <div className={styles.confFill} style={{ width: `${predData.confidence_score}%` }} />
                                                </div>
                                                <span className={styles.confPct}>{predData.confidence_score.toFixed(1)}%</span>
                                            </div>
                                        )}
                                        <div className={styles.predDetails}>
                                            {Object.entries(predData)
                                                .filter(([k]) => !['trend', 'prediction', 'signal', 'confidence', 'confidence_score', 'symbol'].includes(k))
                                                .map(([k, v]) => (
                                                    <div key={k} className={styles.predRow}>
                                                        <span className={styles.predRowLabel}>{k.replace(/_/g, ' ')}</span>
                                                        <span className={styles.predRowValue}>{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Target Price Card */}
                        {liveData.target_mean_price && (
                            <div className={styles.card}>
                                <div className={styles.cardHeader}><h3>🎯 {t('analyst_target')}</h3></div>
                                <div className={styles.cardBody}>
                                    <div className={styles.targetGrid}>
                                        <div className={styles.targetItem}>
                                            <span className={styles.targetLabel}>{t('target_mean')}</span>
                                            <span className={styles.targetValue}>{formatCurrency(liveData.target_mean_price)}</span>
                                        </div>
                                        {liveData.target_high_price && (
                                            <div className={styles.targetItem}>
                                                <span className={styles.targetLabel}>{t('target_high')}</span>
                                                <span className={`${styles.targetValue} ${styles.positive}`}>{formatCurrency(liveData.target_high_price)}</span>
                                            </div>
                                        )}
                                        {liveData.target_low_price && (
                                            <div className={styles.targetItem}>
                                                <span className={styles.targetLabel}>{t('target_low')}</span>
                                                <span className={`${styles.targetValue} ${styles.negative}`}>{formatCurrency(liveData.target_low_price)}</span>
                                            </div>
                                        )}
                                        <div className={styles.targetItem}>
                                            <span className={styles.targetLabel}>{t('upside')}</span>
                                            <span className={`${styles.targetValue} ${liveData.target_mean_price >= liveData.price ? styles.positive : styles.negative}`}>
                                                {((liveData.target_mean_price - liveData.price) / liveData.price * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                    {liveData.recommendation && (
                                        <div className={styles.recBox}>
                                            {t('recommendation')}: <strong>{liveData.recommendation.toUpperCase()}</strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!liveData && !liveLoading && !liveErr && (
                <div className={styles.welcomeBox}>
                    <div className={styles.welcomeIcon}>📊</div>
                    <h2>{t('search_any_stock_title')}</h2>
                    <p>{t('search_any_stock_desc')}</p>
                    <div className={styles.suggestChips}>
                        {['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'META'].map(s => (
                            <button key={s} className={styles.suggestChip} onClick={() => { setLiveSymbol(s); }}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </Layout>
    );
}
