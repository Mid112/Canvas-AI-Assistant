import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  confirmDryRunPreview,
  DryRunPreviewError,
  fetchDryRunPreview,
} from "@/services/dryRunPreview";
import { mockStudentReminderPreview } from "@/data/mockDryRunPreview";

describe("dryRunPreview service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns mock preview data after delay", async () => {
    const promise = fetchDryRunPreview(mockStudentReminderPreview.id);
    await vi.advanceTimersByTimeAsync(600);
    const preview = await promise;

    expect(preview.id).toBe(mockStudentReminderPreview.id);
    expect(preview.originalRequest).toContain("Programming Assignment 3");
  });

  it("throws when preview id is empty", async () => {
    const promise = fetchDryRunPreview("empty");
    const assertion = expect(promise).rejects.toBeInstanceOf(DryRunPreviewError);
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it("confirms a workflow with a success message", async () => {
    const promise = confirmDryRunPreview(mockStudentReminderPreview.id);
    await vi.advanceTimersByTimeAsync(1200);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.message).toContain("approved");
  });
});
