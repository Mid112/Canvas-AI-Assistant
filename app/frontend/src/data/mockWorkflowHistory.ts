// Mock data note: supplies mock workflow history fixtures for UI development and frontend tests.

import type {
  WorkflowHistoryEntry,
  WorkflowStatusCounts,
} from "@/types/workflowHistory";

export const mockWorkflowHistory: WorkflowHistoryEntry[] = [
  {
    id: "wh-1",
    timestamp: "2026-05-31T10:30:00.000Z",
    actionName: "send_message",
    workflowName: "Send Reminder Emails",
    prompt:
      "Send reminder emails to students with missing Assignment 3 submissions",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "wh-2",
    timestamp: "2026-05-31T09:15:00.000Z",
    actionName: "create_assignment",
    workflowName: "Create Assignment",
    prompt:
      'Created "Array Manipulation and Sorting Algorithms" assignment',
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "wh-3",
    timestamp: "2026-05-30T16:45:00.000Z",
    actionName: "update_grades",
    workflowName: "Bulk Grade Update",
    prompt: "Attempted to update grades for Quiz 2",
    userName: "Dr. Jane Doe",
    status: "rejected",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "wh-4",
    timestamp: "2026-05-30T14:20:00.000Z",
    actionName: "create_announcement",
    workflowName: "Generate Announcement",
    prompt: "Draft announcement about upcoming midterm exam",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "wh-5",
    timestamp: "2026-05-29T11:00:00.000Z",
    actionName: "send_message",
    workflowName: "Send Reminder Emails",
    prompt: "Reminded students about Quiz 2 deadline",
    userName: "Dr. Jane Doe",
    status: "rejected",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "wh-6",
    timestamp: "2026-05-28T15:30:00.000Z",
    actionName: "create_assignment",
    workflowName: "Create Assignment",
    prompt: 'Attempted to create assignment "Database Project"',
    userName: "Dr. Jane Doe",
    status: "pending",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "wh-7",
    timestamp: "2026-05-27T09:00:00.000Z",
    actionName: "send_message",
    workflowName: "Send Reminder Emails",
    prompt: "Send reminders for Assignment 2 deadline",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: false,
    undoneAt: null,
  },
];

export function getWorkflowStatusCounts(
  entries: WorkflowHistoryEntry[],
): WorkflowStatusCounts {
  return entries.reduce<WorkflowStatusCounts>(
    (counts, entry) => {
      counts[entry.status] += 1;
      return counts;
    },
    { approved: 0, rejected: 0, pending: 0, paused: 0 },
  );
}
