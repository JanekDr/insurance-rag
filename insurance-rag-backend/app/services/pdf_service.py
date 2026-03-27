import fitz
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.models.pdf import DocumentChunk, ChunkMetaData

class PDFService:
    def __init__(self, chunk_size_tokens: int = 400, chunk_overlap_tokens: int = 50):
        self.text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name="cl100k_base",
            chunk_size=chunk_size_tokens,
            chunk_overlap=chunk_overlap_tokens,
            separators=["\n\n", "\n", ".", " ", ""]
        )

    def process_pdf_bytes(self, file_bytes: bytes, filename: str, document_id: str) -> List[DocumentChunk]:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        all_chunks: List[DocumentChunk] = []

        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            text = page.get_text("text")

            if not text or not text.strip():
                continue

            page_chunks = self.text_splitter.split_text(text)

            for chunk_text in page_chunks:
                metadata = ChunkMetaData(
                    document_id=document_id,
                    page_number=page_index + 1,
                    source_filename=filename
                )

                chunk = DocumentChunk(
                    metadata=metadata,
                    text=chunk_text
                )
                all_chunks.append(chunk)

        doc.close()
        return all_chunks