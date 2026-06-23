import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/contexts/AuthContext";
import {
  InstitutionProvider,
  useInstitution,
} from "@/contexts/InstitutionContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InstitutionProvider>{children}</InstitutionProvider>
    </AuthProvider>
  );
}

describe("InstitutionContext", () => {
  it("defaults to the first institution and exposes its courses", () => {
    const { result } = renderHook(() => useInstitution(), { wrapper });

    expect(result.current.selectedInstitution.id).toBe("ubc");
    expect(result.current.courses).toHaveLength(6);
    expect(result.current.analytics.averagePerformance).toBe(78);
    expect(result.current.dashboard.metrics.totalStudents).toBe(156);
  });

  it("switches courses and analytics when the institution changes", () => {
    const { result } = renderHook(() => useInstitution(), { wrapper });

    act(() => {
      result.current.setSelectedInstitution("ubco");
    });

    expect(result.current.selectedInstitution.id).toBe("ubco");
    expect(result.current.courses).toHaveLength(3);
    expect(result.current.courses[0]?.code).toBe("COSC 111");
    expect(result.current.analytics.averagePerformance).toBe(72);
    expect(result.current.dashboard.metrics.totalStudents).toBe(108);
    expect(result.current.dashboard.activeCourses[0]?.code).toBe("COSC 111");
  });
});
