import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import styles from './Wallet.module.css';

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
});

export default function Wallet() {
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState('');
    const [isDepositing, setIsDepositing] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [showModal, setShowModal] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [walletRes, txRes, pmRes] = await Promise.all([
                api.get('/users/wallet/'),
                api.get('/users/wallet/transactions/'),
                api.get('/users/wallet/payment-methods/')
            ]);
            setBalance(walletRes.data.balance);
            setTransactions(txRes.data);
            setPaymentMethods(pmRes.data);
        } catch (err) {
            console.error('Failed to load wallet data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDeposit = async (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) return;
        setShowModal(true);
    };

    const confirmDeposit = async () => {
        setIsDepositing(true);
        setMsg({ text: '', type: '' });

        try {
            // Mocking a payment gateway delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            const { data } = await api.post('/users/wallet/deposit/', { amount: parseFloat(amount) });
            setBalance(data.balance);
            setMsg({ text: `Successfully added $${fmt(amount)} to your wallet!`, type: 'plus' });
            setAmount('');
            setShowModal(false);
            loadData();
        } catch (err) {
            setMsg({ text: 'Deposit failed. Please try again.', type: 'minus' });
            setShowModal(false);
        } finally {
            setIsDepositing(false);
        }
    };

    const getTxIcon = (type) => {
        switch (type) {
            case 'CREDIT': return '💰';
            case 'DEBIT': return '💸';
            case 'TRADE_BUY': return '📤';
            case 'TRADE_SELL': return '📥';
            default: return '📝';
        }
    };

    if (loading) return <Layout pageTitle="Purse & Wallet"><div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading your financial data...</div></Layout>;

    return (
        <Layout pageTitle="Purse & Wallet">
            <div className={styles.container}>
                {/* Balance Hero */}
                <div className={styles.balanceCard}>
                    <div className={styles.balanceInfo}>
                        <div className={styles.label}>AVAILABLE BALANCE</div>
                        <h1 className={styles.value}>${fmt(balance)}</h1>
                    </div>
                    <div className={styles.purseIcon}>💰</div>
                </div>

                <div className={styles.mainGrid}>
                    {/* Deposit Section */}
                    <div className={styles.card}>
                        <h3>Add Funds</h3>
                        <p className={styles.hint}>Securely add funds to your trading account via our mock payment gateway.</p>

                        <form onSubmit={handleDeposit}>
                            <div className={styles.inputGroup}>
                                <label>Amount (USD)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    disabled={isDepositing}
                                    required
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label>Payment Method</label>
                                <select>
                                    {paymentMethods.map(pm => (
                                        <option key={pm.id} value={pm.id}>
                                            {pm.label} ({pm.details})
                                        </option>
                                    ))}
                                    <option value="new">+ Add New Method</option>
                                </select>
                            </div>

                            <button type="submit" className={styles.creditBtn} disabled={isDepositing || !amount}>
                                {isDepositing ? 'Processing...' : 'Proceed to Checkout'}
                            </button>
                        </form>

                        {msg.text && (
                            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: msg.type === 'plus' ? '#10b981' : '#ef4444', fontWeight: '600', textAlign: 'center' }}>
                                {msg.text}
                            </div>
                        )}
                    </div>

                    {/* History Section */}
                    <div className={styles.historyCard}>
                        <h3>Recent Transactions</h3>
                        <div className={styles.historyList}>
                            {transactions.length > 0 ? transactions.map(tx => (
                                <div key={tx.id} className={styles.historyRow}>
                                    <div className={styles.txMain}>
                                        <div className={`${styles.txTypeIcon} ${styles[tx.transaction_type]}`}>
                                            {getTxIcon(tx.transaction_type)}
                                        </div>
                                        <div className={styles.txInfo}>
                                            <span className={styles.txDesc}>{tx.description || tx.transaction_type}</span>
                                            <span className={styles.txDate}>{fmtDate(tx.created_at)}</span>
                                        </div>
                                    </div>
                                    <div className={`${styles.txAmount} ${tx.transaction_type.includes('CREDIT') || tx.transaction_type.includes('SELL') ? styles.plus : styles.minus}`}>
                                        {tx.transaction_type.includes('CREDIT') || tx.transaction_type.includes('SELL') ? '+' : '-'}${fmt(tx.amount)}
                                    </div>
                                </div>
                            )) : (
                                <div className={styles.empty} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No transactions yet.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Mock Payment Gateway Modal */}
                {showModal && (
                    <div className={styles.modalOverlay}>
                        <div className={styles.modal}>
                            <div className={styles.modalHeader}>
                                <h3>Secure Checkout</h3>
                                <button className={styles.closeX} onClick={() => setShowModal(false)}>✕</button>
                            </div>
                            <div className={styles.modalBody}>
                                <div className={styles.mockMerchant}>
                                    <img src="https://api.dicebear.com/7.x/initials/svg?seed=StockPulse" alt="StockPulse" />
                                    <div>
                                        <h4>StockPulse Financial</h4>
                                        <p>Transaction ID: #SP-{Math.floor(Math.random() * 1000000)}</p>
                                    </div>
                                </div>
                                <div className={styles.amountDisplay}>
                                    <span>AMOUNT TO PAY</span>
                                    <h2>${fmt(amount)}</h2>
                                </div>
                                <div className={styles.paymentMethods}>
                                    <div className={styles.methodOption}>
                                        <input type="radio" checked readOnly />
                                        <div className={styles.methodInfo}>
                                            <strong>{paymentMethods[0]?.label || 'Stored Card'}</strong>
                                            <p>{paymentMethods[0]?.details || '**** **** **** 4444'}</p>
                                        </div>
                                        <span style={{ marginLeft: 'auto' }}>✔️</span>
                                    </div>
                                </div>
                                <button className={styles.payNowBtn} onClick={confirmDeposit} disabled={isDepositing}>
                                    {isDepositing ? 'Authorizing...' : `Pay $${fmt(amount)} Now`}
                                </button>
                                <p className={styles.secureText}>🔒 Secure SSL Encrypted Mock Payment</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
