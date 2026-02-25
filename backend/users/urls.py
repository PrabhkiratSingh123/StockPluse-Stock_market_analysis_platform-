from django.urls import path
from .views import RegisterView, RegisterViewdetail, PasswordResetRequestView, PasswordResetConfirmView, LogoutView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('register/<int:pk>/', RegisterViewdetail.as_view(), name='register_detail'),
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('logout/', LogoutView.as_view(), name='logout'),
]
