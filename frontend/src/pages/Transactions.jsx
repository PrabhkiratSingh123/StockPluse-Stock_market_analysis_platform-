import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useTour } from '../context/TourContext';
import { useSettings } from '../context/SettingsContext';
import styles from './Transactions.module.css';

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso, locale = 'en-US') => new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Transactions() {
    const { t, formatCurrency } = useSettings();
    const localeCode = t('locale_code') || 'en-US';
    const [txList, setTxList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const { markPageReady } = useTour();

    const load = async (page = 1) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/portfolio/transactions/?page=${page}&page_size=10`);
            const list = data?.results || (Array.isArray(data) ? data : []);
            setTxList(list);
            if (data?.count) setTotalPages(Math.ceil(data.count / 10));
            setCurrentPage(page);
        } catch { }
        setLoading(false);
    };

    useEffect(() => { load(1); }, []);

    useEffect(() => {
        if (!loading) {
            markPageReady();
        }
    }, [loading, markPageReady]);

    return (
        <Layout pageTitle={t('nav_transactions')}>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3>{t('tx_history')}</h3>
                    <button className={styles.btnSm} onClick={() => load(currentPage)}>{t('refresh')}</button>
                </div>
                <div className={styles.cardBody}>
                    {loading ? (
                        <div className={styles.shimmer} />
                    ) : txList.length ? (
                        <>
                            <div className={styles.tableWrap} data-tour="tx-table">
                                <table className={styles.table}>
                                    <thead>
                                        <tr><th>{t('type')}</th><th>{t('symbol')}</th><th>{t('quantity')}</th><th>{t('price')}</th><th>{t('total')}</th><th>{t('date')}</th></tr>
                                    </thead>
                                    <tbody>
                                        {txList.map((tx, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <span className={`${styles.badge} ${tx.transaction_type === 'BUY' ? styles.buy : styles.sell}`}>
                                                        {tx.transaction_type}
                                                    </span>
                                                </td>
                                                <td className={styles.symbol}>{tx.stock_symbol}</td>
                                                <td>{tx.quantity}</td>
                                                <td>{formatCurrency(tx.price)}</td>
                                                <td>{formatCurrency(tx.quantity * tx.price)}</td>
                                                <td className={styles.date}>{fmtDate(tx.timestamp, localeCode)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {totalPages > 1 && (
                                <div className={styles.pagination} data-tour="tx-pagination">
                                    {currentPage > 1 && <button onClick={() => load(currentPage - 1)}>{t('prev')}</button>}
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                        <button key={p} className={p === currentPage ? styles.activePage : ''} onClick={() => load(p)}>{p}</button>
                                    ))}
                                    {currentPage < totalPages && <button onClick={() => load(currentPage + 1)}>{t('next')}</button>}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.empty}>
                            <div className={styles.emptyIcon}>📋</div>
                            <p>{t('no_tx_order')}</p>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
