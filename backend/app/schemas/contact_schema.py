from pydantic import BaseModel, Field

class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=255)
    message: str = Field(..., min_length=1, max_length=2000)

class ContactResponse(BaseModel):
    success: bool
    lead_id: int
    detail: str | None = None
