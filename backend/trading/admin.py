from django.contrib import admin
from .models import Watchlist, Order

@admin.register(Watchlist)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ('user', 'symbol', 'added_at')
    search_fields = ('symbol', 'user__username')

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('user', 'symbol', 'order_type', 'quantity', 'price', 'status', 'timestamp')
    list_filter = ('order_type', 'status')
    search_fields = ('symbol', 'user__username')
