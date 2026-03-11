import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { useSettings } from '../context/SettingsContext';
import styles from './Profile.module.css';

export default function Profile() {
    const { t } = useSettings();
    const [profile, setProfile] = useState({
        full_name: '',
        address: '',
        nationality: '',
        age: '',
        phone_number: '',
        is_kyc_verified: false
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        api.get('/users/profile/')
            .then(res => {
                setProfile(res.data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMsg('');

        // Clean up data
        const data = {
            ...profile,
            age: profile.age === '' ? null : profile.age
        };

        try {
            await api.patch('/users/profile/', data);
            setMsg(t('profile_saved'));
            setTimeout(() => setMsg(''), 4000);
        } catch (err) {
            const errorMsg = err.response?.data ?
                Object.values(err.response.data).flat().join(' ') :
                'Network error. Please ensure the backend is running.';
            setMsg(`❌ ${t('error_label')}: ${errorMsg}`);
        }
        setSaving(false);
    };

    if (loading) return <Layout><div className={styles.loader}>{t('loading')}...</div></Layout>;

    return (
        <Layout pageTitle={t('customer_details')}>
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.header}>
                        <h2>{t('customer_details')}</h2>
                        <p>{t('customer_hint')}</p>
                    </div>

                    <form className={styles.form} onSubmit={handleSave}>
                        <div className={styles.grid}>
                            <div className={styles.inputGroup}>
                                <label>{t('full_name')}</label>
                                <input
                                    type="text"
                                    value={profile.full_name}
                                    onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>{t('age_limit_hint')}</label>
                                <input
                                    type="number"
                                    value={profile.age}
                                    onChange={e => setProfile({ ...profile, age: e.target.value })}
                                    placeholder="25"
                                    min="1"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>{t('nationality')}</label>
                                <input
                                    type="text"
                                    value={profile.nationality}
                                    onChange={e => setProfile({ ...profile, nationality: e.target.value })}
                                    placeholder="United States"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>{t('phone')}</label>
                                <input
                                    type="text"
                                    value={profile.phone_number}
                                    onChange={e => setProfile({ ...profile, phone_number: e.target.value })}
                                    placeholder="+1 234 567 890"
                                />
                            </div>
                        </div>

                        <div className={styles.inputGroup}>
                            <label>{t('address')}</label>
                            <textarea
                                value={profile.address}
                                onChange={e => setProfile({ ...profile, address: e.target.value })}
                                placeholder="123 Trading St, Wall Street, NY"
                                rows="3"
                            />
                        </div>

                        {msg && <div className={styles.message}>{msg}</div>}

                        <div className={styles.footer}>
                            <div className={styles.kycStatus}>
                                {profile.is_kyc_verified ? (
                                    <span className={styles.verified}>{t('kyc_verified')}</span>
                                ) : (
                                    <span className={styles.pending}>{t('kyc_pending')}</span>
                                )}
                            </div>
                            <button type="submit" className={styles.saveBtn} disabled={saving}>
                                {saving ? t('saving') : t('save_changes')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Layout>
    );
}
