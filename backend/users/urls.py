from django.urls import path
from .views import (RegisterView, RegisterViewdetail, PasswordResetRequestView, PasswordResetConfirmView,
                    LogoutView, ProfileView, WalletView, WalletHistoryView, WalletDepositView, WalletSetLimitView,
                    PaymentMethodViewSet)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'payment-methods', PaymentMethodViewSet, basename='payment-methods')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('register/<int:pk>/', RegisterViewdetail.as_view(), name='register_detail'),
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('wallet/', WalletView.as_view(), name='wallet'),
    path('wallet/history/', WalletHistoryView.as_view(), name='wallet_history'),
    path('wallet/deposit/', WalletDepositView.as_view(), name='wallet_deposit'),
    path('wallet/set-limit/', WalletSetLimitView.as_view(), name='wallet_set_limit'),
] + router.urls
