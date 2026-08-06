import { apiRequest } from "@/lib/api-request";

const ADMIN_USERS_PATH = "/admin/users";

export interface CreateAdminPayload {
  name: string;
  email: string;
  password: string;
}

export interface AdminUserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

/** Lets a logged-in admin create another admin account — the in-product
 * recovery path if the sole admin account is ever lost. */
export async function createAdmin(
  accessToken: string,
  payload: CreateAdminPayload,
): Promise<AdminUserRecord> {
  return apiRequest<AdminUserRecord>(ADMIN_USERS_PATH, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
