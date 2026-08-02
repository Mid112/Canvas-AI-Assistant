import { describe, expect, it } from "vitest";

import { filterNotificationsBySettings } from "@/lib/filter-notifications";
import type { DashboardNotification } from "@/types/dashboard";

const sample: DashboardNotification[] = [
  {
    id: "missing-submissions",
    message: "3 missing submissions need attention",
    timestamp: "Based on latest dashboard data",
    variant: "warning",
  },
  {
    id: "late-submissions",
    message: "2 late submissions detected",
    timestamp: "Based on latest dashboard data",
    variant: "warning",
  },
  {
    id: "pending-workflows",
    message: "1 workflows awaiting approval",
    timestamp: "Based on latest dashboard data",
    variant: "info",
  },
];

describe("filterNotificationsBySettings", () => {
  it("returns all notifications when settings are null", () => {
    expect(filterNotificationsBySettings(sample, null)).toEqual(sample);
  });

  it("hides pending workflows when workflow-approvals is false", () => {
    expect(
      filterNotificationsBySettings(sample, { "workflow-approvals": false }),
    ).toEqual(sample.filter((item) => item.id !== "pending-workflows"));
  });

  it("keeps missing and late alerts when email submission prefs are off", () => {
    expect(
      filterNotificationsBySettings(sample, {
        "workflow-approvals": true,
        "new-submissions": false,
      }),
    ).toEqual(sample);
  });
});
