import os
import uuid
import logging
from typing import List
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models
from app.models.pdf import DocumentChunk
from tenacity import retry, wait_exponential, stop_after_attempt
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(ch)


class GeminiRateLimitError(Exception):
    """Raised when Gemini API rate limit is exhausted after all retries."""
    pass


class VectorDBService:
    def __init__(self, collection_name: str = "insurance_hybrid_v1"):
        self.collection_name = collection_name

        qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        qdrant_api_key = os.getenv("QDRANT_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        self.genai_client = None
        if gemini_key:
            from google import genai
            self.genai_client = genai.Client(api_key=gemini_key)
        else:
            logger.warning("GEMINI_API_KEY not set. Gemini embeddings will be unavailable.")

        self.qdrant = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key,
            prefer_grpc=True
        )

        self.local_model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')

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

    @retry(
        wait=wait_exponential(multiplier=2, min=4, max=60),
        stop=stop_after_attempt(6),
        before_sleep=lambda retry_state: logger.warning(
            f"API limit reached. Next try in: {retry_state.next_action.sleep}s..."
        )
    )
    def _call_gemini_api(self, batch: List[str]):
        from google.genai import types

        return self.genai_client.models.embed_content(
            model='gemini-embedding-001',
            contents=batch,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=768
            )
        )

    def _get_embeddings(self, texts: List[str], model_type: str = "gemini") -> List[List[float]]:
        if model_type == "local":
            logger.info(f"Generating embeddings locally for {len(texts)} chunks...")
            return self.local_model.encode(texts).tolist()

        if self.genai_client is None:
            raise GeminiRateLimitError(
                "Gemini API key is not configured. Please use local model."
            )

        BATCH_SIZE = 60
        all_embeddings = []

        try:
            for i in range(0, len(texts), BATCH_SIZE):
                batch = texts[i:i + BATCH_SIZE]
                logger.info(f"Gemini embedding batch {i // BATCH_SIZE + 1}/{(len(texts) - 1) // BATCH_SIZE + 1}...")
                response = self._call_gemini_api(batch)
                all_embeddings.extend([emb.values for emb in response.embeddings])

            return all_embeddings

        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "resource exhausted" in error_msg or "rate limit" in error_msg:
                logger.error(f"Gemini rate limit exhausted after all retries: {e}")
                raise GeminiRateLimitError(
                    "Limit API Gemini wyczerpany. Spróbuj ponownie za kilka minut lub użyj modelu lokalnego."
                )
            logger.error(f"Gemini vectorization error: {e}")
            raise RuntimeError("Cannot connect with Gemini API.")

    def insert_chunks(self, chunks: List[DocumentChunk], document_id: str, model_type: str = "gemini"):
        if not chunks:
            return

        texts = [chunk.text for chunk in chunks]
        embeddings = self._get_embeddings(texts, model_type)

        points = []
        for chunk, embedding in zip(chunks, embeddings):
            point_id = str(uuid.uuid4())
            point = qdrant_models.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "document_id": document_id,
                    "model_type": model_type,
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

        logger.info(f"Inserted {len(points)} chunks for document {document_id} using {model_type} embeddings.")

    def search(self, query_text: str, document_id: str = None, model_type: str = "gemini", limit: int = 5) -> List[dict]:
        query_vector = self._get_embeddings([query_text], model_type)[0]

        filter_conditions = []

        if document_id:
            filter_conditions.append(
                qdrant_models.FieldCondition(
                    key="document_id",
                    match=qdrant_models.MatchValue(value=document_id)
                )
            )

        filter_conditions.append(
            qdrant_models.FieldCondition(
                key="model_type",
                match=qdrant_models.MatchValue(value=model_type)
            )
        )

        query_filter = qdrant_models.Filter(must=filter_conditions)

        search_result = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=query_filter,
            limit=limit
        )

        return [hit.payload for hit in search_result.points]