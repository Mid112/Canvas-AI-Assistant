// Test note: covers the assistant loading stage.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import {
  ASSISTANT_LOADING_COPY,
  inferAssistantLoadingStage,
  nextAssistantLoadingStage,
} from "@/lib/assistant-loading-stage";

describe("inferAssistantLoadingStage", () => {
  it("infers analyzing for analytics and submission questions", () => {
    expect(inferAssistantLoadingStage("Show missing submissions")).toBe(
      "analyzing",
    );
    expect(inferAssistantLoadingStage("Analyze engagement for my course")).toBe(
      "analyzing",
    );
  });

  it("infers connecting for Canvas write/sync phrasing", () => {
    expect(inferAssistantLoadingStage("Create an assignment named Quiz 1")).toBe(
      "connecting",
    );
    expect(inferAssistantLoadingStage("Publish the course on Canvas")).toBe(
      "connecting",
    );
  });

  it("prefers connecting over analyzing for grade update phrasing", () => {
    // "grade" alone used to win ANALYZE_PATTERN first and show Analyzing…
    expect(inferAssistantLoadingStage("update a grade")).toBe("connecting");
    expect(inferAssistantLoadingStage("Update grades for the midterm")).toBe(
      "connecting",
    );
  });

  it("defaults to thinking for general questions", () => {
    expect(inferAssistantLoadingStage("What can you help me with?")).toBe(
      "thinking",
    );
  });
});

describe("nextAssistantLoadingStage", () => {
  it("advances inferred stages to generating", () => {
    expect(nextAssistantLoadingStage("thinking")).toBe("generating");
    expect(nextAssistantLoadingStage("connecting")).toBe("generating");
    expect(nextAssistantLoadingStage("analyzing")).toBe("generating");
  });

  it("keeps generating once reached", () => {
    expect(nextAssistantLoadingStage("generating")).toBe("generating");
  });
});

describe("ASSISTANT_LOADING_COPY", () => {
  it("provides visible stage labels for each stage", () => {
    expect(ASSISTANT_LOADING_COPY.thinking).toMatch(/Thinking/);
    expect(ASSISTANT_LOADING_COPY.connecting).toMatch(/Canvas/);
    expect(ASSISTANT_LOADING_COPY.analyzing).toMatch(/Analyzing/);
    expect(ASSISTANT_LOADING_COPY.generating).toMatch(/Generating/);
  });
});
