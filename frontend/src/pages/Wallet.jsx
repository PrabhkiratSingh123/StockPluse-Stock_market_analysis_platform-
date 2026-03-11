import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useSettings } from '../context/SettingsContext';
import styles from './Wallet.module.css';

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

// ─── Payment Method Icons ────────────────────────────────────────────────────
const PM_ICONS = { UPI: '📲', BANK: '🏦', CARD: '💳' };
const PM_COLORS = { UPI: '#f97316', BANK: '#3b82f6', CARD: '#8b5cf6' };

export default function Wallet() {
    const { t, formatCurrency, currentCurrency } = useSettings();
    const [balance, setBalance] = useState(0);
    const [spendingLimit, setSpendingLimit] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [loading, setLoading] = useState(true);

    // Deposit form
    const [amount, setAmount] = useState('');
    const [selectedPM, setSelectedPM] = useState('');
    const [isDepositing, setIsDepositing] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    // Modals
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [showAddPMModal, setShowAddPMModal] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [showLimitAlert, setShowLimitAlert] = useState(false);

    // Add Payment Method form
    const [pmType, setPmType] = useState('UPI');
    const [pmAccountName, setPmAccountName] = useState('');
    const [pmLabel, setPmLabel] = useState('');
    const [pmDetails, setPmDetails] = useState('');
    const [pmSaving, setPmSaving] = useState(false);
    const [pmMsg, setPmMsg] = useState('');

    // Spending Limit form
    const [limitInput, setLimitInput] = useState('');
    const [limitSaving, setLimitSaving] = useState(false);

    const txRef = uuid => `TX-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    // ── Load wallet data ────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        try {
            const [walletRes, txRes, pmRes] = await Promise.all([
                api.get('/users/wallet/'),
                api.get('/users/wallet/history/'),
                api.get('/users/payment-methods/')
            ]);
            setBalance(walletRes.data.balance);
            setSpendingLimit(walletRes.data.spending_limit);
            setTransactions(txRes.data);
            setPaymentMethods(pmRes.data);
        } catch (err) {
            console.error('Failed to load wallet data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Deposit ─────────────────────────────────────────────────────────────
    const handleDeposit = (e) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) return;
        setShowCheckoutModal(true);
    };

    const confirmDeposit = async () => {
        setIsDepositing(true);
        setMsg({ text: '', type: '' });
        try {
            await new Promise(r => setTimeout(r, 1800)); // Simulate gateway delay

            const pm = paymentMethods.find(p => String(p.id) === String(selectedPM));
            const { data } = await api.post('/users/wallet/deposit/', {
                amount: parseFloat(amount),
                payment_method_id: pm ? pm.id : null
            });
            setBalance(data.balance);
            setMsg({ text: t('deposit_success', { amount: formatCurrency(amount), ref: data.ref }), type: 'plus' });
            setAmount('');
            setShowCheckoutModal(false);
            loadData();
        } catch (err) {
            setMsg({ text: t('deposit_fail'), type: 'minus' });
            setShowCheckoutModal(false);
        } finally {
            setIsDepositing(false);
        }
    };

    // ── Add Payment Method ───────────────────────────────────────────────────
    const handleAddPM = async (e) => {
        e.preventDefault();
        setPmSaving(true);
        setPmMsg('');
        try {
            let details = pmDetails;
            if (pmType === 'BANK') {
                details = `Acc: ****${pmDetails.slice(-4)} | ${pmAccountName}`;
            } else if (pmType === 'UPI') {
                details = pmDetails; // e.g. name@upi
            }
            const label = pmLabel || (pmAccountName ? `${pmAccountName}'s ${pmType}` : pmType);
            await api.post('/users/payment-methods/', {
                method_type: pmType,
                label,
                details,
                is_default: paymentMethods.length === 0
            });
            setPmMsg(t('pm_added_success'));
            setPmAccountName('');
            setPmLabel('');
            setPmDetails('');
            await loadData();
            setTimeout(() => setShowAddPMModal(false), 800);
        } catch (err) {
            setPmMsg(t('pm_add_failed'));
        } finally {
            setPmSaving(false);
        }
    };

    const handleDeletePM = async (id) => {
        try {
            await api.delete(`/users/payment-methods/${id}/`);
            setMsg({ text: t('pm_deleted_success'), type: 'minus' });
            loadData();
        } catch { }
    };

    // ── Spending Limit ──────────────────────────────────────────────────────
    const handleSetLimit = async (e) => {
        e.preventDefault();
        setLimitSaving(true);
        try {
            const { data } = await api.post('/users/wallet/set-limit/', {
                spending_limit: limitInput === '' ? null : parseFloat(limitInput)
            });
            setSpendingLimit(data.spending_limit);
            setLimitInput('');
            setTimeout(() => setShowLimitModal(false), 500);
        } catch { }
        setLimitSaving(false);
    };

    // Check spending limit when amount changes
    useEffect(() => {
        if (spendingLimit && amount && parseFloat(amount) > parseFloat(spendingLimit)) {
            setShowLimitAlert(true);
        } else {
            setShowLimitAlert(false);
        }
    }, [amount, spendingLimit]);

    const getTxIcon = (type) => {
        switch (type) {
            case 'CREDIT': return '💰';
            case 'DEBIT': return '💸';
            case 'TRADE_BUY': return '📤';
            case 'TRADE_SELL': return '📥';
            default: return '📝';
        }
    };

    const selectedPMObj = paymentMethods.find(p => String(p.id) === String(selectedPM));

    if (loading) return (
        <Layout pageTitle={t('purse_tab')}>
            <div className={styles.loadingWrap}>
                <div className={styles.spinner}></div>
                <p>{t('loading')}</p>
            </div>
        </Layout>
    );

    return (
        <Layout pageTitle={t('purse_tab')}>
            <div className={styles.container}>

                {/* ── Balance Hero ─────────────────────────────────────── */}
                <div className={styles.balanceCard}>
                    <div className={styles.balanceInfo}>
                        <div className={styles.label}>{t('available_balance')}</div>
                        <h1 className={styles.value}>{formatCurrency(balance)}</h1>
                        {spendingLimit && (
                            <div className={styles.limitBadge}>
                                🛡️ {t('spending_limit')}: {formatCurrency(spendingLimit)}
                            </div>
                        )}
                    </div>
                    <div className={styles.balanceActions}>
                        <button className={styles.limitBtn} onClick={() => setShowLimitModal(true)}>
                            {spendingLimit ? `✏️ ${t('set_limit')}` : `🛡️ ${t('spending_limit')}`}
                        </button>
                        <div className={styles.purseIcon}>💰</div>
                    </div>
                </div>

                {/* ── Spending Limit Alert ──────────────────────────────── */}
                {showLimitAlert && (
                    <div className={styles.limitAlert}>
                        ⚠️ <strong>{t('limit_exceeded')}</strong>{' '}
                        {t('limit_alert', { amount: formatCurrency(amount), limit: formatCurrency(spendingLimit) })}
                    </div>
                )}

                <div className={styles.mainGrid}>
                    {/* ── Add Funds ──────────────────────────────────────── */}
                    <div className={styles.card}>
                        <h3>💳 {t('add_funds')}</h3>
                        <p className={styles.hint}>{t('add_funds_hint')}</p>

                        <form onSubmit={handleDeposit}>
                            <div className={styles.inputGroup}>
                                <label>{t('amount_usd')}</label>
                                <div className={styles.amountInputWrap}>
                                    <span className={styles.rupee}>{currentCurrency.symbol}</span>
                                    <input
                                        type="number" step="0.01" placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        disabled={isDepositing}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Payment Method Selector */}
                            <div className={styles.inputGroup}>
                                <label>{t('payment_method')}</label>
                                {paymentMethods.length === 0 ? (
                                    <div className={styles.noPMHint}>
                                        {t('no_payment_methods')}{' '}
                                        <button type="button" className={styles.addPMLink} onClick={() => setShowAddPMModal(true)}>
                                            {t('add_one')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className={styles.pmList}>
                                        {paymentMethods.map(pm => (
                                            <label key={pm.id} className={`${styles.pmOption} ${String(selectedPM) === String(pm.id) ? styles.pmSelected : ''}`}>
                                                <input
                                                    type="radio"
                                                    name="pm"
                                                    value={pm.id}
                                                    checked={String(selectedPM) === String(pm.id)}
                                                    onChange={() => setSelectedPM(pm.id)}
                                                />
                                                <span className={styles.pmIcon} style={{ background: `${PM_COLORS[pm.method_type]}22`, color: PM_COLORS[pm.method_type] }}>
                                                    {PM_ICONS[pm.method_type]}
                                                </span>
                                                <div className={styles.pmText}>
                                                    <strong>{pm.label}</strong>
                                                    <small>{pm.details}</small>
                                                </div>
                                                {pm.is_default && <span className={styles.defaultTag}>{t('default_label')}</span>}
                                                <button type="button" className={styles.deletePM} onClick={() => handleDeletePM(pm.id)}>✕</button>
                                            </label>
                                        ))}
                                        <button type="button" className={styles.addMoreBtn} onClick={() => setShowAddPMModal(true)}>
                                            ＋ {t('add_new_method')}
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                className={styles.creditBtn}
                                disabled={isDepositing || !amount || paymentMethods.length === 0 || !selectedPM || showLimitAlert}
                            >
                                {isDepositing ? `⏳ ${t('processing')}` : `🔐 ${t('proceed')}`}
                            </button>
                        </form>

                        {msg.text && (
                            <div className={`${styles.msgBox} ${msg.type === 'plus' ? styles.msgSuccess : styles.msgError}`}>
                                {msg.text}
                            </div>
                        )}
                    </div>

                    {/* ── Recent Transactions ───────────────────────────── */}
                    <div className={styles.historyCard}>
                        <h3>{t('recent_transactions')}</h3>
                        <div className={styles.historyList}>
                            {transactions.length > 0 ? transactions.slice(0, 10).map(tx => (
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
                                        {tx.transaction_type.includes('CREDIT') || tx.transaction_type.includes('SELL') ? '+' : '-'}{formatCurrency(tx.amount)}
                                    </div>
                                </div>
                            )) : (
                                <div className={styles.empty}>{t('no_tx_yet')}</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                MODAL — Secure Checkout
            ══════════════════════════════════════════════════════════════ */}
            {showCheckoutModal && (
                <div className={styles.modalOverlay} onClick={() => !isDepositing && setShowCheckoutModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>{t('secure_checkout')}</h3>
                            <button className={styles.closeX} onClick={() => setShowCheckoutModal(false)} disabled={isDepositing}>✕</button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.mockMerchant}>
                                <img src="https://api.dicebear.com/7.x/initials/svg?seed=StockPulse" alt="StockPulse" />
                                <div>
                                    <h4>StockPulse Financial</h4>
                                    <p>{t('nav_live')}</p>
                                </div>
                            </div>

                            <div className={styles.amountDisplay}>
                                <span>{t('amount_to_add')}</span>
                                <h2>{formatCurrency(amount)}</h2>
                            </div>

                            {selectedPMObj && (
                                <div className={styles.checkoutPMInfo}>
                                    <span className={styles.checkoutPMIcon} style={{ color: PM_COLORS[selectedPMObj.method_type] }}>
                                        {PM_ICONS[selectedPMObj.method_type]}
                                    </span>
                                    <div>
                                        <strong>{selectedPMObj.label}</strong>
                                        <p>{selectedPMObj.details}</p>
                                    </div>
                                    <span className={styles.checkMark}>✔️</span>
                                </div>
                            )}

                            <button
                                className={styles.payNowBtn}
                                onClick={confirmDeposit}
                                disabled={isDepositing}
                            >
                                {isDepositing
                                    ? <span className={styles.processingRow}><span className={styles.dotSpinner}></span> {t('authorizing')}</span>
                                    : t('add_to_purse', { amount: formatCurrency(amount) })}
                            </button>
                            <p className={styles.secureText}>{t('ssl_text')}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL — Add Payment Method
            ══════════════════════════════════════════════════════════════ */}
            {showAddPMModal && (
                <div className={styles.modalOverlay} onClick={() => setShowAddPMModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>{t('add_payment_method')}</h3>
                            <button className={styles.closeX} onClick={() => setShowAddPMModal(false)}>✕</button>
                        </div>
                        <div className={styles.modalBody}>
                            {/* Type Tabs */}
                            <div className={styles.typeTabs}>
                                {['UPI', 'BANK'].map(tp => (
                                    <button
                                        key={tp}
                                        type="button"
                                        className={`${styles.typeTab} ${pmType === tp ? styles.typeTabActive : ''}`}
                                        style={pmType === tp ? { borderColor: PM_COLORS[tp], color: PM_COLORS[tp] } : {}}
                                        onClick={() => setPmType(tp)}
                                    >
                                        {PM_ICONS[tp]} {tp === 'UPI' ? t('upi_id') : t('bank_account_no')}
                                    </button>
                                ))}
                            </div>

                            <form onSubmit={handleAddPM}>
                                <div className={styles.inputGroup}>
                                    <label>{t('account_holder')}</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Prabhkirat Singh"
                                        value={pmAccountName}
                                        onChange={e => setPmAccountName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className={styles.inputGroup}>
                                    <label>{t('nickname')}</label>
                                    <input
                                        type="text"
                                        placeholder={pmType === 'UPI' ? "e.g. My PhonePe UPI" : "e.g. HDFC Salary Account"}
                                        value={pmLabel}
                                        onChange={e => setPmLabel(e.target.value)}
                                    />
                                </div>

                                {pmType === 'UPI' && (
                                    <div className={styles.inputGroup}>
                                        <label>{t('upi_id')}</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. name@okicici or 9876543210@upi"
                                            value={pmDetails}
                                            onChange={e => setPmDetails(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}

                                {pmType === 'BANK' && (
                                    <>
                                        <div className={styles.inputGroup}>
                                            <label>{t('bank_account_no')}</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. 1234567890"
                                                value={pmDetails}
                                                onChange={e => setPmDetails(e.target.value)}
                                                required
                                                minLength={8}
                                            />
                                        </div>
                                        <div className={styles.bankNote}>
                                            {t('bank_note')}
                                        </div>
                                    </>
                                )}

                                {pmMsg && (
                                    <div className={`${styles.msgBox} ${pmMsg.includes('added') ? styles.msgSuccess : styles.msgError}`}>
                                        {pmMsg}
                                    </div>
                                )}

                                <button type="submit" className={styles.payNowBtn} disabled={pmSaving} style={{ marginTop: '1rem' }}>
                                    {pmSaving ? t('saving') : `${t('save')} ${pmType === 'UPI' ? t('upi_id') : t('bank_account_no')}`}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MODAL — Set Spending Limit
            ══════════════════════════════════════════════════════════════ */}
            {showLimitModal && (
                <div className={styles.modalOverlay} onClick={() => setShowLimitModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>🛡️ {t('spending_limit')}</h3>
                            <button className={styles.closeX} onClick={() => setShowLimitModal(false)}>✕</button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.hint}>
                                {t('purse_wallet_desc')}
                            </p>
                            {spendingLimit && (
                                <div className={styles.currentLimit}>
                                    {t('current_limit')}: <strong>{formatCurrency(spendingLimit)}</strong>
                                </div>
                            )}
                            <form onSubmit={handleSetLimit}>
                                <div className={styles.inputGroup}>
                                    <label>{t('new_spending_limit')}</label>
                                    <div className={styles.amountInputWrap}>
                                        <span className={styles.rupee}>{currentCurrency.symbol}</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="e.g. 5000.00"
                                            value={limitInput}
                                            onChange={e => setLimitInput(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className={styles.limitModalBtns}>
                                    <button type="submit" className={styles.payNowBtn} disabled={limitSaving || !limitInput}>
                                        {limitSaving ? t('saving') : t('set_limit')}
                                    </button>
                                    {spendingLimit && (
                                        <button
                                            type="button"
                                            className={styles.clearLimitBtn}
                                            disabled={limitSaving}
                                            onClick={async () => {
                                                setLimitSaving(true);
                                                await api.post('/users/wallet/set-limit/', { spending_limit: null });
                                                setSpendingLimit(null);
                                                setLimitSaving(false);
                                                setShowLimitModal(false);
                                            }}
                                        >
                                            {t('remove_limit')}
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
