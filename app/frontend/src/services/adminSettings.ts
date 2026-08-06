import { apiRequest } from "@/lib/api-request";

export const ADMIN_SETTINGS_PATH = "/admin/settings";

export interface AdminSettings {
  organization_name: string;
  allow_instructor_self_registration: boolean;
  session_timeout_minutes: number;
  [key: string]: string | number | boolean;
}

export interface AdminSettingsResponse {
  settings: AdminSettings;
}

export async function fetchAdminSettings(
  accessToken: string,
): Promise<AdminSettings> {
  const response = await apiRequest<AdminSettingsResponse>(
    ADMIN_SETTINGS_PATH,
    accessToken,
  );

  return response.settings;
}

export async function updateAdminSettings(
  accessToken: string,
  settings: Partial<AdminSettings>,
): Promise<AdminSettings> {
  const response = await apiRequest<AdminSettingsResponse>(
    ADMIN_SETTINGS_PATH,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    },
  );

  return response.settings;
}
