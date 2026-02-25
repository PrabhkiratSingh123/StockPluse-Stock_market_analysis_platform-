import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import styles from './Auth.module.css';
import api from '../api/axios';

export default function Auth() {
    const [mode, setMode] = useState('login'); // 'login' or 'register'
    const [loginState, setLoginState] = useState('login'); // 'login', 'forgot_request', 'forgot_confirm'

    // Form states
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    const [regUsername, setRegUsername] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regPassword, setRegPassword] = useState('');

    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotNewPassword, setForgotNewPassword] = useState('');

    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register } = useAuth();
    const navigate = useNavigate();

    const clearMessages = () => { setError(''); setSuccessMsg(''); };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        clearMessages(); setLoading(true);
        try {
            await login(loginUsername, loginPassword);
            navigate('/dashboard');
        } catch (err) {
            const d = err.response?.data;
            setError(d?.detail || d?.username?.[0] || d?.password?.[0] || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        clearMessages(); setLoading(true);
        try {
            if (!regUsername || !regEmail || !regPassword) { setError('All fields are required.'); return; }
            await register(regUsername, regEmail, regPassword);
            await login(regUsername, regPassword);
            navigate('/dashboard');
        } catch (err) {
            const d = err.response?.data;
            setError(d?.detail || d?.username?.[0] || d?.email?.[0] || d?.password?.[0] || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotRequestSubmit = async (e) => {
        e.preventDefault();
        clearMessages(); setLoading(true);
        try {
            await api.post('/users/password-reset/request/', { email: forgotEmail });
            setLoginState('forgot_confirm');
            setSuccessMsg('If an account exists, an OTP was sent to your email.');
        } catch (err) {
            const d = err.response?.data;
            setError(d?.detail || 'Failed to request OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotConfirmSubmit = async (e) => {
        e.preventDefault();
        clearMessages(); setLoading(true);
        try {
            await api.post('/users/password-reset/confirm/', {
                email: forgotEmail,
                otp: forgotOtp,
                new_password: forgotNewPassword
            });
            setLoginState('login');
            setSuccessMsg('Password successfully reset! Please sign in.');
            setForgotOtp('');
            setForgotNewPassword('');
        } catch (err) {
            const d = err.response?.data;
            setError(d?.detail || 'Failed to reset password. Check OTP.');
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = (newMode) => {
        setMode(newMode);
        setLoginState('login');
        clearMessages();
    };

    return (
        <div className={styles.authBg}>
            <div className={`${styles.container} ${mode === 'register' ? styles.active : ''}`}>

                {/* Sign Up Form */}
                <div className={`${styles.formContainer} ${styles.signUp}`}>
                    <form onSubmit={handleRegisterSubmit} className={styles.form}>
                        <div className={styles.logo}>
                            <span className={styles.logoIcon}><img src="peg.gif" alt="" /></span>
                            <span className={styles.logoText}>StockPulse</span>
                        </div>
                        <h1 className={styles.title}>Create Account</h1>
                        {error && mode === 'register' && <div className={styles.error}>{error}</div>}
                        <input type="text" value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="Username" required />
                        <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="Email" required />
                        <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Password" required />
                        <button type="submit" className={styles.btnPrimary} disabled={loading}>
                            {loading ? '⏳...' : 'Sign Up'}
                        </button>
                    </form>
                </div>

                {/* Sign In / Forgot Password Forms */}
                <div className={`${styles.formContainer} ${styles.signIn}`}>
                    {loginState === 'login' && (
                        <form onSubmit={handleLoginSubmit} className={styles.form}>
                            <div className={styles.logo}>
                                <span className={styles.logoIcon}><img src="analysis-rsi.gif" alt="" /></span>
                                <span className={styles.logoText}>StockPulse</span>
                            </div>
                            <h1 className={styles.title}>Sign In</h1>
                            {successMsg && mode === 'login' && <div className={styles.success}>{successMsg}</div>}
                            {error && mode === 'login' && <div className={styles.error}>{error}</div>}
                            <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} placeholder="Username" required />
                            <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Password" required />
                            <a href="#" className={styles.forgotPass} onClick={(e) => { e.preventDefault(); setLoginState('forgot_request'); clearMessages(); }}>Forget Your Password?</a>
                            <button type="submit" className={styles.btnPrimary} disabled={loading}>
                                {loading ? '⏳...' : 'Sign In'}
                            </button>
                        </form>
                    )}

                    {loginState === 'forgot_request' && (
                        <form onSubmit={handleForgotRequestSubmit} className={styles.form}>
                            <h1 className={styles.title}>Reset Password</h1>
                            <p className={styles.subtitle} style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', marginBottom: '10px' }}>Enter your registered email below to receive an OTP.</p>
                            {error && mode === 'login' && <div className={styles.error}>{error}</div>}
                            <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="Email" required />
                            <button type="submit" className={styles.btnPrimary} disabled={loading}>
                                {loading ? '⏳...' : 'Send OTP'}
                            </button>
                            <a href="#" className={styles.forgotPass} onClick={(e) => { e.preventDefault(); setLoginState('login'); clearMessages(); }}>Back to Sign In</a>
                        </form>
                    )}

                    {loginState === 'forgot_confirm' && (
                        <form onSubmit={handleForgotConfirmSubmit} className={styles.form}>
                            <h1 className={styles.title}>Enter OTP</h1>
                            {successMsg && mode === 'login' && <div className={styles.success}>{successMsg}</div>}
                            {error && mode === 'login' && <div className={styles.error}>{error}</div>}
                            <input type="text" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} placeholder="6-digit OTP" required />
                            <input type="password" value={forgotNewPassword} onChange={e => setForgotNewPassword(e.target.value)} placeholder="New Password" required />
                            <button type="submit" className={styles.btnPrimary} disabled={loading}>
                                {loading ? '⏳...' : 'Reset Password'}
                            </button>
                            <a href="#" className={styles.forgotPass} onClick={(e) => { e.preventDefault(); setLoginState('login'); clearMessages(); }}>Back to Sign In</a>
                        </form>
                    )}
                </div>

                {/* Sliding Toggle Overlay */}
                <div className={styles.toggleContainer}>
                    <div className={styles.toggle}>
                        <div className={`${styles.togglePanel} ${styles.toggleLeft}`}>
                            <h1 className={styles.title}>Welcome Back!</h1>
                            <p>Enter your personal details to use all of site features</p>
                            <button type="button" className={`${styles.btnPrimary} ${styles.hidden}`} onClick={() => toggleMode('login')}>
                                Sign In
                            </button>
                        </div>
                        <div className={`${styles.togglePanel} ${styles.toggleRight}`}>
                            <h1 className={styles.title}>Hello, Friend!</h1>
                            <p>Register with your personal details to use all of site features</p>
                            <button type="button" className={`${styles.btnPrimary} ${styles.hidden}`} onClick={() => toggleMode('register')}>
                                Sign Up
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
