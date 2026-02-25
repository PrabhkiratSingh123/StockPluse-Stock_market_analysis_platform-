from django.contrib import admin
from .models import Portfolio

@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "stock_symbol", "quantity", "average_buy_price")
    search_fields = ("stock_symbol",)
    list_filter = ("stock_symbol",)
