import { createContext, useContext, useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';
import { useLocation } from 'react-router-dom';
import { useTheme } from './ThemeContext';

const TourContext = createContext();

const TOUR_STEPS = {
    '/dashboard': [
        { target: '[data-tour="dash-stats"]', content: 'These cards give you a quick summary of your total investments and P&L.', disableBeacon: true },
        { target: '[data-tour="dash-performance"]', content: 'Track your overall portfolio performance over time here.' },
        { target: '[data-tour="dash-allocation"]', content: 'See how your investments are distributed across different assets.' },
        { target: '[data-tour="dash-holdings"]', content: 'View a breakdown of your current holdings and live prices.' },
        { target: '[data-tour="dash-sentiment"]', content: 'Keep an eye on recent market transactions and the Fear & Greed index.' },
    ],
    '/portfolio': [
        { target: '[data-tour="total-invested"]', content: 'This shows the total amount of money you have invested.', disableBeacon: true },
        { target: '[data-tour="current-value"]', content: 'Here you can see the real-time value of your entire portfolio.' },
        { target: '[data-tour="total-pl"]', content: 'Your overall Profit and Loss. See if your investments are up or down.' },
        { target: '[data-tour="performance-chart"]', content: 'Analyze historical performance and AI price predictions using our interactive charts.' },
        { target: '[data-tour="asset-allocation"]', content: 'Understand how your portfolio is diversified across different assets.' },
        { target: '[data-tour="buy-sell"]', content: 'Quickly execute buy or sell orders directly from this dashboard.' },
        { target: '[data-tour="transactions-section"]', content: 'Keep track of all your detailed holdings and recent transactions here.' },
    ],
    '/market': [
        { target: '[data-tour="market-search"]', content: 'Search for any stock symbol to get detailed analysis.', disableBeacon: true },
        { target: '[data-tour="market-chart"]', content: 'Analyze the stock with interactive candlestick charts and technical indicators.' },
        { target: '[data-tour="market-stats"]', content: 'Review key statistics, AI predictions, and analyst consensus.' },
        { target: '[data-tour="market-trade"]', content: 'Execute live trades right from the market view.' }
    ],
    '/watchlist': [
        { target: '[data-tour="watch-sidebar"]', content: 'Your saved stocks are listed here for quick access.', disableBeacon: true },
        { target: '[data-tour="watch-add"]', content: 'Add new symbols to keep an eye on their performance.' },
        { target: '[data-tour="watch-main"]', content: 'Deep dive into company fundamentals, news, and expert talks.' }
    ],
    '/transactions': [
        { target: '[data-tour="tx-table"]', content: 'Review your complete history of buy and sell orders.', disableBeacon: true },
        { target: '[data-tour="tx-pagination"]', content: 'Navigate through your older transaction records.' }
    ]
};

export function TourProvider({ children }) {
    const [run, setRun] = useState(false);
    const location = useLocation();
    const { theme } = useTheme();

    const currentPath = location.pathname;
    const currentSteps = TOUR_STEPS[currentPath] || [];

    // Reset run state if route changes
    useEffect(() => {
        setRun(false);
    }, [currentPath]);

    const startTour = () => {
        if (currentSteps.length > 0) {
            setRun(true);
        }
    };

    const markPageReady = () => {
        // Only auto-launch if we have steps for the current page and they haven't seen ANY tour yet
        const hasSeenTour = localStorage.getItem('hasSeenGlobalTour');
        if (!hasSeenTour && currentSteps.length > 0) {
            setTimeout(() => setRun(true), 600);
        }
    };

    const handleJoyrideCallback = (data) => {
        const { status } = data;
        const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

        if (finishedStatuses.includes(status)) {
            setRun(false);
            localStorage.setItem('hasSeenGlobalTour', 'true');
        }
    };

    const tooltipStyles = {
        options: {
            arrowColor: theme === 'dark' ? '#1e293b' : '#ffffff',
            backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
            primaryColor: '#3b82f6',
            textColor: theme === 'dark' ? '#f1f5f9' : '#0f172a',
            overlayColor: 'rgba(0, 0, 0, 0.65)',
            zIndex: 10000,
        },
    };

    return (
        <TourContext.Provider value={{ startTour, markPageReady, hasSteps: currentSteps.length > 0 }}>
            {currentSteps.length > 0 && (
                <Joyride
                    key={currentPath} // force re-render on route change
                    steps={currentSteps}
                    run={run}
                    continuous={true}
                    showSkipButton={true}
                    showProgress={true}
                    callback={handleJoyrideCallback}
                    styles={tooltipStyles}
                    scrollToFirstStep={true}
                />
            )}
            {children}
        </TourContext.Provider>
    );
}

export function useTour() {
    return useContext(TourContext);
}
