import os
import logging
from celery import Celery
from dotenv import load_dotenv

from app.services.pdf_service import PDFService
from app.services.vector_db import VectorDBService, GeminiRateLimitError

load_dotenv()

logger = logging.getLogger(__name__)

celery_app = Celery(
    "insurance_worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)


@celery_app.task(bind=True, max_retries=3)
def process_pdf_task(self, file_path: str, filename: str, document_id: str, model_type: str):
    try:
        vector_db = VectorDBService()
        pdf_service = PDFService(chunk_size_tokens=400, chunk_overlap_tokens=50)

        with open(file_path, "rb") as f:
            file_bytes = f.read()

        chunks = pdf_service.process_pdf_bytes(file_bytes, filename=filename, document_id=document_id)
        vector_db.insert_chunks(chunks, document_id, model_type)

        return {"status": "done", "model_type": model_type}

    except GeminiRateLimitError as e:
        logger.warning(f"Gemini rate limit hit for document {document_id}: {e}")
        return {
            "status": "rate_limit",
            "model_type": model_type,
            "error": str(e)
        }

    except Exception as e:
        logger.error(f"Processing error for document {document_id}: {e}")
        self.retry(countdown=60, exc=e)

    finally:
        if os.path.exists(file_path):
            os.remove(file_path)