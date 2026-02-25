from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Watchlist, Order
from .serializers import WatchlistSerializer, OrderSerializer
from .services.market_service import MarketService
from .services.indicator_service import IndicatorService
from .services.ml_service import MLService
from .services.analytics_service import AnalyticsService
from portfolio.models import Portfolio, Transaction
from django.db import transaction

class TradingViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='live/(?P<symbol>[^/.]+)')
    def live_price(self, request, symbol=None):
        data = MarketService.get_live_data(symbol)
        if not data:
            return Response({"error": "Invalid symbol or data not available"}, status=400)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='news/(?P<symbol>[^/.]+)')
    def news(self, request, symbol=None):
        """Real-time news endpoint — yfinance + RSS, cached 3 min."""
        from django.core.cache import cache
        from .services.market_service import _parse_yf_news, _fetch_rss_news
        import yfinance as yf

        symbol = (symbol or '').upper()
        if not symbol:
            return Response({"error": "Symbol required"}, status=400)

        cache_key = f"news_{symbol}"
        cached = cache.get(cache_key)
        if cached:
            return Response({"symbol": symbol, "news": cached})

        try:
            ticker = yf.Ticker(symbol)
            yf_news = _parse_yf_news(ticker.news[:10] if ticker.news else [])
            rss_news = _fetch_rss_news(symbol, max_items=10)

            seen, merged = set(), []
            for article in (yf_news + rss_news):
                key = article.get('title', '')[:60].lower().strip()
                if key and key not in seen:
                    seen.add(key)
                    merged.append(article)
                if len(merged) >= 15:
                    break
            merged.sort(key=lambda x: x.get('providerPublishTime') or 0, reverse=True)

            cache.set(cache_key, merged, 180)  # 3 min cache
            return Response({"symbol": symbol, "news": merged})
        except Exception as e:
            return Response({"error": str(e)}, status=500)


    @action(detail=False, methods=['get'], url_path='history/(?P<symbol>[^/.]+)')
    def history(self, request, symbol=None):
        period = request.query_params.get('period', '1mo')
        data = MarketService.get_historical_data(symbol, period=period)
        if not data:
            return Response({"error": "Invalid symbol or data not available"}, status=400)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='chart/(?P<symbol>[^/.]+)')
    def chart_data(self, request, symbol=None):
        """Full chart data: OHLC + EMA(20) + RSI(14) + Volume + Fundamentals."""
        period = request.query_params.get('period', '3mo')
        data = MarketService.get_ohlc_with_indicators(symbol, period=period)
        if not data:
            return Response({"error": "Invalid symbol or chart data not available"}, status=400)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='sparkline/(?P<symbol>[^/.]+)')
    def sparkline(self, request, symbol=None):
        """Simple close-price time series for sparkline charts."""
        period = request.query_params.get('period', '1mo')
        prices = MarketService.get_sparkline(symbol, period=period)
        if not prices:
            return Response({"error": "No data"}, status=400)
        return Response({"symbol": symbol.upper(), "prices": prices})

    @action(detail=False, methods=['get'], url_path='indicators/(?P<symbol>[^/.]+)')
    def indicators(self, request, symbol=None):
        data = IndicatorService.calculate_indicators(symbol)
        if not data:
            return Response({"error": "Could not calculate indicators"}, status=400)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='predict/(?P<symbol>[^/.]+)')
    def predict(self, request, symbol=None):
        data = MLService.predict_trend(symbol)
        if not data:
            return Response({"error": "Prediction failed"}, status=400)
        return Response(data)

    @action(detail=False, methods=['get'])
    def performance(self, request):
        data = AnalyticsService.get_performance_analytics(request.user)
        return Response(data)

    @action(detail=False, methods=['post'])
    def order(self, request):
        symbol = request.data.get('symbol', '').upper()
        order_type = request.data.get('type', '').upper()
        quantity = int(request.data.get('quantity', 0))
        
        if not symbol or order_type not in ['BUY', 'SELL'] or quantity <= 0:
            return Response({"error": "Invalid order details"}, status=400)

        live_data = MarketService.get_live_data(symbol)
        if not live_data:
            return Response({"error": "Could not fetch live price"}, status=400)
            
        price = live_data['price']

        with transaction.atomic():
            # Create Order record
            order = Order.objects.create(
                user=request.user,
                symbol=symbol,
                order_type=order_type,
                quantity=quantity,
                price=price,
                status='COMPLETED' # Instant execution for now
            )

            # Update Portfolio & Transactions
            if order_type == 'BUY':
                portfolio_item, _ = Portfolio.objects.get_or_create(user=request.user, stock_symbol=symbol)
                total_cost = (portfolio_item.quantity * portfolio_item.average_buy_price) + (quantity * price)
                portfolio_item.quantity += quantity
                portfolio_item.average_buy_price = total_cost / portfolio_item.quantity
                portfolio_item.save()
            else:
                try:
                    portfolio_item = Portfolio.objects.get(user=request.user, stock_symbol=symbol)
                    if portfolio_item.quantity < quantity:
                        order.status = 'FAILED'
                        order.save()
                        return Response({"error": "Insufficient quantity"}, status=400)
                    portfolio_item.quantity -= quantity
                    portfolio_item.save()
                except Portfolio.DoesNotExist:
                    order.status = 'FAILED'
                    order.save()
                    return Response({"error": "Stock not in portfolio"}, status=400)

            Transaction.objects.create(
                user=request.user,
                stock_symbol=symbol,
                transaction_type=order_type,
                quantity=quantity,
                price=price
            )

        return Response({
            "status": "Order Executed Successfully",
            "order_id": order.id,
            "executed_price": price
        })

class WatchlistViewSet(viewsets.ModelViewSet):
    serializer_class = WatchlistSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Watchlist.objects.none()
        return Watchlist.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['delete'], url_path='remove/(?P<symbol>[^/.]+)')
    def remove(self, request, symbol=None):
        try:
            item = Watchlist.objects.get(user=request.user, symbol=symbol.upper())
            item.delete()
            return Response({"status": "Removed from watchlist"}, status=status.HTTP_204_NO_CONTENT)
        except Watchlist.DoesNotExist:
            return Response({"error": "Symbol not in watchlist"}, status=status.HTTP_404_NOT_FOUND)
