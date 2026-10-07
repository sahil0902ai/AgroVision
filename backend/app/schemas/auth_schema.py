from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Full name of user")
    email: EmailStr = Field(..., description="Valid user email address")
    password: str = Field(..., min_length=6, max_length=128, description="User account password")


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    password: str = Field(..., min_length=1, description="Account password")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")


class ResetPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")
    reset_code: str = Field(..., min_length=4, max_length=32, description="Password reset verification code")
    new_password: str = Field(..., min_length=6, max_length=128, description="New account password")


class UserProfileDTO(BaseModel):
    name: str
    email: str
    token: Optional[str] = None
    created_at: Optional[datetime] = None


class AuthResponse(BaseModel):
    success: bool
    message: str
    user: Optional[UserProfileDTO] = None
