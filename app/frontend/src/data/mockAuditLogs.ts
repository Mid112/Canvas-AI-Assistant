import type { AuditLogEntry } from "@/types/auditLog";
import type { AuditLogApiRecord } from "@/types/auditLog";

export const mockAuditLogs: AuditLogEntry[] = [
  {
    id: "audit-1",
    timestamp: "2026-05-31T14:23:45.000Z",
    userEmail: "jane.doe@university.edu",
    userRole: "instructor",
    action: "Create Message Draft",
    resource: "Message Draft #4521",
    result: "success",
    details: {
      workflowId: 128,
      courseId: "CS-101",
      ipAddress: "10.0.4.22",
    },
  },
  {
    id: "audit-2",
    timestamp: "2026-05-31T14:15:22.000Z",
    userEmail: "alex.j@university.edu",
    userRole: "instructor",
    action: "View Student Data",
    resource: "Student Records - CS 101",
    result: "success",
    details: {
      studentCount: 42,
      accessScope: "read-only",
      ipAddress: "10.0.4.18",
    },
  },
  {
    id: "audit-3",
    timestamp: "2026-05-31T13:58:10.000Z",
    userEmail: "admin@system.local",
    userRole: "admin",
    action: "Update User Role",
    resource: "User: emily.d@college.edu",
    result: "success",
    details: {
      previousRole: "instructor",
      newRole: "instructor",
      ipAddress: "127.0.0.1",
    },
  },
  {
    id: "audit-4",
    timestamp: "2026-05-31T13:42:33.000Z",
    userEmail: "michael.c@university.edu",
    userRole: "instructor",
    action: "Export Report",
    resource: "Missing Work Report - CS 201",
    result: "success",
    details: {
      format: "csv",
      recordCount: 18,
      ipAddress: "10.0.4.31",
    },
  },
  {
    id: "audit-5",
    timestamp: "2026-05-31T12:55:08.000Z",
    userEmail: "r.wilson@university.edu",
    userRole: "instructor",
    action: "Delete Assignment",
    resource: "Assignment: Quiz 5",
    result: "failed",
    details: {
      errorCode: "ASSIGNMENT_LOCKED",
      reason: "Assignment has active submissions and cannot be deleted.",
      ipAddress: "10.0.4.9",
    },
  },
];

/** Backend-shaped seed data for mapper/integration tests. */
export const mockAuditLogApiRecords: AuditLogApiRecord[] = [
  {
    id: 1,
    user_id: 10,
    workflow_id: 128,
    course_id: 3,
    action: "send_message",
    resource_type: "announcement",
    resource_id: "4521",
    operation: "create",
    status: "success",
    timestamp: "2026-05-31T14:23:45.000Z",
    user_email: "jane.doe@university.edu",
    user_role: "instructor",
  },
];
