import { apiRequest } from "@/lib/api-request";

export const SUPPORT_TICKETS_PATH = "/admin/support-tickets";

export type TicketStatus = "open" | "investigating" | "resolved";

export interface SupportTicket {
  id: number;
  failed_operation_id: number;
  user_id: number | null;
  user_name: string | null;
  status: TicketStatus;
  admin_notes: string | null;
  created_by: number;
  created_by_email: string | null;
  resolved_by: number | null;
  resolved_by_email: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AssignableAdmin {
  id: number;
  name: string;
  email: string;
}

export async function fetchAssignableAdmins(accessToken: string): Promise<AssignableAdmin[]> {
  return apiRequest<AssignableAdmin[]>(`${SUPPORT_TICKETS_PATH}/assignable-admins`, accessToken);
}

export async function fetchTicketForFailedOperation(
  accessToken: string,
  failedOperationId: number,
): Promise<SupportTicket | null> {
  return apiRequest<SupportTicket | null>(
    `${SUPPORT_TICKETS_PATH}/by-failed-operation/${failedOperationId}`,
    accessToken,
  );
}

export async function createTicket(
  accessToken: string,
  failedOperationId: number,
): Promise<SupportTicket> {
  return apiRequest<SupportTicket>(SUPPORT_TICKETS_PATH, accessToken, {
    method: "POST",
    body: JSON.stringify({ failed_operation_id: failedOperationId }),
  });
}

export async function updateTicket(
  accessToken: string,
  ticketId: number,
  updates: { status?: TicketStatus; admin_notes?: string; assigned_to?: number | null },
): Promise<SupportTicket> {
  return apiRequest<SupportTicket>(`${SUPPORT_TICKETS_PATH}/${ticketId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}
