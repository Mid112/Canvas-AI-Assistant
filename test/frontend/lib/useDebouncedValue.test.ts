import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useDebouncedValue } from "@/lib/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      {
        initialProps: { value: "initial", delay: 500 },
      },
    );

    expect(result.current).toBe("initial");
  });

  it("updates the value after the delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      {
        initialProps: { value: "first", delay: 500 },
      },
    );

    rerender({ value: "second", delay: 500 });

    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe("second");
  });

  it("resets the timer when the value changes again", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      {
        initialProps: { value: "first", delay: 500 },
      },
    );

    rerender({ value: "second", delay: 500 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    rerender({ value: "third", delay: 500 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe("third");
  });

  it("uses the latest delay when it changes", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      {
        initialProps: { value: "first", delay: 500 },
      },
    );

    rerender({ value: "second", delay: 1000 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe("first");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe("second");
  });
});
