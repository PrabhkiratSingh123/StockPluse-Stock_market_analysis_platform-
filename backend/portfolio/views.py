from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Portfolio, Transaction
from .serializers import PortfolioSerializer, TransactionSerializer
from trading.services import get_live_price
from trading.services.market_service import MarketService
from django.db import transaction
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth import get_user_model

User = get_user_model()

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

class PortfolioViewSet(viewsets.ModelViewSet):
    serializer_class = PortfolioSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Portfolio.objects.none()
        
        user = self.request.user
        if user.is_anonymous:
            return Portfolio.objects.none()
            
        queryset = Portfolio.objects.filter(user=user)
        
        # Filtering by stock_symbol
        symbol = self.request.query_params.get('symbol')
        if symbol:
            queryset = queryset.filter(stock_symbol__iexact=symbol)
            
        return queryset

    @action(detail=False, methods=['post'])
    def buy(self, request):
        symbol = request.data.get('symbol', '').upper()
        quantity = int(request.data.get('quantity', 0))
        price = float(request.data.get('price', 0) or get_live_price(symbol) or 0)

        if not symbol or quantity <= 0 or price <= 0:
            return Response({"error": "Invalid symbol, quantity or price"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            portfolio_item, created = Portfolio.objects.get_or_create(
                user=request.user, 
                stock_symbol=symbol
            )
            
            # Update average buy price
            total_cost = (portfolio_item.quantity * portfolio_item.average_buy_price) + (quantity * price)
            portfolio_item.quantity += quantity
            portfolio_item.average_buy_price = total_cost / portfolio_item.quantity
            portfolio_item.save()

            Transaction.objects.create(
                user=request.user,
                stock_symbol=symbol,
                transaction_type='BUY',
                quantity=quantity,
                price=price
            )

        return Response(PortfolioSerializer(portfolio_item).data)

    @action(detail=False, methods=['post'])
    def sell(self, request):
        symbol = request.data.get('symbol', '').upper()
        quantity = int(request.data.get('quantity', 0))
        price = float(request.data.get('price', 0) or get_live_price(symbol) or 0)

        if not symbol or quantity <= 0 or price <= 0:
            return Response({"error": "Invalid symbol, quantity or price"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            portfolio_item = Portfolio.objects.get(user=request.user, stock_symbol=symbol)
            if portfolio_item.quantity < quantity:
                return Response({"error": "Insufficient quantity"}, status=status.HTTP_400_BAD_REQUEST)

            with transaction.atomic():
                portfolio_item.quantity -= quantity
                if portfolio_item.quantity == 0:
                    portfolio_item.average_buy_price = 0
                portfolio_item.save()

                Transaction.objects.create(
                    user=request.user,
                    stock_symbol=symbol,
                    transaction_type='SELL',
                    quantity=quantity,
                    price=price
                )
            
            return Response(PortfolioSerializer(portfolio_item).data)
        except Portfolio.DoesNotExist:
            return Response({"error": "Stock not in portfolio"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def transactions(self, request):
        transactions = Transaction.objects.filter(user=request.user).order_by('-timestamp')
        page = self.paginate_queryset(transactions)
        if page is not None:
            serializer = TransactionSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = TransactionSerializer(transactions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def portfolio_performance(self, request):
        """
        Returns aggregated portfolio value over time for 1D / 1W / 1M / 1Y.
        Maps UI period labels → yfinance (period, interval) pairs.
        """
        import yfinance as yf
        import pandas as pd
        from django.core.cache import cache

        PERIOD_MAP = {
            '1D':  ('5d',  '15m'),   # intraday 15-min bars for the last 5 days (yf needs ≥5d for intraday)
            '1W':  ('5d',  '1h'),
            '1M':  ('1mo', '1d'),
            '1Y':  ('1y',  '1d'),
        }

        ui_period = request.query_params.get('period', '1M').upper()
        yf_period, interval = PERIOD_MAP.get(ui_period, ('1mo', '1d'))

        holdings = list(self.get_queryset().filter(quantity__gt=0))
        if not holdings:
            return Response({'labels': [], 'values': []})

        cache_key = f"portperf_{request.user.id}_{ui_period}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        # Fetch historical close prices for every holding symbol
        symbols = [h.stock_symbol for h in holdings]
        qty_map = {h.stock_symbol: h.quantity for h in holdings}

        try:
            # Download all at once for efficiency
            raw = yf.download(
                symbols if len(symbols) > 1 else symbols[0],
                period=yf_period,
                interval=interval,
                progress=False,
                auto_adjust=True,
            )

            if raw.empty:
                return Response({'labels': [], 'values': []})

            # Normalise to a DataFrame of close prices per symbol
            if len(symbols) == 1:
                close_df = raw[['Close']].rename(columns={'Close': symbols[0]})
            else:
                # Multi-ticker download → MultiIndex columns; grab 'Close' level
                if isinstance(raw.columns, pd.MultiIndex):
                    close_df = raw['Close']
                else:
                    close_df = raw[['Close']].rename(columns={'Close': symbols[0]})

            # Forward-fill gaps (weekends / holidays)
            close_df = close_df.ffill().dropna(how='all')

            # For 1D: keep only today's bars
            if ui_period == '1D':
                today = pd.Timestamp.now(tz='UTC').normalize()
                mask = close_df.index.normalize() >= today
                if mask.any():
                    close_df = close_df[mask]
                else:
                    # Fallback: last calendar day in data
                    last_day = close_df.index.normalize().max()
                    close_df = close_df[close_df.index.normalize() == last_day]

            # Aggregate: sum(qty * close) per timestamp
            portfolio_values = pd.Series(0.0, index=close_df.index)
            for sym, qty in qty_map.items():
                if sym in close_df.columns:
                    portfolio_values += close_df[sym].fillna(0) * qty
                elif len(symbols) == 1 and symbols[0] == sym:
                    portfolio_values += close_df.iloc[:, 0].fillna(0) * qty

            portfolio_values = portfolio_values[portfolio_values > 0]

            # Build response: Always use millisecond timestamps for reliability
            labels = [int(ts.timestamp() * 1000) for ts in portfolio_values.index]

            result = {
                'labels': labels,
                'values': [round(float(v), 2) for v in portfolio_values.tolist()],
                'period': ui_period,
            }
            cache.set(cache_key, result, 120)  # 2-min cache
            return Response(result)

        except Exception as e:
            return Response({'labels': [], 'values': [], 'error': str(e)})

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        from concurrent.futures import ThreadPoolExecutor, as_completed
        holdings = list(self.get_queryset())
        total_investment = 0
        total_current_value = 0
        stock_details = []

        def fetch_stock_data(item):
            live_data = MarketService.get_price_only(item.stock_symbol)
            sparkline = MarketService.get_sparkline(item.stock_symbol, period="1mo")
            branding = MarketService.get_branding(item.stock_symbol)
            return item, live_data, sparkline, branding

        results = []
        with ThreadPoolExecutor(max_workers=min(len(holdings), 8)) as executor:
            futures = {executor.submit(fetch_stock_data, item): item for item in holdings}
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception:
                    pass

        # Preserve original order
        symbol_order = {item.stock_symbol: i for i, item in enumerate(holdings)}
        results.sort(key=lambda r: symbol_order.get(r[0].stock_symbol, 999))

        for item, live_data, sparkline, branding in results:
            live_price = live_data['price'] if live_data else item.average_buy_price
            investment = item.quantity * item.average_buy_price
            current_value = item.quantity * live_price
            p_l = current_value - investment
            p_l_pct = (p_l / investment * 100) if investment > 0 else 0

            total_investment += investment
            total_current_value += current_value

            stock_details.append({
                "symbol": item.stock_symbol,
                "logo_url": branding.get('logo_url', '') or (live_data.get('logo_url', '') if live_data else ''),
                "long_name": branding.get('long_name', '') or (live_data.get('long_name', '') if live_data else ''),
                "short_name": branding.get('short_name', '') or (live_data.get('short_name', '') if live_data else ''),
                "quantity": item.quantity,
                "avg_price": round(item.average_buy_price, 2),
                "live_price": round(live_price, 2),
                "investment": round(investment, 2),
                "current_value": round(current_value, 2),
                "p_l": round(p_l, 2),
                "p_l_pct": round(p_l_pct, 2),
                "change": round(live_data.get('change', 0), 2) if live_data else 0,
                "change_pct": round(live_data.get('change_pct', 0), 2) if live_data else 0,
                "volume": live_data.get('volume', 0) if live_data else 0,
                "high": round(live_data.get('high', 0), 2) if live_data else 0,
                "low": round(live_data.get('low', 0), 2) if live_data else 0,
                "sparkline": sparkline,
            })

        total_p_l = total_current_value - total_investment
        total_p_l_pct = (total_p_l / total_investment * 100) if total_investment > 0 else 0

        # Asset allocation data for donut chart
        allocation = []
        for s in stock_details:
            pct = round((s['current_value'] / total_current_value * 100), 1) if total_current_value > 0 else 0
            allocation.append({
                "symbol": s['symbol'],
                "value": s['current_value'],
                "percentage": pct,
            })

        return Response({
            "summary": {
                "total_investment": round(total_investment, 2),
                "total_current_value": round(total_current_value, 2),
                "total_p_l": round(total_p_l, 2),
                "total_p_l_pct": round(total_p_l_pct, 2),
                "stock_count": len(holdings)
            },
            "holdings": stock_details,
            "allocation": allocation,
        })

    @action(detail=False, methods=['get'], url_path=r'(?P<username>[^/.]+)')
    def user_portfolio(self, request, username=None):
        try:
            target_user = User.objects.get(username=username)
            holdings = Portfolio.objects.filter(user=target_user, quantity__gt=0)
            stocks_dict = {item.stock_symbol: item.quantity for item in holdings}
            
            return Response({
                "username": target_user.username,
                "portfolio": stocks_dict
            })
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
