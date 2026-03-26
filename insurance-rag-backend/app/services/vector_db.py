import os
import uuid
import logging
import time
from typing import List
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from app.models.pdf import DocumentChunk
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(ch)


class VectorDBService:
    def __init__(self, collection_name: str = "insurance_docs_v1"):
        self.collection_name = collection_name

        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        qdrant_api_key = os.getenv("QDRANT_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        if not gemini_key:
            raise ValueError("Server could not start: missing GEMINI API key.")

        self.qdrant = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key,
            prefer_grpc=True
        )

        self.genai_client = genai.Client(api_key=gemini_key)

        self._ensure_collection_exists()

    def _ensure_collection_exists(self):
        collections = self.qdrant.get_collections().collections
        exists = any(col.name == self.collection_name for col in collections)

        if not exists:
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=qdrant_models.VectorParams(
                    size=768,
                    distance=qdrant_models.Distance.COSINE
                )
            )

    def _get_embeddings(self, texts: List[str]) -> List[List[float]]:
        BATCH_SIZE = 15
        all_embeddings = []

        try:
            for i in range(0, len(texts), BATCH_SIZE):
                batch = texts[i:i+BATCH_SIZE]

                response = self.genai_client.models.embed_content(
                    model='gemini-embedding-001',
                    contents=batch,
                    config=types.EmbedContentConfig(
                        task_type="RETRIEVAL_DOCUMENT",
                        output_dimensionality=768
                    )
                )

                all_embeddings.extend([emb.values for emb in response.embeddings])

                if i+BATCH_SIZE < len(texts):
                    time.sleep(15)

            return all_embeddings

        except Exception as e:
            logger.error(f"Gemini vectorization error: {e}")
            raise RuntimeError("Cannot connect with gemini api.")

    def insert_chunks(self, chunks: List[DocumentChunk]):
        if not chunks:
            return

        texts = [chunk.text for chunk in chunks]
        embeddings = self._get_embeddings(texts)

        points = []
        for chunk, embedding in zip(chunks, embeddings):
            point_id = str(uuid.uuid4())
            point = qdrant_models.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": chunk.text,
                    "page_number": chunk.metadata.page_number,
                    "source_filename": chunk.metadata.source_filename
                }
            )
            points.append(point)

        self.qdrant.upsert(
            collection_name=self.collection_name,
            points=points
        )

    def search(self, query_text: str, limit: int = 5) -> List[dict]:
        query_vector = self._get_embeddings([query_text])[0]

        search_result = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=limit
        )

        return [hit.payload for hit in search_result.points]