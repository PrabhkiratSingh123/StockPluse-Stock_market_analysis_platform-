from .models import Portfolio, Transaction
from rest_framework import serializers

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ['id', 'stock_symbol', 'transaction_type', 'quantity', 'price', 'timestamp']
        read_only_fields = ['user', 'timestamp']

class PortfolioSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Portfolio
        fields = ['id', 'username', 'stock_symbol', 'quantity', 'average_buy_price']
        read_only_fields = ['user', 'quantity', 'average_buy_price']