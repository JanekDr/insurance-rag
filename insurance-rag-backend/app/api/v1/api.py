from fastapi import APIRouter
from app.api.v1.endpoints import chat, upload

api_router = APIRouter()
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])