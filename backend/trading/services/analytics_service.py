from portfolio.models import Portfolio
from .market_service import MarketService

class AnalyticsService:
    @staticmethod
    def get_performance_analytics(user):
        holdings = Portfolio.objects.filter(user=user)
        
        if not holdings.exists():
            return {"message": "No portfolio data found"}

        best_stock = None
        worst_stock = None
        total_p_l = 0
        total_investment = 0
        
        stock_performances = []
        
        for item in holdings:
            live_data = MarketService.get_live_data(item.stock_symbol)
            if not live_data:
                continue
                
            current_price = live_data['price']
            investment = item.quantity * item.average_buy_price
            current_value = item.quantity * current_price
            p_l = current_value - investment
            p_l_pct = (p_l / investment * 100) if investment > 0 else 0
            
            perf = {
                "symbol": item.stock_symbol,
                "p_l": round(p_l, 2),
                "p_l_pct": round(p_l_pct, 2)
            }
            stock_performances.append(perf)
            
            total_p_l += p_l
            total_investment += investment
            
            if not best_stock or p_l_pct > best_stock['p_l_pct']:
                best_stock = perf
            if not worst_stock or p_l_pct < worst_stock['p_l_pct']:
                worst_stock = perf
        
        return {
            "total_net_gain": round(total_p_l, 2),
            "total_net_gain_pct": round((total_p_l / total_investment * 100), 2) if total_investment > 0 else 0,
            "best_performing": best_stock,
            "worst_performing": worst_stock,
            "volatility": "Medium", # Mock constant or calculated from hist data
            "diversification_count": holdings.count()
        }
