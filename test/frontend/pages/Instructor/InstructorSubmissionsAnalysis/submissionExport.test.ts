// Test note: covers the submission export.test behavior so future changes can preserve the expected Canvas workflow contract.

import { afterEach, describe, expect, it, vi } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import {
  buildSubmissionsExportCsv,
  downloadSubmissionsReport,
} from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionExport";

const assignment = institutionSubmissionsData[0]!.assignments[0]!;

describe("buildSubmissionsExportCsv", () => {
  // Verifies: Builds a csv report for missing and late students.
  it("builds a csv report for missing and late students", () => {
    const csv = buildSubmissionsExportCsv(
      assignment,
      assignment.missingSubmissions.slice(0, 1),
      assignment.lateSubmissions.slice(0, 1),
    );

    expect(csv).toContain("CS 101: Programming Assignment 3");
    expect(csv).toContain("status,name,email,last_active,late_by");
    expect(csv).toContain("missing,Alex Thompson,alex.thompson@student.ubc.ca");
    expect(csv).toContain("late,Emma Davis,emma.davis@student.ubc.ca");
  });

  // Verifies: Prefixes spreadsheet formula characters in exported values.
  it("prefixes spreadsheet formula characters in exported values", () => {
    const csv = buildSubmissionsExportCsv(
      assignment,
      [
        {
          id: "formula",
          name: "=CMD()",
          email: "+evil@example.com",
          avatarColor: "bg-sky-500",
        },
      ],
      [],
    );

    expect(csv).toContain("missing,'=CMD(),'+evil@example.com");
  });

  it("quotes values that contain commas or newlines", () => {
    const csv = buildSubmissionsExportCsv(
      assignment,
      [
        {
          id: "comma",
          name: 'Student, Jr.',
          email: "student@example.com",
          avatarColor: "bg-sky-500",
        },
      ],
      [],
    );

    expect(csv).toContain('"Student, Jr."');
  });
});

describe("downloadSubmissionsReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads a csv report in the browser", () => {
    const click = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const link = {
      href: "",
      download: "",
      style: { display: "" },
      click,
    } as unknown as HTMLAnchorElement;
    const createElement = vi
      .spyOn(document, "createElement")
      .mockReturnValue(link);
    const appendChild = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation(() => link);
    const removeChild = vi
      .spyOn(document.body, "removeChild")
      .mockImplementation(() => link);

    downloadSubmissionsReport(
      assignment,
      assignment.missingSubmissions.slice(0, 1),
      [],
    );

    expect(createObjectURL).toHaveBeenCalled();
    expect(link.download).toBe(`${assignment.id}-submissions-report.csv`);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(link);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    createElement.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
    vi.unstubAllGlobals();
  });
});
