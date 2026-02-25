from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User

    list_display = ("id", "username", "email", "is_staff", "is_active")
    list_filter = ("is_staff", "is_active", "is_superuser")
    search_fields = ("username", "email")
    ordering = ("id",)
