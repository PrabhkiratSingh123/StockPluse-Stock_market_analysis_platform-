import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTour } from '../context/TourContext';
import styles from './Layout.module.css';

const NAV_ITEMS = [
    { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { to: '/market', icon: '📈', label: 'Market' },
    { to: '/portfolio', icon: '💼', label: 'Portfolio' },
    { to: '/watchlist', icon: '👁️', label: 'Watchlist' },
    { to: '/transactions', icon: '📋', label: 'Transactions' },
];

export default function Layout({ children, pageTitle }) {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { startTour, hasSteps } = useTour();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div className={styles.app}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <span className={styles.logoIcon}><img src="market-markets.gif" alt="" /></span>
                    <span className={styles.logoText}>StockPulse</span>
                </div>
                <nav className={styles.nav}>
                    {NAV_ITEMS.map(({ to, icon, label }) => (
                        <NavLink
                            key={to} to={to}
                            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
                        >
                            <span className={styles.navIcon}>{icon}</span>
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className={styles.sidebarFooter}>
                    <div className={styles.userInfo}>
                        <div className={styles.userAvatar}>{user?.username?.[0]?.toUpperCase() || 'U'}</div>
                        <span className={styles.userName}>{user?.username || 'User'}</span>
                    </div>
                    <button className={styles.logoutBtn} onClick={handleLogout} title="Logout">⏻</button>
                </div>
            </aside>

            {/* Main */}
            <main className={styles.main}>
                <div className={styles.topbar}>
                    <h2 className={styles.pageTitle}>{pageTitle}</h2>
                    <div className={styles.topbarRight}>
                        <div className={styles.liveIndicator}>
                            <span className={styles.pulseDot} />
                            Live
                        </div>
                        {hasSteps && (
                            <button className={styles.tourBtn} onClick={startTour} title="Start Product Tour">
                                ℹ️ Tour
                            </button>
                        )}
                        <button className={styles.themeToggleBtn} onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>
                        <span className={styles.topbarUser}>Welcome, {user?.username}</span>
                    </div>
                </div>
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
