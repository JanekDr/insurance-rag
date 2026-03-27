from pydantic import BaseModel
from typing import List


class ChatRequest(BaseModel):
    question: str
    document_id: str


class SourceCitation(BaseModel):
    page_number: int
    text_snippet: str
    source_filename: str


class RAGResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]