from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatMessageItem(BaseModel):
    role: str = Field(..., description="'user' or 'assistant' or 'model'")
    content: str = Field(..., description="Message text content")


class ChatRequest(BaseModel):
    message: str = Field(..., description="User prompt or agronomic inquiry")
    record_uuid: Optional[str] = Field(None, description="Optional analysis record UUID to anchor trusted context")
    session_context: Optional[Dict[str, Any]] = Field(None, description="In-memory active session analysis data if unsaved")
    field_name: Optional[str] = Field("Field A — North Parcel", description="Current field / plot name")
    history: Optional[List[ChatMessageItem]] = Field(default_factory=list, description="Recent conversation turns")


class ChatResponse(BaseModel):
    reply: str = Field(..., description="Assistant explanation or answer")
    record_uuid: Optional[str] = None
    model_used: str = "gemini-2.5-flash"
    source_context_used: bool = False
    status: str = "ok"
