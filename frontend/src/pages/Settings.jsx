import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useTheme } from '../context/ThemeContext';
import { useSettings, LANGUAGES, CURRENCIES } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import styles from './Settings.module.css';

// ── Section IDs ───────────────────────────────────────────────────────────────
const TABS = [
    { id: 'profile', icon: '👤', label: 'Profile' },
    { id: 'purse', icon: '💰', label: 'Purse & Wallet' },
    { id: 'language', icon: '🌐', label: 'Language' },
    { id: 'currency', icon: '💱', label: 'Currency' },
    { id: 'appearance', icon: '🎨', label: 'Appearance' },
];

export default function Settings() {
    const [activeTab, setActiveTab] = useState('profile');
    const { theme, toggleTheme } = useTheme();
    const { language, setLanguage, currency, setCurrency, currentLanguage, currentCurrency, t, formatCurrency,
        rates, ratesLoading, ratesError, ratesDate, refreshRates } = useSettings();
    const { user } = useAuth();

    // ── Profile state ─────────────────────────────────────────────────────────
    const [profile, setProfile] = useState({
        full_name: '', address: '', nationality: '', age: '', phone_number: '', is_kyc_verified: false
    });
    const [profileLoading, setProfileLoading] = useState(true);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState({ text: '', type: '' });

    // ── Purse/Wallet state ────────────────────────────────────────────────────
    const [walletBalance, setWalletBalance] = useState(0);
    const [spendingLimit, setSpendingLimit] = useState(null);
    const [limitInput, setLimitInput] = useState('');
    const [limitSaving, setLimitSaving] = useState(false);
    const [limitMsg, setLimitMsg] = useState({ text: '', type: '' });
    const [paymentMethods, setPaymentMethods] = useState([]);

    // ── Load data on mount ────────────────────────────────────────────────────
    useEffect(() => {
        // Profile
        api.get('/users/profile/')
            .then(res => { setProfile(res.data); setProfileLoading(false); })
            .catch(() => setProfileLoading(false));

        // Wallet
        api.get('/users/wallet/')
            .then(res => {
                setWalletBalance(res.data.balance);
                setSpendingLimit(res.data.spending_limit);
            }).catch(() => { });

        // Payment methods
        api.get('/users/payment-methods/')
            .then(res => setPaymentMethods(res.data))
            .catch(() => { });
    }, []);

    // ── Profile save ──────────────────────────────────────────────────────────
    const saveProfile = async (e) => {
        e.preventDefault();
        setProfileSaving(true);
        setProfileMsg({ text: '', type: '' });
        try {
            await api.patch('/users/profile/', { ...profile, age: profile.age === '' ? null : profile.age });
            setProfileMsg({ text: '✅ Profile saved successfully!', type: 'success' });
        } catch (err) {
            const msg = err.response?.data ? Object.values(err.response.data).flat().join(' ') : 'Save failed.';
            setProfileMsg({ text: `❌ ${msg}`, type: 'error' });
        }
        setProfileSaving(false);
        setTimeout(() => setProfileMsg({ text: '', type: '' }), 4000);
    };

    // ── Spending Limit save ───────────────────────────────────────────────────
    const saveLimit = async (e) => {
        e.preventDefault();
        setLimitSaving(true);
        setLimitMsg({ text: '', type: '' });
        try {
            const val = limitInput === '' ? null : parseFloat(limitInput);
            const { data } = await api.post('/users/wallet/set-limit/', { spending_limit: val });
            setSpendingLimit(data.spending_limit);
            setLimitInput('');
            setLimitMsg({ text: val ? t('spending_limit_set', { amount: formatCurrency(val) }) : t('spending_limit_cleared'), type: 'success' });
        } catch {
            setLimitMsg({ text: t('spending_limit_fail'), type: 'error' });
        }
        setLimitSaving(false);
        setTimeout(() => setLimitMsg({ text: '', type: '' }), 4000);
    };

    const removeLimit = async () => {
        setLimitSaving(true);
        try {
            await api.post('/users/wallet/set-limit/', { spending_limit: null });
            setSpendingLimit(null);
            setLimitMsg({ text: t('spending_limit_cleared'), type: 'success' });
        } catch { }
        setLimitSaving(false);
        setTimeout(() => setLimitMsg({ text: '', type: '' }), 3000);
    };

    const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Layout pageTitle={`⚙️ ${t('settings')}`}>
            <div className={styles.container}>
                {/* ── Left Sidebar Tabs ─────────────────────────── */}
                <aside className={styles.tabSidebar}>
                    <div className={styles.tabSidebarHeader}>
                        <div className={styles.avatarCircle}>
                            {user?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <div className={styles.avatarName}>{user?.username || 'User'}</div>
                            <div className={styles.avatarSub}>{t('settings')}</div>
                        </div>
                    </div>

                    <nav className={styles.tabNav}>
                        {[
                            { id: 'profile', icon: '👤', labelKey: 'profile_tab' },
                            { id: 'purse', icon: '💰', labelKey: 'purse_tab' },
                            { id: 'language', icon: '🌐', labelKey: 'language_tab' },
                            { id: 'currency', icon: '💱', labelKey: 'currency_tab' },
                            { id: 'appearance', icon: '🎨', labelKey: 'appearance_tab' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className={styles.tabIcon}>{tab.icon}</span>
                                <span>{t(tab.labelKey)}</span>
                                {activeTab === tab.id && <span className={styles.tabArrow}>›</span>}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* ── Right Content Panel ───────────────────────── */}
                <main className={styles.tabContent}>

                    {/* ══ PROFILE TAB ══════════════════════════════════════ */}
                    {activeTab === 'profile' && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2>{t('profile_details')}</h2>
                                <p>{t('profile_hint')}</p>
                            </div>

                            {profileLoading ? (
                                <div className={styles.loadingRow}><span className={styles.spinner}></span> {t('loading')}</div>
                            ) : (
                                <form onSubmit={saveProfile}>
                                    <div className={styles.formGrid}>
                                        <div className={styles.inputGroup}>
                                            <label>{t('full_name')}</label>
                                            <input type="text" placeholder="e.g. John Doe"
                                                value={profile.full_name}
                                                onChange={e => setProfile({ ...profile, full_name: e.target.value })} />
                                        </div>
                                        <div className={styles.inputGroup}>
                                            <label>{t('age')}</label>
                                            <input type="number" placeholder="25" min="1"
                                                value={profile.age}
                                                onChange={e => setProfile({ ...profile, age: e.target.value })} />
                                        </div>
                                        <div className={styles.inputGroup}>
                                            <label>{t('nationality')}</label>
                                            <input type="text" placeholder="e.g. United States"
                                                value={profile.nationality}
                                                onChange={e => setProfile({ ...profile, nationality: e.target.value })} />
                                        </div>
                                        <div className={styles.inputGroup}>
                                            <label>{t('phone')}</label>
                                            <input type="text" placeholder="+1 234 567 890"
                                                value={profile.phone_number}
                                                onChange={e => setProfile({ ...profile, phone_number: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <label>{t('address')}</label>
                                        <textarea rows="3" placeholder="123 Main St, New York, NY"
                                            value={profile.address}
                                            onChange={e => setProfile({ ...profile, address: e.target.value })} />
                                    </div>

                                    <div className={styles.kycBanner}>
                                        {profile.is_kyc_verified
                                            ? <span className={styles.kycOk}>{t('kyc_verified')}</span>
                                            : <span className={styles.kycPending}>{t('kyc_pending')}</span>}
                                    </div>

                                    {profileMsg.text && <div className={`${styles.msgBox} ${styles[profileMsg.type]}`}>{profileMsg.text}</div>}

                                    <button type="submit" className={styles.saveBtn} disabled={profileSaving}>
                                        {profileSaving ? `⏳ ${t('saving')}` : t('save_profile')}
                                    </button>
                                </form>
                            )}
                        </section>
                    )}

                    {/* ══ PURSE / WALLET TAB ═══════════════════════════════ */}
                    {activeTab === 'purse' && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2>💰 {t('purse_wallet_settings')}</h2>
                                <p>{t('purse_wallet_desc')}</p>
                            </div>

                            {/* Balance at a glance */}
                            <div className={styles.balanceGlance}>
                                <div className={styles.balGlanceItem}>
                                    <span>{t('available_balance')}</span>
                                    <strong className={styles.balGlanceValue}>{formatCurrency(walletBalance)}</strong>
                                </div>
                                <div className={styles.balGlanceDivider} />
                                <div className={styles.balGlanceItem}>
                                    <span>{t('spending_limit')}</span>
                                    <strong className={spendingLimit ? styles.limitOn : styles.limitOff}>
                                        {spendingLimit ? formatCurrency(spendingLimit) : t('not_set')}
                                    </strong>
                                </div>
                                <div className={styles.balGlanceDivider} />
                                <div className={styles.balGlanceItem}>
                                    <span>{t('payment_methods')}</span>
                                    <strong>{paymentMethods.length} {t('linked')}</strong>
                                </div>
                            </div>

                            {/* Spending limit form */}
                            <div className={styles.subsection}>
                                <h3 className={styles.subsectionTitle}>🛡️ {t('spending_limit')}</h3>
                                <p className={styles.subsectionHint}>
                                    {t('purse_hint')}
                                </p>
                                <form onSubmit={saveLimit} className={styles.limitForm}>
                                    <div className={styles.inputGroupRow}>
                                        <div className={styles.inputWithPrefix}>
                                            <span className={styles.prefix}>{currentCurrency.symbol}</span>
                                            <input
                                                type="number" step="0.01" placeholder="e.g. 5000.00"
                                                value={limitInput}
                                                onChange={e => setLimitInput(e.target.value)}
                                                disabled={limitSaving}
                                            />
                                        </div>
                                        <button type="submit" className={styles.saveBtn} disabled={limitSaving || !limitInput}>
                                            {limitSaving ? `⏳ ${t('saving')}` : t('set_limit')}
                                        </button>
                                        {spendingLimit && (
                                            <button type="button" className={styles.dangerBtn} onClick={removeLimit} disabled={limitSaving}>
                                                {t('remove_limit')}
                                            </button>
                                        )}
                                    </div>
                                </form>
                                {limitMsg.text && <div className={`${styles.msgBox} ${styles[limitMsg.type]}`}>{limitMsg.text}</div>}
                            </div>

                            {/* Linked Payment Methods */}
                            <div className={styles.subsection}>
                                <h3 className={styles.subsectionTitle}>💳 {t('payment_methods_linked')}</h3>
                                {paymentMethods.length === 0 ? (
                                    <div className={styles.emptyState}>
                                        {t('no_pm_settings')}
                                    </div>
                                ) : (
                                    <div className={styles.pmCards}>
                                        {paymentMethods.map(pm => (
                                            <div key={pm.id} className={styles.pmCard}>
                                                <span className={styles.pmCardIcon}>
                                                    {pm.method_type === 'UPI' ? '📲' : pm.method_type === 'BANK' ? '🏦' : '💳'}
                                                </span>
                                                <div className={styles.pmCardInfo}>
                                                    <strong>{pm.label}</strong>
                                                    <small>{pm.details}</small>
                                                </div>
                                                {pm.is_default && <span className={styles.defaultPill}>{t('default_label')}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* ══ LANGUAGE TAB ═════════════════════════════════════ */}
                    {activeTab === 'language' && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2>{t('language_title')}</h2>
                                <p>{t('language_hint')}</p>
                            </div>

                            <div className={styles.optionGrid}>
                                {LANGUAGES.map(lang => (
                                    <button
                                        key={lang.code}
                                        className={`${styles.optionCard} ${language === lang.code ? styles.optionSelected : ''}`}
                                        onClick={() => setLanguage(lang.code)}
                                    >
                                        <span className={styles.optionFlag}>{lang.flag}</span>
                                        <span className={styles.optionLabel}>{lang.label}</span>
                                        {language === lang.code && <span className={styles.optionCheckmark}>✔</span>}
                                    </button>
                                ))}
                            </div>

                            <div className={styles.currentSetting}>
                                {t('active_language')}: <strong>{currentLanguage.flag} {currentLanguage.label}</strong>
                                <span className={styles.pill}>{t('saved_pill')}</span>
                            </div>
                        </section>
                    )}

                    {/* ══ CURRENCY TAB ═════════════════════════════════════ */}
                    {activeTab === 'currency' && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2>{t('currency_title')}</h2>
                                <p>{t('currency_hint')}</p>
                            </div>

                            <div className={styles.optionGrid}>
                                {CURRENCIES.map(cur => (
                                    <button
                                        key={cur.code}
                                        className={`${styles.optionCard} ${currency === cur.code ? styles.optionSelected : ''}`}
                                        onClick={() => setCurrency(cur.code)}
                                    >
                                        <span className={styles.optionFlag}>{cur.flag}</span>
                                        <div className={styles.optionCurrencyInfo}>
                                            <span className={styles.optionSymbol}>{cur.symbol}</span>
                                            <div>
                                                <div className={styles.optionLabel}>{cur.code}</div>
                                                <div className={styles.optionSub}>{cur.label}</div>
                                            </div>
                                        </div>
                                        {currency === cur.code && <span className={styles.optionCheckmark}>✔</span>}
                                    </button>
                                ))}
                            </div>

                            {/* ── Live Rate Table ────────────────────────── */}
                            <div className={styles.ratesPanel}>
                                <div className={styles.ratesPanelHeader}>
                                    <span>
                                        {ratesLoading ? t('fetching_live_rates') : ratesError ? t('using_offline_rates') : `${t('live_rates_active')} · ${ratesDate}`}
                                    </span>
                                    <button
                                        className={styles.refreshRateBtn}
                                        onClick={refreshRates}
                                        disabled={ratesLoading}
                                        title={t('refresh_rates_title')}
                                    >
                                        {ratesLoading ? '⏳' : `↻ ${t('refresh_btn_text')}`}
                                    </button>
                                </div>

                                <div className={styles.ratesGrid}>
                                    {CURRENCIES.filter(c => c.code !== 'USD').map(cur => {
                                        const rate = rates[cur.code];
                                        return (
                                            <div
                                                key={cur.code}
                                                className={`${styles.rateRow} ${currency === cur.code ? styles.rateRowActive : ''}`}
                                                onClick={() => setCurrency(cur.code)}
                                            >
                                                <span className={styles.rateFlag}>{cur.flag}</span>
                                                <div className={styles.rateInfo}>
                                                    <span className={styles.rateCode}>{cur.code}</span>
                                                    <span className={styles.rateName}>{cur.label}</span>
                                                </div>
                                                <div className={styles.rateValue}>
                                                    <span className={styles.rateNum}>
                                                        {rate ? rate.toLocaleString('en-US', { minimumFractionDigits: cur.code === 'JPY' ? 2 : 4, maximumFractionDigits: cur.code === 'JPY' ? 2 : 4 }) : '—'}
                                                    </span>
                                                    <span className={styles.rateSym}>{cur.symbol}</span>
                                                </div>
                                                {currency === cur.code && <span className={styles.rateCheck}>✔</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className={styles.ratesNote}>💡 {t('rates_powered_by')}</p>
                            </div>

                            <div className={styles.currentSetting}>
                                {t('active_currency')}: <strong>{currentCurrency.flag} {currentCurrency.code} — {t('will_appear_as')} <code>{currentCurrency.symbol}{(1000 * (rates[currency] ?? 1)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code></strong>
                                <span className={styles.pill}>{t('saved_pill')}</span>
                            </div>
                        </section>
                    )}

                    {/* ══ APPEARANCE TAB ═══════════════════════════════════ */}
                    {activeTab === 'appearance' && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h2>{t('appearance_title')}</h2>
                                <p>{t('appearance_hint')}</p>
                            </div>

                            <div className={styles.subsection}>
                                <h3 className={styles.subsectionTitle}>{t('theme')}</h3>
                                <div className={styles.themeCards}>
                                    <button
                                        className={`${styles.themeCard} ${theme === 'dark' ? styles.themeSelected : ''}`}
                                        onClick={() => theme !== 'dark' && toggleTheme()}
                                    >
                                        <div className={styles.themePreview} data-t="dark">
                                            <div className={styles.previewSidebar} />
                                            <div className={styles.previewContent}>
                                                <div className={styles.previewBar} />
                                                <div className={styles.previewBar} style={{ width: '60%', opacity: 0.5 }} />
                                            </div>
                                        </div>
                                        <span>{t('dark_mode')}</span>
                                        {theme === 'dark' && <span className={styles.optionCheckmark}>✔</span>}
                                    </button>

                                    <button
                                        className={`${styles.themeCard} ${theme === 'light' ? styles.themeSelected : ''}`}
                                        onClick={() => theme !== 'light' && toggleTheme()}
                                    >
                                        <div className={styles.themePreview} data-t="light">
                                            <div className={styles.previewSidebar} style={{ background: '#e2e8f0' }} />
                                            <div className={styles.previewContent} style={{ background: '#f8fafc' }}>
                                                <div className={styles.previewBar} style={{ background: '#3b82f6' }} />
                                                <div className={styles.previewBar} style={{ width: '60%', background: '#cbd5e1' }} />
                                            </div>
                                        </div>
                                        <span>{t('light_mode')}</span>
                                        {theme === 'light' && <span className={styles.optionCheckmark}>✔</span>}
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                </main>
            </div>
        </Layout>
    );
}
