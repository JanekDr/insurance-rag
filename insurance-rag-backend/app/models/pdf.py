from pydantic import BaseModel


class ChunkMetaData(BaseModel):
    document_id: str
    page_number: int
    source_filename: str


class DocumentChunk(BaseModel):
    text: str
    metadata: ChunkMetaData