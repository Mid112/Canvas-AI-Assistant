import type { ActionHistoryEntry } from "@/types/actionHistory";

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

export const mockActionHistory: ActionHistoryEntry[] = [
  {
    id: "hist-1",
    originalRequest:
      "Send a reminder to students who have not submitted Programming Assignment 3.",
    actionType: "Send Message",
    courseLabel: "CS 101: Introduction to Programming",
    status: "executed",
    requestedAt: hoursAgo(2),
    executedAt: hoursAgo(1.5),
    requestedBy: "Dr. Jane Doe",
  },
  {
    id: "hist-2",
    originalRequest:
      "Update the due date for Milestone 2 Demo to July 10 at 11:59 PM.",
    actionType: "Update Assignment",
    courseLabel: "COSC 499 Capstone",
    status: "approved",
    requestedAt: hoursAgo(5),
    requestedBy: "Dr. Jane Doe",
  },
  {
    id: "hist-3",
    originalRequest: "Create a new quiz covering recursion and dynamic programming.",
    actionType: "Create Assignment",
    courseLabel: "CS 201: Data Structures",
    status: "pending",
    requestedAt: hoursAgo(8),
    requestedBy: "Dr. Jane Doe",
  },
  {
    id: "hist-4",
    originalRequest: "Post an announcement about the midterm review session.",
    actionType: "Post Announcement",
    courseLabel: "CS 301: Algorithms",
    status: "rejected",
    requestedAt: hoursAgo(26),
    requestedBy: "Dr. Jane Doe",
  },
  {
    id: "hist-5",
    originalRequest: "Export missing submission report for Lab 4.",
    actionType: "Export Report",
    courseLabel: "CS 101: Introduction to Programming",
    status: "failed",
    requestedAt: hoursAgo(30),
    executedAt: hoursAgo(29.5),
    requestedBy: "Dr. Jane Doe",
  },
  {
    id: "hist-6",
    originalRequest: "Message students who submitted late on Homework 2.",
    actionType: "Send Message",
    courseLabel: "CS 150: Web Development",
    status: "executed",
    requestedAt: hoursAgo(48),
    executedAt: hoursAgo(47),
    requestedBy: "Dr. Jane Doe",
  },
];

export function filterActionHistory(
  entries: ActionHistoryEntry[],
  search: string,
  status: string,
): ActionHistoryEntry[] {
  const normalized = search.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesStatus = status === "all" || entry.status === status;
    const matchesSearch =
      !normalized ||
      entry.originalRequest.toLowerCase().includes(normalized) ||
      entry.courseLabel.toLowerCase().includes(normalized) ||
      entry.actionType.toLowerCase().includes(normalized) ||
      entry.requestedBy.toLowerCase().includes(normalized);

    return matchesStatus && matchesSearch;
  });
}
