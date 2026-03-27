from pydantic import BaseModel
from typing import List


class ChatRequest(BaseModel):
    question: str


class SourceCitation(BaseModel):
    page_number: int
    text_snippet: str


class RAGResponse(BaseModel):
    answer: str
    sources: List[SourceCitation]