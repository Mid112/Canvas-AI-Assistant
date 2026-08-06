// Type note: documents the message thread data contract shared by services, components, and tests.

export type MessageParticipantRole = "instructor" | "student";

export interface MessageThreadParticipant {
  id: string;
  name: string;
  role: MessageParticipantRole;
}

export interface MessageThreadReply {
  id: string;
  author: MessageThreadParticipant;
  body: string;
  sentAt: string;
}

export interface MessageThread {
  id: string;
  courseId: number;
  courseName: string;
  subject: string;
  preview: string;
  participants: MessageThreadParticipant[];
  messages: MessageThreadReply[];
  unreadCount: number;
  updatedAt: string;
}

export interface MessageThreadListResult {
  threads: MessageThread[];
}
