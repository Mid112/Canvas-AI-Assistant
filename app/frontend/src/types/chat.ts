export type ChatMessageRole = "user" | "assistant";

export interface InterpretedAction {
  action: string;
  course: string;
  affectedStudents: string;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: Date;
  explanation?: string;
  interpretedAction?: InterpretedAction;
}

export interface AssistantResponse {
  content: string;
  explanation?: string;
  interpretedAction?: InterpretedAction;
}

export interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  prompt: string;
}
