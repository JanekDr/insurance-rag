import logging
import tempfile
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File

from app.services.pdf_service import PDFService
from app.services.vector_db import VectorDBService
from app.worker import process_pdf_task
from celery.result import AsyncResult
from app.worker import celery_app

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File type not supported. Only PDF files are supported.")

    try:
        file_bytes = await file.read()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(file_bytes)
            tmp_file_path = tmp.name

        document_id = str(uuid.uuid4())
        task = process_pdf_task.delay(tmp_file_path, file.filename, document_id)

        return {
            "message": "Plik został przyjęty do kolejki wektoryzacji.",
            "filename": file.filename,
            "task_id": task.id,
            "document_id": document_id,
            "status": "queued"
        }

    except Exception as e:
        logger.error(e)
        raise HTTPException(status_code=500, detail="File processing fail.")

@router.get("/status/{task_id}")
async def get_task_status(task_id: str):
    task_result = AsyncResult(task_id, app=celery_app)

    return {
        "task_id": task_id,
        "status": task_result.status,
        "result": task_result.result if task_result.ready() else None
    }