from rest_framework import serializers
from .models import Watchlist, Order

class WatchlistSerializer(serializers.ModelSerializer):
    class Meta:
        model = Watchlist
        fields = ['id', 'symbol', 'added_at']
        read_only_fields = ['added_at']

class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ['id', 'symbol', 'order_type', 'quantity', 'price', 'status', 'timestamp']
        read_only_fields = ['status', 'timestamp']
