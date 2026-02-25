import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useTour } from '../context/TourContext';
import styles from './Transactions.module.css';

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Transactions() {
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
        <Layout pageTitle="Transactions">
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3>📋 Transaction History</h3>
                    <button className={styles.btnSm} onClick={() => load(currentPage)}>↻ Refresh</button>
                </div>
                <div className={styles.cardBody}>
                    {loading ? (
                        <div className={styles.shimmer} />
                    ) : txList.length ? (
                        <>
                            <div className={styles.tableWrap} data-tour="tx-table">
                                <table className={styles.table}>
                                    <thead>
                                        <tr><th>Type</th><th>Symbol</th><th>Qty</th><th>Price</th><th>Total</th><th>Date</th></tr>
                                    </thead>
                                    <tbody>
                                        {txList.map((t, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <span className={`${styles.badge} ${t.transaction_type === 'BUY' ? styles.buy : styles.sell}`}>
                                                        {t.transaction_type}
                                                    </span>
                                                </td>
                                                <td className={styles.symbol}>{t.stock_symbol}</td>
                                                <td>{t.quantity}</td>
                                                <td>${fmt(t.price)}</td>
                                                <td>${fmt(t.quantity * t.price)}</td>
                                                <td className={styles.date}>{fmtDate(t.timestamp)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {totalPages > 1 && (
                                <div className={styles.pagination} data-tour="tx-pagination">
                                    {currentPage > 1 && <button onClick={() => load(currentPage - 1)}>‹ Prev</button>}
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                        <button key={p} className={p === currentPage ? styles.activePage : ''} onClick={() => load(p)}>{p}</button>
                                    ))}
                                    {currentPage < totalPages && <button onClick={() => load(currentPage + 1)}>Next ›</button>}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className={styles.empty}>
                            <div className={styles.emptyIcon}>📋</div>
                            <p>No transactions yet. Place your first order!</p>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
