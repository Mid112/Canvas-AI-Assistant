import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useActiveCourse } from "@/contexts/useActiveCourse";

describe("useActiveCourse", () => {
  it("throws when used outside ActiveCourseProvider", () => {
    expect(() => renderHook(() => useActiveCourse())).toThrow(
      "useActiveCourse must be used within an ActiveCourseProvider",
    );
  });
});
