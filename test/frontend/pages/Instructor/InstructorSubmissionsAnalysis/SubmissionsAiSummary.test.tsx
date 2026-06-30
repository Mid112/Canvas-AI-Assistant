import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { SubmissionsAiSummary } from "@/pages/Instructor/InstructorSubmissionsAnalysis/SubmissionsAiSummary";

const summary = institutionSubmissionsData[0]!.assignments[0]!.aiSummary;

describe("SubmissionsAiSummary", () => {
  it("renders the AI summary sections and regenerate action", () => {
    render(<SubmissionsAiSummary summary={summary} />);

    expect(screen.getByText("AI-Generated Summary")).toBeInTheDocument();
    expect(screen.getByText("Key Insights")).toBeInTheDocument();
    expect(screen.getByText(summary.keyInsights)).toBeInTheDocument();
    expect(screen.getByText("Recommendation")).toBeInTheDocument();
    expect(screen.getByText(summary.recommendation)).toBeInTheDocument();
    expect(screen.getByText("Late Submission Trends")).toBeInTheDocument();
    expect(screen.getByText(summary.lateSubmissionsNote)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate Summary" }),
    ).toBeDisabled();
  });
});
