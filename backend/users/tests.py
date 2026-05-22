from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from .models import User, Wallet


class UserCreationTest(TestCase):
    """Test 1: Creating a user auto-creates a Wallet with $1,000 balance."""

    def test_user_creation_creates_wallet_with_starting_balance(self):
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="StrongPass123!"
        )
        wallet = Wallet.objects.get(user=user)
        self.assertEqual(wallet.balance, 1000.00)


class UserRegistrationAPITest(TestCase):
    """Test 2: POST /api/users/register/ returns 201 with valid data."""

    def setUp(self):
        self.client = APIClient()

    def test_register_endpoint_returns_201(self):
        response = self.client.post(
            reverse("register"),
            data={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "StrongPass123!",
                "confirm_password": "StrongPass123!"
            },
            format="json"
        )
        self.assertEqual(response.status_code, 201)

