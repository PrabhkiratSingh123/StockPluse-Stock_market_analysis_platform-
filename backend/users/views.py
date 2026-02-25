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
