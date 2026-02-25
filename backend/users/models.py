from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.contrib.auth.models import BaseUserManager


# =========================
# Custom User Manager
# =========================
class UserManager(BaseUserManager):

    def create_user(self, username, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")

        email = self.normalize_email(email)

        user = self.model(
            username=username,
            email=email,
            **extra_fields
        )

        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        return self.create_user(username, email, password, **extra_fields)


# =========================
# Custom User Model
# =========================
class User(AbstractBaseUser, PermissionsMixin):

    username = models.CharField(max_length=50, unique=True)
    email = models.EmailField()

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    def __str__(self):
        return self.username

from django.utils import timezone
import random

class OTPVerification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='otps')
    otp = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    def is_valid(self):
        return (timezone.now() - self.created_at).total_seconds() < 600 and not self.is_used # 10 mins validity

    @classmethod
    def generate_otp(cls, user):
        otp_code = str(random.randint(100000, 999999))
        return cls.objects.create(user=user, otp=otp_code)
