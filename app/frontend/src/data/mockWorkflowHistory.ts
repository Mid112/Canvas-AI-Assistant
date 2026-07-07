import type {
  WorkflowHistoryEntry,
  WorkflowStatusCounts,
} from "@/types/workflowHistory";

export const mockWorkflowHistory: WorkflowHistoryEntry[] = [
  {
    id: "wh-1",
    timestamp: "2026-05-31T10:30:00.000Z",
    workflowName: "Send Reminder Emails",
    description:
      "Send reminder emails to students with missing Assignment 3 submissions",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
  },
  {
    id: "wh-2",
    timestamp: "2026-05-31T09:15:00.000Z",
    workflowName: "Create Assignment",
    description:
      'Created "Array Manipulation and Sorting Algorithms" assignment',
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
  },
  {
    id: "wh-3",
    timestamp: "2026-05-30T16:45:00.000Z",
    workflowName: "Bulk Grade Update",
    description: "Attempted to update grades for Quiz 2",
    userName: "Dr. Jane Doe",
    status: "rejected",
    affectedResources: [],
  },
  {
    id: "wh-4",
    timestamp: "2026-05-30T14:20:00.000Z",
    workflowName: "Generate Announcement",
    description: "Draft announcement about upcoming midterm exam",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
  },
  {
    id: "wh-5",
    timestamp: "2026-05-29T11:00:00.000Z",
    workflowName: "Send Reminder Emails",
    description: "Reminded students about Quiz 2 deadline",
    userName: "Dr. Jane Doe",
    status: "rejected",
    affectedResources: [],
  },
  {
    id: "wh-6",
    timestamp: "2026-05-28T15:30:00.000Z",
    workflowName: "Create Assignment",
    description: 'Attempted to create assignment "Database Project"',
    userName: "Dr. Jane Doe",
    status: "pending",
    affectedResources: [],
  },
  {
    id: "wh-7",
    timestamp: "2026-05-27T09:00:00.000Z",
    workflowName: "Send Reminder Emails",
    description: "Send reminders for Assignment 2 deadline",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
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
    { approved: 0, rejected: 0, pending: 0 },
  );
}
