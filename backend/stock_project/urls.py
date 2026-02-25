from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from django.http import JsonResponse


# -------------------------------
# Swagger Configuration
# -------------------------------
schema_view = get_schema_view(
   openapi.Info(
      title="Stock API",
      default_version='v1',
   ),
   public=True,
   permission_classes=(permissions.AllowAny,),
)


# -------------------------------
# Root API View
# -------------------------------
def api_root(request):
    return JsonResponse({
        "message": "Stock Market API Running Successfully 🚀",
        "swagger": "/swagger/",
        "admin": "/admin/",
        "token": "/api/token/"
    })


# -------------------------------
# URL Patterns
# -------------------------------
urlpatterns = [

    # Root
    path('', api_root),

    # Admin
    path('admin/', admin.site.urls),

    # JWT Authentication
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Application Routes
    path('users/', include('users.urls')),
    path('portfolio/', include('portfolio.urls')),
    path('trading/', include('trading.urls')),

    # API Documentation
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='redoc'),

]
