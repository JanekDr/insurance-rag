import os
import logging
from app.services.vector_db import VectorDBService
from app.models.chat import RAGResponse
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class LLMService:
    def __init__(self, vector_db: VectorDBService):
        self.vector_db = vector_db
        gemini_key = os.getenv("GEMINI_API_KEY")

        if not gemini_key:
            raise ValueError("Brak klucza GEMINI_API_KEY!")

        self.genai_client = genai.Client(api_key=gemini_key)
        self.model_name = 'gemini-2.5-flash'

    def ask_question(self, question: str) -> RAGResponse:
        contexts = self.vector_db.search(query_text=question, limit=5)

        if not contexts:
            contexts = []

        context_text = ""
        for i, ctx in enumerate(contexts):
            context_text += f"---\nFRAGMENT {i + 1} (Strona {ctx['page_number']}):\n{ctx['text']}\n"

        user_prompt = f"Pytanie użytkownika: {question}\n\nKontekst z dokumentu:\n{context_text}"

        try:
            config = types.GenerateContentConfig(
                system_instruction=(
                    "Jesteś precyzyjnym asystentem ds. ubezpieczeń. "
                    "Twoim zadaniem jest odpowiedzieć na pytanie użytkownika opierając się WYŁĄCZNIE na dostarczonych fragmentach tekstu (OWU). "
                    "Nie zmyślaj informacji. Jeśli w dostarczonym tekście nie ma odpowiedzi, napisz po prostu: "
                    "'Niestety, nie znalazłem tej informacji w wgranym dokumencie'. "
                    "Zawsze podawaj numery stron, z których czerpiesz wiedzę, używając dołączonej struktury danych."
                    "Zawsze podawaj numery stron w formacie JSON."
                ),
                response_mime_type="application/json",
                response_schema=RAGResponse,
            )

            response = self.genai_client.models.generate_content(
                model=self.model_name,
                contents=user_prompt,
                config=config
            )

            return RAGResponse.model_validate_json(response.text)

        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            raise RuntimeError("Cannot generate AI response.")