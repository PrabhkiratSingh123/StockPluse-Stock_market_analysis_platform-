import { useSettings } from '../context/SettingsContext';

export default function Portfolio() {
    const { t, formatCurrency, formatCurrencyCompact, currency } = useSettings();
    const [holdings, setHoldings] = useState([]);

    // Chart data for selected stock
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [chartData, setChartData] = useState(null);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartPeriod, setChartPeriod] = useState('3mo');

    // Refs so callbacks can read latest values without being deps (avoids infinite loops)
    const selectedSymbolRef = useRef('');
    const chartPeriodRef = useRef('3mo');
    useEffect(() => { selectedSymbolRef.current = selectedSymbol; }, [selectedSymbol]);
    useEffect(() => { chartPeriodRef.current = chartPeriod; }, [chartPeriod]);

    // Order state
    const [orderSymbol, setOrderSymbol] = useState('');
    const [orderQty, setOrderQty] = useState('');
    const [orderType, setOrderType] = useState('BUY');
    const [orderMsg, setOrderMsg] = useState('');
    const [orderErr, setOrderErr] = useState('');
    const [orderLoading, setOrderLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/portfolio/analytics/');
            setSummary(data.summary);
            setHoldings(data.holdings || []);
            setAllocation(data.allocation || []);
            if (data.holdings?.length > 0 && !selectedSymbolRef.current) {
                setSelectedSymbol(data.holdings[0].symbol);
            }
        } catch { }
        setLoading(false);
    }, []); // No selectedSymbol dep — prevents infinite loop

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!loading && summary) {
            markPageReady();
        }
    }, [loading, summary, markPageReady]);

    const loadChart = useCallback(async () => {
        if (!selectedSymbolRef.current) return;
        setChartLoading(true);
        try {
            const { data } = await api.get(`/trading/chart/${selectedSymbolRef.current}/?period=${chartPeriodRef.current}`);
            setChartData(data);
        } catch {
            setChartData(null);
        }
        setChartLoading(false);
    }, []); // No selectedSymbol/chartPeriod deps — prevents infinite loop

    // Re-run chart load any time selected symbol or period changes
    useEffect(() => { loadChart(); }, [loadChart]);
    useEffect(() => { loadChart(); }, [selectedSymbol, chartPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

    const placeOrder = async () => {
        setOrderErr(''); setOrderMsg('');
        if (!orderSymbol || !orderQty || Number(orderQty) <= 0) {
            setOrderErr(t('invalid_order_input'));
            return;
        }
        setOrderLoading(true);
        try {
            const { data } = await api.post('/trading/order/', {
                symbol: orderSymbol.toUpperCase(),
                quantity: Number(orderQty),
                type: orderType,
            });
            if (data.status) {
                setOrderMsg(`✅ ${data.status} — ${t('price')}: ${formatCurrency(data.executed_price)}`);
                setOrderQty('');
                setTimeout(() => { setOrderMsg(''); load(); }, 2000);
            } else {
                setOrderErr(data.error || t('order_failed'));
            }
        } catch (e) {
            setOrderErr(e.response?.data?.error || t('order_failed'));
        }
        setOrderLoading(false);
    };

    const plClass = (v) => v > 0 ? styles.positive : v < 0 ? styles.negative : '';

    // ── Candlestick + EMA + Prediction Chart ──
    const buildCandlestickOpts = () => {
        if (!chartData) return { options: {}, series: [] };

        const ohlc = chartData.ohlc || [];
        const ema = (chartData.ema_20 || []).filter(e => e.y !== null);
        const targetPrice = chartData.target_mean_price;
        const currentPrice = chartData.current_price;

        // Build prediction annotation line
        const annotations = {};
        if (targetPrice && ohlc.length > 0) {
            annotations.yaxis = [{
                y: targetPrice,
                borderColor: '#f59e0b',
                strokeDashArray: 6,
                label: {
                    text: `${t('target')}: ${formatCurrency(targetPrice)}`,
                    style: {
                        color: '#0f172a',
                        background: '#f59e0b',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: { left: 8, right: 8, top: 4, bottom: 4 },
                    },
                    position: 'front',
                }
            }];
        }

        // Prediction dashed line from current price to target
        let predictionSeries = [];
        if (targetPrice && currentPrice && ohlc.length >= 2) {
            const lastTs = ohlc[ohlc.length - 1].x;
            const dayMs = 86400000;
            predictionSeries = [
                { x: lastTs, y: currentPrice },
                { x: lastTs + dayMs * 15, y: targetPrice },
            ];
        }

        const options = {
            chart: {
                type: 'candlestick',
                height: 340,
                background: 'transparent',
                toolbar: {
                    show: true,
                    tools: { download: false, selection: true, zoom: true, pan: true, reset: true },
                },
                zoom: { enabled: true },
            },
            plotOptions: {
                candlestick: {
                    colors: { upward: '#10b981', downward: '#ef4444' },
                    wick: { useFillColor: true },
                }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    style: { colors: '#64748b', fontSize: '10px' },
                    datetimeUTC: false,
                },
                axisBorder: { color: 'rgba(255,255,255,0.06)' },
            },
            yaxis: {
                tooltip: { enabled: true },
                labels: {
                    style: { colors: '#64748b', fontSize: '10px' },
                    formatter: (v) => formatCurrency(v),
                },
            },
            grid: {
                borderColor: 'rgba(255,255,255,0.05)',
                strokeDashArray: 4,
            },
            annotations,
            tooltip: {
                theme: 'dark',
            },
        };

        const series = [
            { name: t('price'), type: 'candlestick', data: ohlc },
            {
                name: 'EMA 20',
                type: 'line',
                data: ema,
            },
        ];

        if (predictionSeries.length > 0) {
            series.push({
                name: t('prediction'),
                type: 'line',
                data: predictionSeries,
            });
        }

        return { options, series };
    };

    // RSI Chart (synced below candlestick)
    const buildRsiChart = () => {
        if (!chartData) return { options: {}, series: [] };

        const rsi = (chartData.rsi_14 || []).filter(e => e.y !== null);

        return {
            options: {
                chart: {
                    type: 'line',
                    height: 160,
                    background: 'transparent',
                    toolbar: { show: false },
                    zoom: { enabled: false },
                },
                colors: ['#8b5cf6'],
                stroke: { curve: 'smooth', width: 2 },
                xaxis: {
                    type: 'datetime',
                    labels: {
                        style: { colors: '#64748b', fontSize: '10px' },
                        datetimeUTC: false,
                    },
                    axisBorder: { color: 'rgba(255,255,255,0.06)' },
                },
                yaxis: {
                    min: 0,
                    max: 100,
                    tickAmount: 4,
                    labels: {
                        style: { colors: '#64748b', fontSize: '10px' },
                    },
                },
                grid: {
                    borderColor: 'rgba(255,255,255,0.05)',
                    strokeDashArray: 4,
                },
                annotations: {
                    yaxis: [
                        { y: 70, borderColor: '#ef4444', strokeDashArray: 3, label: { text: t('overbought'), style: { color: '#ef4444', background: 'transparent', fontSize: '9px' } } },
                        { y: 30, borderColor: '#10b981', strokeDashArray: 3, label: { text: t('oversold'), style: { color: '#10b981', background: 'transparent', fontSize: '9px' } } },
                    ],
                },
                tooltip: { theme: 'dark' },
                dataLabels: { enabled: false },
            },
            series: [{ name: 'RSI (14)', data: rsi }],
        };
    };

    // Asset allocation donut
    const donutOptions = {
        chart: { type: 'donut', background: 'transparent' },
        labels: allocation.map(a => a.symbol),
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'],
        stroke: { show: true, width: 2, colors: ['#0f172a'] },
        plotOptions: {
            pie: {
                donut: {
                    size: '68%',
                    labels: {
                        show: true,
                        name: { show: true, fontSize: '13px', color: '#f1f5f9' },
                        value: {
                            show: true, fontSize: '16px', fontWeight: 700, color: '#f1f5f9',
                            formatter: (v) => `${Number(v).toFixed(1)}%`
                        },
                        total: {
                            show: true, showAlways: true, label: t('equity_tag'),
                            fontSize: '10px', fontWeight: 600, color: '#64748b',
                            formatter: () => `${allocation.length} ${t('stocks_held')}`
                        }
                    }
                }
            }
        },
        legend: {
            position: 'bottom', labels: { colors: '#94a3b8' }, fontSize: '11px',
            formatter: (name, opts) => `${name} (${allocation[opts.seriesIndex]?.percentage || 0}%)`
        },
        tooltip: { theme: 'dark', y: { formatter: (v) => formatCurrency(v) } },
        dataLabels: { enabled: false },
    };

    const { options: candleOpts, series: candleSeries } = buildCandlestickOpts();
    const { options: rsiOpts, series: rsiSeries } = buildRsiChart();

    // Sparkline helper
    const getSparkOpts = (color) => ({
        chart: { type: 'line', sparkline: { enabled: true }, height: 30, width: 80 },
        stroke: { curve: 'smooth', width: 1.5 },
        colors: [color],
        tooltip: { enabled: false },
    });

    return (
        <Layout pageTitle={t('portfolio')}>
            {/* Summary Bar */}
            {summary && (
                <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard} data-tour="total-invested">
                        <span className={styles.sLabel}>{t('total_invested')}</span>
                        <span className={styles.sValue}>{formatCurrency(summary.total_investment)}</span>
                        <div className={styles.sBar} style={{ background: '#3b82f6' }} />
                    </div>
                    <div className={styles.summaryCard} data-tour="current-value">
                        <span className={styles.sLabel}>{t('current_value_upper')}</span>
                        <span className={styles.sValue}>{formatCurrency(summary.total_current_value)}</span>
                        <div className={styles.sBar} style={{ background: '#8b5cf6' }} />
                    </div>
                    <div className={styles.summaryCard} data-tour="total-pl">
                        <span className={styles.sLabel}>{t('total_p_l_upper')}</span>
                        <span className={`${styles.sValue} ${plClass(summary.total_p_l)}`}>
                            {summary.total_p_l >= 0 ? '+' : ''}{formatCurrency(summary.total_p_l)} ({summary.total_p_l_pct.toFixed(2)}%)
                        </span>
                        <div className={styles.sBar} style={{ background: summary.total_p_l >= 0 ? '#10b981' : '#ef4444' }} />
                    </div>
                    <div className={styles.summaryCard}>
                        <span className={styles.sLabel}>{t('stocks_held_upper')}</span>
                        <span className={styles.sValue}>{summary.stock_count}</span>
                        <div className={styles.sBar} style={{ background: '#f59e0b' }} />
                    </div>
                </div>
            )}

            {/* Charts Section */}
            <div className={styles.chartGrid}>
                {/* Main Chart Area */}
                <div className={styles.card} data-tour="performance-chart">
                    <div className={styles.cardHeader}>
                        <div className={styles.chartHeaderLeft}>
                            <h3>📈 {t('live_stock_lookup')}</h3>
                            {holdings.length > 0 && (
                                <div className={styles.stockTabs}>
                                    {holdings.map(h => (
                                        <button
                                            key={h.symbol}
                                            className={`${styles.stockTab} ${selectedSymbol === h.symbol ? styles.stockTabActive : ''}`}
                                            onClick={() => setSelectedSymbol(h.symbol)}
                                        >
                                            <StockLogo symbol={h.symbol} logoUrl={h.logo_url} name={h.long_name || h.symbol} size={20} />
                                            {h.symbol}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className={styles.periodTabs}>
                            {['1mo', '3mo', '6mo', '1y'].map(p => (
                                <button key={p}
                                    className={`${styles.periodBtn} ${chartPeriod === p ? styles.periodActive : ''}`}
                                    onClick={() => setChartPeriod(p)}
                                >{p.toUpperCase()}</button>
                            ))}
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        {chartLoading ? <div className={styles.shimmer} style={{ height: 340 }} /> :
                            chartData ? (
                                <>
                                    {/* Stock Info Bar */}
                                    <div className={styles.stockInfoBar}>
                                        <div className={styles.stockName}>
                                            <StockLogo
                                                symbol={chartData.symbol}
                                                logoUrl={chartData.logo_url}
                                                name={chartData.long_name || chartData.short_name || chartData.symbol}
                                                size={44}
                                            />
                                            <div>
                                                <span className={styles.stockNameSymbol}>{chartData.symbol}</span>
                                                <span className={styles.stockNameFull}>{chartData.long_name || chartData.short_name || ''}</span>
                                            </div>
                                        </div>
                                        <div className={styles.stockMeta}>
                                            <span className={styles.stockPrice}>{formatCurrency(chartData.current_price)}</span>
                                            {chartData.target_mean_price && (
                                                <span className={styles.targetLabel}>{t('target')}: {formatCurrency(chartData.target_mean_price)}</span>
                                            )}
                                        </div>
                                        <div className={styles.fundBadges}>
                                            {chartData.beta && <span className={styles.badge}>β {chartData.beta.toFixed(2)}</span>}
                                            {chartData.pe_ratio && <span className={styles.badge}>P/E {chartData.pe_ratio.toFixed(1)}</span>}
                                            {chartData.dividend_yield && <span className={styles.badge}>Div {(chartData.dividend_yield * 100).toFixed(2)}%</span>}
                                            {chartData.recommendation && <span className={`${styles.badge} ${styles.recBadge}`}>{chartData.recommendation.toUpperCase()}</span>}
                                        </div>
                                    </div>

                                    {/* Candlestick Chart */}
                                    <Chart options={candleOpts} series={candleSeries} type="line" height={340} />

                                    {/* RSI Chart */}
                                    <div className={styles.rsiSection}>
                                        <div className={styles.rsiLabel}>{t('rsi_name_full')} (14)</div>
                                        <Chart options={rsiOpts} series={rsiSeries} type="line" height={270} />
                                    </div>
                                </>
                            ) : (
                                <div className={styles.emptyChart}>
                                    <div style={{ fontSize: '3rem', opacity: 0.3 }}>📊</div>
                                    <p>{t('select_stock_to_view')}</p>
                                </div>
                            )
                        }
                    </div>
                </div>

                {/* Right Sidebar: Place Order + Donut */}
                <div className={styles.sideColumn}>
                    {/* Place Order */}
                    <div className={styles.card} data-tour="buy-sell">
                        <div className={styles.cardHeader}><h3>⚡ {t('place_order')}</h3></div>
                        <div className={styles.cardBody}>
                            <div className={styles.formGroup}>
                                <label>{t('symbol_upper')}</label>
                                <input className={styles.input} value={orderSymbol}
                                    onChange={e => setOrderSymbol(e.target.value)} placeholder="e.g. AAPL" />
                            </div>
                            <div className={styles.formGroup}>
                                <label>{t('qty_upper')}</label>
                                <input className={styles.input} type="number" value={orderQty} min="1"
                                    onChange={e => setOrderQty(e.target.value)} placeholder={t('shares_placeholder_short')} />
                            </div>
                            <div className={styles.orderTypeBtns}>
                                <button className={`${styles.btnBuy} ${orderType === 'BUY' ? '' : styles.dimmed}`} onClick={() => setOrderType('BUY')}>{t('buy_btn')}</button>
                                <button className={`${styles.btnSell} ${orderType === 'SELL' ? '' : styles.dimmed}`} onClick={() => setOrderType('SELL')}>{t('sell_btn')}</button>
                            </div>
                            {orderErr && <div className={styles.error}>{orderErr}</div>}
                            {orderMsg && <div className={styles.success}>{orderMsg}</div>}
                            <button className={styles.btnExecute} onClick={placeOrder} disabled={orderLoading}>
                                {orderLoading ? `⏳ ${t('executing')}` : t('execute_order_btn')}
                            </button>
                        </div>
                    </div>

                    {/* AI Trend Prediction */}
                    {chartData && chartData.target_mean_price && (
                        <div className={styles.card}>
                            <div className={styles.cardHeader}><h3>🤖 {t('ai_trend_prediction')}</h3></div>
                            <div className={styles.cardBody}>
                                <div className={styles.predictionBox}>
                                    <div className={styles.predRow}>
                                        <span className={styles.predLabel}>{t('current')}</span>
                                        <span className={styles.predValue}>{formatCurrency(chartData.current_price)}</span>
                                    </div>
                                    <div className={`${styles.predRow} ${styles.predTarget}`}>
                                        <span className={styles.predLabel}>{t('analyst_target')}</span>
                                        <span className={styles.predValue}>{formatCurrency(chartData.target_mean_price)}</span>
                                    </div>
                                    <div className={styles.predRow}>
                                        <span className={styles.predLabel}>{t('upside_downside')}</span>
                                        <span className={`${styles.predValue} ${chartData.target_mean_price >= chartData.current_price ? styles.positive : styles.negative}`}>
                                            {((chartData.target_mean_price - chartData.current_price) / chartData.current_price * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    {chartData.target_high_price && (
                                        <div className={styles.predRow}>
                                            <span className={styles.predLabel}>{t('target_high')}</span>
                                            <span className={styles.predValue}>{formatCurrency(chartData.target_high_price)}</span>
                                        </div>
                                    )}
                                    {chartData.target_low_price && (
                                        <div className={styles.predRow}>
                                            <span className={styles.predLabel}>{t('target_low')}</span>
                                            <span className={styles.predValue}>{formatCurrency(chartData.target_low_price)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Donut */}
                    <div className={styles.card} data-tour="asset-allocation">
                        <div className={styles.cardHeader}><h3>{t('asset_allocation')}</h3></div>
                        <div className={styles.cardBody} style={{ display: 'flex', justifyContent: 'center' }}>
                            {allocation.length > 0 ? (
                                <Chart options={donutOptions} series={allocation.map(a => a.value)} type="donut" height={230} width={280} />
                            ) : (
                                <div className={styles.emptyChart}><p>{t('no_data_chart')}</p></div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Holdings Table */}
            <div className={styles.card} style={{ marginTop: '1.2rem' }} data-tour="transactions-section">
                <div className={styles.cardHeader}>
                    <h3>{t('detailed_holdings')}</h3>
                    <button className={styles.refreshBtn} onClick={load}>↻ {t('refresh')}</button>
                </div>
                <div className={styles.cardBody}>
                    {loading ? (
                        <div className={styles.shimmer} />
                    ) : holdings.length ? (
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>{t('type_upper')}</th><th>{t('company_upper')}</th><th>{t('qty_upper')}</th><th>{t('avg_cost_upper')}</th>
                                        <th>{t('change_upper')}</th><th>{t('live_price_upper')}</th><th>{t('current_upper')}</th><th>P&amp;L %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {holdings.map(h => (
                                        <tr key={h.symbol} className={styles.tableRow}>
                                            <td>
                                                <span className={`${styles.typeBadge} ${h.p_l >= 0 ? styles.badgeBuy : styles.badgeSell}`}>
                                                    {h.p_l >= 0 ? t('buy_tag') : t('sell_tag')}
                                                </span>
                                            </td>
                                            <td className={styles.symbolCell}>
                                                <StockLogo symbol={h.symbol} logoUrl={h.logo_url} name={h.long_name || h.symbol} size={32} />
                                                <div className={styles.companyInfo}>
                                                    <span className={styles.cellName}>{h.long_name || h.short_name || h.symbol}</span>
                                                    <span className={styles.cellTicker}>{h.symbol}</span>
                                                </div>
                                                {h.sparkline && h.sparkline.length > 2 && (
                                                    <Chart
                                                        options={getSparkOpts(h.p_l >= 0 ? '#10b981' : '#ef4444')}
                                                        series={[{ data: h.sparkline }]}
                                                        type="line"
                                                        height={30}
                                                        width={80}
                                                    />
                                                )}
                                            </td>
                                            <td>{h.quantity}</td>
                                            <td>{formatCurrency(h.avg_price)}</td>
                                            <td>
                                                <span className={plClass(h.change)}>{h.change >= 0 ? '+' : ''}{h.change_pct?.toFixed(1)}%</span>
                                            </td>
                                            <td>{formatCurrency(h.live_price)}</td>
                                            <td>{formatCurrency(h.current_value)}</td>
                                            <td>
                                                <span className={`${styles.plBadge} ${h.p_l >= 0 ? styles.plPositive : styles.plNegative}`}>
                                                    {h.p_l_pct >= 0 ? '+' : ''}{h.p_l_pct.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className={styles.emptyChart}>
                            <div style={{ fontSize: '2.5rem', opacity: 0.3 }}>💼</div>
                            <p>{t('portfolio_empty')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Transaction Volume */}
            <div className={styles.card} style={{ marginTop: '1.2rem' }}>
                <div className={styles.cardHeader}><h3>{t('transaction_volume_30d')}</h3></div>
                <div className={styles.cardBody}>
                    {holdings.map(h => (
                        <div key={h.symbol} className={styles.txVolRow}>
                            <span className={`${styles.typeBadge} ${h.p_l >= 0 ? styles.badgeBuy : styles.badgeSell}`}>
                                {h.p_l >= 0 ? t('buy_tag') : t('sell_tag')}
                            </span>
                            <span className={styles.txVolSymbol}>{h.symbol}</span>
                            <span className={styles.txVolQty}>{h.quantity}</span>
                            <span className={styles.txVolMeta}>{h.symbol}</span>
                            <span className={styles.txVolMeta}>{h.quantity} {t('shares')}</span>
                            <span className={styles.txVolPrice}>{formatCurrency(h.avg_price)}</span>
                            <span className={styles.txVolPrice}>{formatCurrency(h.current_value)}</span>
                            <span className={`${styles.plBadge} ${h.p_l >= 0 ? styles.plPositive : styles.plNegative}`}>
                                {h.p_l_pct >= 0 ? '+' : ''}{h.p_l_pct.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Trending Stocks Footer */}
            <div className={styles.trendingBar}>
                <span className={styles.trendingLabel}>{t('trending_stocks')}</span>
                {['MSFT', 'META', 'NFLX', 'AMZN', 'GOOGL'].map(s => (
                    <span key={s} className={styles.trendingItem}>{s} {Math.random() > 0.5 ? '▲' : '▼'}</span>
                ))}
            </div>
        </Layout>
    );
}
