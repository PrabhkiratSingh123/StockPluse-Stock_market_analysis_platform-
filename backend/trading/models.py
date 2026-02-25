from django.db import models
from django.conf import settings

class Watchlist(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="watchlist"
    )
    symbol = models.CharField(max_length=10)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'symbol')

    def __str__(self):
        return f"{self.user.username} watching {self.symbol}"

class Order(models.Model):
    ORDER_TYPES = [
        ('BUY', 'Buy'),
        ('SELL', 'Sell'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders"
    )
    symbol = models.CharField(max_length=10)
    order_type = models.CharField(max_length=4, choices=ORDER_TYPES)
    quantity = models.IntegerField()
    price = models.FloatField()  # Price at execution
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} {self.order_type} {self.symbol}"