import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstructorSubmissionsAnalysisHeader } from "@/pages/Instructor/InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisHeader";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

describe("InstructorSubmissionsAnalysisHeader", () => {
  it("renders the page title, institution context, and actions", () => {
    renderWithInstitution(
      <InstructorSubmissionsAnalysisHeader onExportReport={() => undefined} />,
    );

    expect(
      screen.getByRole("heading", { name: "Missing Submissions Analysis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Track and manage incomplete assignments at UBC\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export Report" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Generate Reminder" }),
    ).toHaveAttribute("href", "/instructor/assistant");
  });
});
