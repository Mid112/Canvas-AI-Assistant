// Test note: covers the institution context.test behavior so future changes can preserve the expected Canvas workflow contract.

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/contexts/AuthContext";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";
import { useInstitution } from "@/contexts/useInstitution";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InstitutionProvider>{children}</InstitutionProvider>
    </AuthProvider>
  );
}

describe("InstitutionContext", () => {
  // Verifies: Defaults to the first institution and exposes its courses.
  // Dashboard metrics stay empty until a successful API fetch (tickets 26/39).
  it("defaults to the first institution and exposes its courses", () => {
    const { result } = renderHook(() => useInstitution(), { wrapper });

    expect(result.current.selectedInstitution.id).toBe("ubc");
    expect(result.current.courses).toHaveLength(6);
    expect(result.current.analytics.averagePerformance).toBe(78);
    expect(result.current.dashboard.metrics.totalStudents).toBe(0);
    expect(result.current.dashboard.metrics.missingSubmissions).toBe(0);
    expect(result.current.dashboard.activeCourses).toEqual([]);
  });

  // Verifies: Switches courses and analytics when the institution changes.
  // Dashboard remains empty defaults (no seed fallback) when the API is unused.
  it("switches courses and analytics when the institution changes", () => {
    const { result } = renderHook(() => useInstitution(), { wrapper });

    act(() => {
      result.current.setSelectedInstitution("ubco");
    });

    expect(result.current.selectedInstitution.id).toBe("ubco");
    expect(result.current.courses).toHaveLength(3);
    expect(result.current.courses[0]?.code).toBe("COSC 111");
    expect(result.current.analytics.averagePerformance).toBe(72);
    expect(result.current.dashboard.metrics.totalStudents).toBe(0);
    expect(result.current.dashboard.metrics.missingSubmissions).toBe(0);
    expect(result.current.dashboard.activeCourses).toEqual([]);
  });
});
