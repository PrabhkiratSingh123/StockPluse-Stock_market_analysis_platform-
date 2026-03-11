from django.shortcuts import render

# Create your views here.
from rest_framework import generics
from .models import User
from .serializers import RegisterSerializer
from rest_framework.permissions import AllowAny

class RegisterView(generics.CreateAPIView,generics.ListAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
class RegisterViewdetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import OTPVerification
from .serializers import PasswordResetRequestSerializer, PasswordResetConfirmSerializer
from django.core.mail import send_mail

class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            user = User.objects.filter(email=email).first()
            if user:
                # Invalidate existing OTPs for the user
                OTPVerification.objects.filter(user=user, is_used=False).update(is_used=True)
                otp_obj = OTPVerification.generate_otp(user)
                
                # Send email
                send_mail(
                    'Your StockPulse Password Reset OTP',
                    f'Your OTP code is {otp_obj.otp}. It is valid for 10 minutes.',
                    'noreply@stockpulse.com',
                    [email],
                    fail_silently=False,
                )
            
            # Always return success to prevent email enumeration
            return Response({'detail': 'If an account exists with this email, an OTP has been sent.'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            otp = serializer.validated_data['otp']
            new_password = serializer.validated_data['new_password']

            user = User.objects.filter(email=email).first()
            if not user:
                return Response({'detail': 'Invalid email or OTP.'}, status=status.HTTP_400_BAD_REQUEST)
            
            otp_obj = OTPVerification.objects.filter(user=user, otp=otp, is_used=False).last()
            
            if not otp_obj or not otp_obj.is_valid():
                return Response({'detail': 'Invalid or expired OTP.'}, status=status.HTTP_400_BAD_REQUEST)

            # Valid OTP, change password
            user.set_password(new_password)
            user.save()

            # Mark OTP as used
            otp_obj.is_used = True
            otp_obj.save()

            return Response({'detail': 'Password has been reset successfully.'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data["refresh"]
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"detail": "Successfully logged out."}, status=status.HTTP_205_RESET_CONTENT)
        except Exception as e:
            return Response({"detail": "Token is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)

from .models import UserProfile, Wallet, PaymentMethod, WalletTransaction
from .serializers import UserProfileSerializer, WalletSerializer, PaymentMethodSerializer, WalletTransactionSerializer
from rest_framework import viewsets
import uuid
import decimal

class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        return Response(WalletSerializer(wallet).data)

    def post(self, request):
        """Used to credit or debit the purse via mock payment."""
        action_type = request.data.get('action') # 'CREDIT' or 'DEBIT'
        amount_val = request.data.get('amount', 0)
        
        try:
            amount = decimal.Decimal(str(amount_val))
        except:
            return Response({"error": "Invalid amount"}, status=400)

        if amount <= 0:
            return Response({"error": "Positive amount required"}, status=400)

        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        ref_id = f"PAY-{uuid.uuid4().hex[:12].upper()}"
        
        if action_type == 'CREDIT':
            wallet.balance += amount
            wallet.save()
            WalletTransaction.objects.create(
                wallet=wallet,
                transaction_type='CREDIT',
                amount=amount,
                description=f"Funded via {request.data.get('method', 'UPI')}",
                reference_id=ref_id
            )
            return Response({"status": f"Successfully credited ${amount}", "balance": wallet.balance, "ref": ref_id})
        
        elif action_type == 'DEBIT':
            if wallet.balance < amount:
                return Response({"error": "Insufficient balance in purse"}, status=400)
            wallet.balance -= amount
            wallet.save()
            WalletTransaction.objects.create(
                wallet=wallet,
                transaction_type='DEBIT',
                amount=amount,
                description="Withdrawn to Bank",
                reference_id=ref_id
            )
            return Response({"status": f"Successfully debited ${amount}", "balance": wallet.balance, "ref": ref_id})
        
        return Response({"error": "Invalid action"}, status=400)

class WalletDepositView(APIView):
    """Deposit money into wallet via UPI or Bank Account payment method."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        amount_val = request.data.get('amount', 0)
        payment_method_id = request.data.get('payment_method_id')

        try:
            amount = decimal.Decimal(str(amount_val))
        except Exception:
            return Response({"error": "Invalid amount"}, status=400)

        if amount <= 0:
            return Response({"error": "Amount must be positive"}, status=400)

        # Validate payment method belongs to user
        if payment_method_id:
            try:
                pm = PaymentMethod.objects.get(id=payment_method_id, user=request.user)
                pm_label = f"{pm.label} ({pm.details})"
                pm_type = pm.method_type
            except PaymentMethod.DoesNotExist:
                return Response({"error": "Payment method not found"}, status=404)
        else:
            pm_label = "Wallet Top-up"
            pm_type = "DIRECT"

        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        ref_id = f"DEP-{uuid.uuid4().hex[:12].upper()}"
        wallet.balance += amount
        wallet.save()

        WalletTransaction.objects.create(
            wallet=wallet,
            transaction_type='CREDIT',
            amount=amount,
            description=f"Deposited via {pm_type} — {pm_label}",
            reference_id=ref_id
        )

        return Response({
            "balance": str(wallet.balance),
            "ref": ref_id,
            "message": f"₹{amount} successfully added to your purse!"
        }, status=200)


class WalletSetLimitView(APIView):
    """Set or clear the user's spending (debit) limit."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        limit_val = request.data.get('spending_limit', None)
        wallet, _ = Wallet.objects.get_or_create(user=request.user)

        if limit_val is None or limit_val == '':
            wallet.spending_limit = None
            wallet.save()
            return Response({"message": "Spending limit cleared.", "spending_limit": None})

        try:
            limit = decimal.Decimal(str(limit_val))
        except Exception:
            return Response({"error": "Invalid limit value"}, status=400)

        if limit <= 0:
            return Response({"error": "Spending limit must be positive"}, status=400)

        wallet.spending_limit = limit
        wallet.save()
        return Response({
            "message": f"Spending limit set to ${limit}",
            "spending_limit": str(wallet.spending_limit)
        })


class WalletHistoryView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WalletTransactionSerializer

    def get_queryset(self):
        wallet, _ = Wallet.objects.get_or_create(user=self.request.user)
        return wallet.transactions.all()

class PaymentMethodViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PaymentMethodSerializer

    def get_queryset(self):
        return PaymentMethod.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

