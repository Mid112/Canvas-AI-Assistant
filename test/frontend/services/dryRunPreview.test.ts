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

  // Verifies: Returns mock preview data after delay.
  it("returns mock preview data after delay", async () => {
    const promise = fetchDryRunPreview(mockStudentReminderPreview.id);
    await vi.advanceTimersByTimeAsync(600);
    const preview = await promise;

    expect(preview.id).toBe(mockStudentReminderPreview.id);
    expect(preview.originalRequest).toContain("Programming Assignment 3");
  });

  // Verifies: Throws when preview id is empty.
  it("throws when preview id is empty", async () => {
    const promise = fetchDryRunPreview("empty");
    const assertion = expect(promise).rejects.toBeInstanceOf(DryRunPreviewError);
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  // Verifies: Ticket 38 — mock confirm never reports Canvas execution success.
  it("rejects mock confirm so Canvas execution is not faked", async () => {
    await expect(
      confirmDryRunPreview(mockStudentReminderPreview.id),
    ).rejects.toBeInstanceOf(DryRunPreviewError);
    await expect(
      confirmDryRunPreview(mockStudentReminderPreview.id),
    ).rejects.toThrow(/cannot execute Canvas actions/i);
  });
});
