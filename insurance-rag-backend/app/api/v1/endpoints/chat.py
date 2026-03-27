import logging
from fastapi import APIRouter, HTTPException

from app.models.chat import ChatRequest, RAGResponse
from app.services.vector_db import VectorDBService
from app.services.llm_service import LLMService

router = APIRouter()
logger = logging.getLogger(__name__)

vector_db = VectorDBService()
llm_service = LLMService(vector_db=vector_db)

@router.post("/", response_model=RAGResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        response = llm_service.ask_question(request.question)
        return response

    except RuntimeError as e:
        logger.error(e)
        raise HTTPException(status_code=503, detail=str(e))

    except Exception as e:
        logger.critical(e)
        raise HTTPException(status_code=500, detail="Internal server error.")