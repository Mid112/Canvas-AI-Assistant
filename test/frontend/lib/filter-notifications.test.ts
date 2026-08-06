// Test note: covers the filter notifications.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { filterNotificationsBySettings } from "@/lib/filter-notifications";
import type { DashboardNotification } from "@/types/dashboard";

const sample: DashboardNotification[] = [
  {
    id: "workflow-approvals",
    message: "1 workflow awaiting approval",
    timestamp: "Based on latest dashboard data",
    variant: "info",
  },
  {
    id: "grade-updates",
    message: "1 recent grade or feedback update",
    timestamp: "2026-10-04T12:00:00Z",
    variant: "success",
  },
  {
    id: "new-submissions",
    message: "3 missing submissions need attention",
    timestamp: "Based on latest dashboard data",
    variant: "warning",
  },
  {
    id: "urgent-workflows",
    message: "2 late submissions need urgent follow-up",
    timestamp: "Based on latest dashboard data",
    variant: "warning",
  },
  {
    id: "daily-summary",
    message: "Course summary: 2 courses, 45 students, 8 assignments",
    timestamp: "Based on latest dashboard data",
    variant: "info",
  },
];

describe("filterNotificationsBySettings", () => {
  it("applies defaults when settings are null (daily summary off)", () => {
    expect(filterNotificationsBySettings(sample, null).map((item) => item.id)).toEqual([
      "workflow-approvals",
      "grade-updates",
      "new-submissions",
      "urgent-workflows",
    ]);
  });

  it("hides each alert when its matching Settings toggle is off", () => {
    expect(
      filterNotificationsBySettings(sample, {
        "workflow-approvals": false,
        "grade-updates": false,
        "new-submissions": true,
        "urgent-workflows": true,
        "daily-summary": true,
      }).map((item) => item.id),
    ).toEqual(["new-submissions", "urgent-workflows", "daily-summary"]);
  });
});
