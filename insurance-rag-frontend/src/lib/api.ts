import { RAGResponse, TaskStatusResponse, UploadResponse } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function uploadDocument(file: File, modelType: string = "gemini"): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_type", modelType);

  const response = await fetch(`${API_BASE_URL}/upload/`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "An error occured while uploading the file.");
  }

  return response.json();
}

export async function pollTaskStatus(
  taskId: string,
  intervalMs = 3000,
  maxAttempts = 100
): Promise<TaskStatusResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${API_BASE_URL}/upload/status/${taskId}`);

    if (!response.ok) {
      throw new Error("Cannot poll task status.");
    }

    const data: TaskStatusResponse = await response.json();

    if (data.status === "SUCCESS") {
      return data;
    }

    if (data.status === "RATE_LIMITED") {
      throw new RateLimitError(
        data.result?.error || "Limit API Gemini wyczerpany. Spróbuj ponownie za kilka minut lub użyj modelu lokalnego."
      );
    }

    if (data.status === "FAILURE" || data.status === "REVOKED") {
      throw new Error("Document vectorization failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timeout during poll task status.");
}

export async function askQuestion(question: string, documentId: string, modelType: string = "gemini"): Promise<RAGResponse> {
  const response = await fetch(`${API_BASE_URL}/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: question,
      document_id: documentId,
      model_type: modelType,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Wystąpił błąd podczas komunikacji z asystentem.");
  }

  return response.json();
}