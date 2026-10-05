from fastapi import APIRouter, responses
from pathlib import Path

router = APIRouter()

def _static_path(file_name: str) -> Path:
    return Path(__file__).parents[3] / "frontend" / "agrovision" / file_name

@router.get("/sitemap.xml", response_class=responses.FileResponse, tags=["SEO"])
async def sitemap():
    return responses.FileResponse(path=_static_path("sitemap.xml"), media_type="application/xml")

@router.get("/robots.txt", response_class=responses.FileResponse, tags=["SEO"])
async def robots():
    return responses.FileResponse(path=_static_path("robots.txt"), media_type="text/plain")

@router.get("/ld.json", response_class=responses.FileResponse, tags=["SEO"])
async def json_ld():
    return responses.FileResponse(path=_static_path("ld.json"), media_type="application/ld+json")
