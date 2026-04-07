export interface SourceCitation {
  page_number: number;
  text_snippet: string;
  source_filename?: string;
}

export interface RAGResponse {
  answer: string;
  sources: SourceCitation[];
}

export interface UploadResponse {
  message: string;
  filename: string;
  task_id: string;
  document_id: string;
  model_type: string;
  status: string;
}

export interface TaskResult {
  status: "done" | "rate_limit";
  model_type: string;
  error?: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "RETRY" | "REVOKED" | "RATE_LIMITED";
  result?: TaskResult | null;
}

export interface Message {
  role: "user" | "ai";
  content: string;
  sources?: SourceCitation[];
}