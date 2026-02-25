import { useState } from 'react';
import styles from './StockLogo.module.css';

// Color palette mapped to letters for consistent fallback avatars
const LETTER_COLORS = {
    A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444', E: '#8b5cf6',
    F: '#ec4899', G: '#06b6d4', H: '#14b8a6', I: '#f97316', J: '#6366f1',
    K: '#84cc16', L: '#e11d48', M: '#0ea5e9', N: '#d946ef', O: '#22c55e',
    P: '#a855f7', Q: '#64748b', R: '#f43f5e', S: '#2563eb', T: '#059669',
    U: '#7c3aed', V: '#db2777', W: '#0284c7', X: '#c026d3', Y: '#65a30d',
    Z: '#475569',
};

/**
 * Reusable StockLogo component
 * 
 * @param {string} symbol - Stock ticker (e.g. "AAPL")
 * @param {string} logoUrl - URL to the company logo image
 * @param {string} name - Company name (used for fallback letter)
 * @param {number} size - Size in px (default 32)
 * @param {string} className - Additional CSS class
 */
export default function StockLogo({ symbol = '', logoUrl = '', name = '', size = 32, className = '' }) {
    const [imgError, setImgError] = useState(false);

    const letter = (name?.[0] || symbol?.[0] || '?').toUpperCase();
    const bgColor = LETTER_COLORS[letter] || '#64748b';
    const showImage = logoUrl && !imgError;

    return (
        <div
            className={`${styles.logoWrap} ${className}`}
            style={{
                width: size,
                height: size,
                minWidth: size,
                borderRadius: size * 0.3,
                backgroundColor: showImage ? 'rgba(255,255,255,0.08)' : bgColor,
            }}
            title={name || symbol}
        >
            {showImage ? (
                <img
                    src={logoUrl}
                    alt={`${symbol} logo`}
                    className={styles.logoImg}
                    style={{ width: size - 6, height: size - 6 }}
                    onError={() => setImgError(true)}
                    loading="lazy"
                />
            ) : (
                <span
                    className={styles.fallbackLetter}
                    style={{ fontSize: size * 0.42, lineHeight: `${size}px` }}
                >
                    {letter}
                </span>
            )}
        </div>
    );
}
