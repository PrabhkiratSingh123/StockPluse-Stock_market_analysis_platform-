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
    def analytics(self, request):
        holdings = self.get_queryset()
        total_investment = 0
        total_current_value = 0
        stock_details = []

        for item in holdings:
            live_data = MarketService.get_live_data(item.stock_symbol)
            live_price = live_data['price'] if live_data else item.average_buy_price
            investment = item.quantity * item.average_buy_price
            current_value = item.quantity * live_price
            p_l = current_value - investment
            p_l_pct = (p_l / investment * 100) if investment > 0 else 0

            total_investment += investment
            total_current_value += current_value

            # Get sparkline data for each holding
            sparkline = MarketService.get_sparkline(item.stock_symbol, period="1mo")

            # Get branding (logo + long name), cached 24h
            branding = MarketService.get_branding(item.stock_symbol)

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
                "stock_count": holdings.count()
            },
            "holdings": stock_details,
            "allocation": allocation,
        })