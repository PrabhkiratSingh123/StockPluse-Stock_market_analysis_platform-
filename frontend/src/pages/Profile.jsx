import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import styles from './Profile.module.css';

export default function Profile() {
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
            setMsg('✅ Profile updated successfully!');
            setTimeout(() => setMsg(''), 4000);
        } catch (err) {
            const errorMsg = err.response?.data ?
                Object.values(err.response.data).flat().join(' ') :
                'Network error. Please ensure the backend is running.';
            setMsg(`❌ Error: ${errorMsg}`);
        }
        setSaving(false);
    };

    if (loading) return <Layout><div className={styles.loader}>Loading Profile...</div></Layout>;

    return (
        <Layout pageTitle="Customer Profile">
            <div className={styles.container}>
                <div className={styles.card}>
                    <div className={styles.header}>
                        <h2>📝 Customer Details</h2>
                        <p>Complete your profile to unlock full trading limits.</p>
                    </div>

                    <form className={styles.form} onSubmit={handleSave}>
                        <div className={styles.grid}>
                            <div className={styles.inputGroup}>
                                <label>Full Legal Name</label>
                                <input
                                    type="text"
                                    value={profile.full_name}
                                    onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                                    placeholder="John Doe"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Age (Limit: 18+ for trading)</label>
                                <input
                                    type="number"
                                    value={profile.age}
                                    onChange={e => setProfile({ ...profile, age: e.target.value })}
                                    placeholder="25"
                                    min="1"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Nationality</label>
                                <input
                                    type="text"
                                    value={profile.nationality}
                                    onChange={e => setProfile({ ...profile, nationality: e.target.value })}
                                    placeholder="United States"
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Phone Number</label>
                                <input
                                    type="text"
                                    value={profile.phone_number}
                                    onChange={e => setProfile({ ...profile, phone_number: e.target.value })}
                                    placeholder="+1 234 567 890"
                                />
                            </div>
                        </div>

                        <div className={styles.inputGroup}>
                            <label>Residential Address</label>
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
                                    <span className={styles.verified}>✅ KYC Verified</span>
                                ) : (
                                    <span className={styles.pending}>⚠️ KYC Verification Pending</span>
                                )}
                            </div>
                            <button type="submit" className={styles.saveBtn} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Layout>
    );
}
