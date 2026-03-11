import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import T from '../i18n/translations';

const SettingsContext = createContext(null);

// ── Supported options ────────────────────────────────────────────────────────
export const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
    { code: 'es', label: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', label: 'French', flag: '🇫🇷' },
    { code: 'de', label: 'German', flag: '🇩🇪' },
    { code: 'zh', label: 'Chinese', flag: '🇨🇳' },
    { code: 'ja', label: 'Japanese', flag: '🇯🇵' },
    { code: 'ar', label: 'Arabic', flag: '🇸🇦' },
];

export const CURRENCIES = [
    { code: 'USD', symbol: '$', label: 'US Dollar', flag: '🇺🇸' },
    { code: 'INR', symbol: '₹', label: 'Indian Rupee', flag: '🇮🇳' },
    { code: 'EUR', symbol: '€', label: 'Euro', flag: '🇪🇺' },
    { code: 'GBP', symbol: '£', label: 'British Pound', flag: '🇬🇧' },
    { code: 'JPY', symbol: '¥', label: 'Japanese Yen', flag: '🇯🇵' },
    { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham', flag: '🇦🇪' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar', flag: '🇸🇬' },
    { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar', flag: '🇨🇦' },
];

// RTL language codes
const RTL_LANGS = ['ar'];

// ── Fallback static rates (USD base) — used only if API fails ────────────────
const FALLBACK_RATES = {
    USD: 1,
    INR: 83.5,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 149.5,
    AED: 3.67,   // AED is pegged to USD
    SGD: 1.34,
    CAD: 1.36,
};

const RATES_CACHE_KEY = 'sp_exchange_rates';
const RATES_TS_KEY = 'sp_exchange_rates_ts';
const CACHE_TTL_MS = 30 * 60 * 1000;   // 30 minutes

export function SettingsProvider({ children }) {
    const [language, setLanguageState] = useState(
        () => localStorage.getItem('sp_language') || 'en'
    );
    const [currency, setCurrencyState] = useState(
        () => localStorage.getItem('sp_currency') || 'USD'
    );

    // Exchange rates — keyed by currency code, relative to 1 USD
    const [rates, setRates] = useState(FALLBACK_RATES);
    const [ratesLoading, setRatesLoading] = useState(true);
    const [ratesError, setRatesError] = useState(false);
    const [ratesDate, setRatesDate] = useState('');
    const intervalRef = useRef(null);

    // ── Fetch live rates from Frankfurter (free, no API key) ────────────────
    const fetchRates = useCallback(async (force = false) => {
        // Check cache first
        if (!force) {
            const cachedTs = localStorage.getItem(RATES_TS_KEY);
            const cachedRates = localStorage.getItem(RATES_CACHE_KEY);
            if (cachedTs && cachedRates && (Date.now() - Number(cachedTs)) < CACHE_TTL_MS) {
                const parsed = JSON.parse(cachedRates);
                setRates(parsed.rates);
                setRatesDate(parsed.date || '');
                setRatesLoading(false);
                return;
            }
        }

        try {
            setRatesLoading(true);
            setRatesError(false);
            // Frankfurter supports: EUR, GBP, INR, JPY, SGD, CAD but NOT AED
            const res = await fetch(
                'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,INR,JPY,SGD,CAD'
            );
            if (!res.ok) throw new Error('API error');
            const data = await res.json();

            const liveRates = {
                USD: 1,
                ...data.rates,
                // AED is pegged — use precise official rate
                AED: 3.6725,
            };

            setRates(liveRates);
            setRatesDate(data.date || '');

            // Cache for 30 minutes
            localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates: liveRates, date: data.date }));
            localStorage.setItem(RATES_TS_KEY, String(Date.now()));
        } catch (err) {
            console.warn('[SettingsContext] Rate fetch failed, using fallback rates.', err);
            setRatesError(true);
            // Try to use stale cache before fallback
            const staleCache = localStorage.getItem(RATES_CACHE_KEY);
            if (staleCache) {
                const parsed = JSON.parse(staleCache);
                setRates(parsed.rates);
                setRatesDate(parsed.date || '');
            } else {
                setRates(FALLBACK_RATES);
            }
        } finally {
            setRatesLoading(false);
        }
    }, []);

    // Fetch on mount + auto-refresh every 30 min
    useEffect(() => {
        fetchRates();
        intervalRef.current = setInterval(() => fetchRates(true), CACHE_TTL_MS);
        return () => clearInterval(intervalRef.current);
    }, [fetchRates]);

    // ── Persist & apply language ─────────────────────────────────────────────
    const setLanguage = useCallback((code) => {
        setLanguageState(code);
        localStorage.setItem('sp_language', code);
        document.documentElement.setAttribute('dir', RTL_LANGS.includes(code) ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', code);
    }, []);

    const setCurrency = useCallback((code) => {
        setCurrencyState(code);
        localStorage.setItem('sp_currency', code);
    }, []);

    // Apply RTL/lang on first render
    useEffect(() => {
        document.documentElement.setAttribute('dir', RTL_LANGS.includes(language) ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', language);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived helpers ──────────────────────────────────────────────────────
    const currentLanguage = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
    const currentCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];

    /**
     * Convert a USD amount to the selected currency using live rates.
     * All backend values are in USD.
     */
    const convertFromUSD = useCallback((usdAmount) => {
        const rate = rates[currency] ?? 1;
        return Number(usdAmount) * rate;
    }, [rates, currency]);

    /**
     * Translate a key. Supports template variables: t('key', { var: val })
     * Falls back to English if key not found in current language.
     */
    const t = useCallback((key, vars = {}) => {
        const dict = T[language] || T['en'];
        let str = dict[key] ?? T['en'][key] ?? key;
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replaceAll(`{${k}}`, v);
        });
        return str;
    }, [language]);

    /**
     * Format a USD amount in the selected currency with conversion.
     * e.g. formatCurrency(100) → "₹8,350.00"  (if INR selected)
     */
    const formatCurrency = useCallback((usdAmount) => {
        const sym = currentCurrency.symbol;
        const converted = convertFromUSD(usdAmount);

        // JPY has no decimal places
        const decimals = currency === 'JPY' ? 0 : 2;
        const formatted = converted.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
        return `${sym}${formatted}`;
    }, [currentCurrency, convertFromUSD, currency]);

    /**
     * Compact currency format for large numbers.
     * e.g. formatCurrencyCompact(1500000) → "₹12.52Cr" or "$1.50M"
     */
    const formatCurrencyCompact = useCallback((usdAmount) => {
        if (!usdAmount) return '—';
        const sym = currentCurrency.symbol;
        const n = convertFromUSD(usdAmount);

        // Indian number system for INR
        if (currency === 'INR') {
            if (n >= 1e7) return `${sym}${(n / 1e7).toFixed(2)}Cr`;
            if (n >= 1e5) return `${sym}${(n / 1e5).toFixed(2)}L`;
        }
        if (n >= 1e12) return `${sym}${(n / 1e12).toFixed(2)}T`;
        if (n >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
        return formatCurrency(usdAmount);
    }, [currentCurrency, convertFromUSD, currency, formatCurrency]);

    /**
     * Get the exchange rate for the current currency (from USD).
     */
    const getRate = useCallback((code = currency) => rates[code] ?? 1, [rates, currency]);

    return (
        <SettingsContext.Provider value={{
            // Language
            language, setLanguage, currentLanguage,
            // Currency
            currency, setCurrency, currentCurrency,
            // Exchange rates
            rates, ratesLoading, ratesError, ratesDate,
            getRate, convertFromUSD,
            // Helpers
            t, formatCurrency, formatCurrencyCompact,
            // Config arrays
            LANGUAGES, CURRENCIES,
            // Refresh rates manually
            refreshRates: () => fetchRates(true),
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export const useSettings = () => useContext(SettingsContext);
