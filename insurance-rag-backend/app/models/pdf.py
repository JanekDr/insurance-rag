from pydantic import BaseModel


class ChunkMetaData(BaseModel):
    page_number: int
    source_filename: str


class DocumentChunk(BaseModel):
    text: str
    metadata: ChunkMetaData