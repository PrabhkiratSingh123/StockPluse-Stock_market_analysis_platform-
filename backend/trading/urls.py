from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TradingViewSet, WatchlistViewSet

router = DefaultRouter()
router.register(r'watchlist', WatchlistViewSet, basename='watchlist')
router.register(r'', TradingViewSet, basename='trading')

urlpatterns = [
    path('', include(router.urls)),
]
