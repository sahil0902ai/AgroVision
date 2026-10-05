from .endpoints import analytics, health, predict, records, pages, contact, seo
from fastapi import APIRouter

api_router = APIRouter()
api_router.include_router(predict.router, tags=["predict"])
api_router.include_router(records.router, tags=["records"])
api_router.include_router(analytics.router, tags=["analytics"])
api_router.include_router(health.router, tags=["health"])
api_router.include_router(pages.router, tags=["Core Pages"])
api_router.include_router(contact.router, tags=["Contact"])
api_router.include_router(seo.router, tags=["SEO"])
