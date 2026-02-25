# Create your models here.
from django.conf import settings
from django.db import models

class Portfolio(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="portfolios"
    )
    stock_symbol = models.CharField(max_length=10)
    quantity = models.IntegerField(default=0)
    average_buy_price = models.FloatField(default=0.0)

    class Meta:
        unique_together = ('user', 'stock_symbol')

    def __str__(self):
        return f"{self.user.username} - {self.stock_symbol}"

class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('BUY', 'Buy'),
        ('SELL', 'Sell'),
    ]
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transactions"
    )
    stock_symbol = models.CharField(max_length=10)
    transaction_type = models.CharField(max_length=4, choices=TRANSACTION_TYPES)
    quantity = models.IntegerField()
    price = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} {self.transaction_type} {self.stock_symbol}"
