import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.contrib.auth import get_user_model
from portfolio.models import Portfolio, Transaction
User = get_user_model()
u = User.objects.first()
print('=== Holdings ===')
for p in Portfolio.objects.filter(user=u):
    print(f'{p.stock_symbol}: {p.quantity}')
print('=== Transactions ===')
for t in Transaction.objects.filter(user=u):
    print(f'{t.transaction_type} {t.stock_symbol} x {t.quantity} @ {t.price}')
