// Mock data note: supplies mock message threads fixtures for UI development and frontend tests.

import type { MessageThread } from "@/types/messageThread";

/** Fixture threads for inbox component tests. */
export const mockMessageThreads: MessageThread[] = [
  {
    id: "thread-1",
    courseId: 1,
    courseName: "cosc 121",
    subject: "Reminder: Programming Assignment 3 Due Friday",
    preview: "Thanks for the reminder — I submitted last night.",
    unreadCount: 1,
    updatedAt: "2026-07-09T18:22:00.000Z",
    participants: [
      { id: "instructor-1", name: "You", role: "instructor" },
      { id: "student-1", name: "Alex Thompson", role: "student" },
      { id: "student-2", name: "Maria Garcia", role: "student" },
    ],
    messages: [
      {
        id: "msg-1",
        author: { id: "instructor-1", name: "You", role: "instructor" },
        body: "Hi everyone,\n\nThis is a friendly reminder that Programming Assignment 3 is due this Friday at 11:59 PM.\n\nBest regards",
        sentAt: "2026-07-08T15:00:00.000Z",
      },
      {
        id: "msg-2",
        author: {
          id: "student-1",
          name: "Alex Thompson",
          role: "student",
        },
        body: "Thanks for the reminder — I submitted last night.",
        sentAt: "2026-07-09T18:22:00.000Z",
      },
    ],
  },
  {
    id: "thread-2",
    courseId: 1,
    courseName: "cosc 121",
    subject: "Office hours this week",
    preview: "Can I come Wednesday instead of Thursday?",
    unreadCount: 2,
    updatedAt: "2026-07-10T09:10:00.000Z",
    participants: [
      { id: "instructor-1", name: "You", role: "instructor" },
      { id: "student-3", name: "John Smith", role: "student" },
      { id: "student-4", name: "Sarah Lee", role: "student" },
    ],
    messages: [
      {
        id: "msg-3",
        author: { id: "instructor-1", name: "You", role: "instructor" },
        body: "Office hours are Thursday 2–4pm in SCI 210. Bring questions about the midterm review.",
        sentAt: "2026-07-09T12:00:00.000Z",
      },
      {
        id: "msg-4",
        author: { id: "student-3", name: "John Smith", role: "student" },
        body: "Can I come Wednesday instead of Thursday?",
        sentAt: "2026-07-10T08:55:00.000Z",
      },
      {
        id: "msg-5",
        author: { id: "student-4", name: "Sarah Lee", role: "student" },
        body: "Same question — Wednesday works better for my lab schedule.",
        sentAt: "2026-07-10T09:10:00.000Z",
      },
    ],
  },
  {
    id: "thread-3",
    courseId: 2,
    courseName: "cosc 343",
    subject: "Group project check-in",
    preview: "No student replies yet.",
    unreadCount: 0,
    updatedAt: "2026-07-07T16:40:00.000Z",
    participants: [
      { id: "instructor-1", name: "You", role: "instructor" },
      { id: "student-5", name: "Emily Johnson", role: "student" },
    ],
    messages: [
      {
        id: "msg-6",
        author: { id: "instructor-1", name: "You", role: "instructor" },
        body: "Please reply with your group’s chosen topic by Friday.",
        sentAt: "2026-07-07T16:40:00.000Z",
      },
    ],
  },
];
