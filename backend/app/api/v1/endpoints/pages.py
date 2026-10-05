from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from pathlib import Path

router = APIRouter()

def _read_html(file_name: str) -> str:
    # Path to the frontend static HTML files
    path = Path(__file__).parents[3] / "frontend" / "agrovision" / file_name
    return path.read_text(encoding="utf-8")

@router.get("/services", response_class=HTMLResponse, tags=["Core Pages"])
async def services_page():
    html = _read_html("services.html")
    return HTMLResponse(content=html)

@router.get("/about", response_class=HTMLResponse, tags=["Core Pages"])
async def about_page():
    html = _read_html("about.html")
    return HTMLResponse(content=html)
