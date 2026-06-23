import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  getStoredInstitutionId,
  setStoredInstitutionId,
} from "@/lib/institution-storage";
import {
  getInstitutionData,
  institutions,
} from "@/data/institutionCourseData";
import type {
  CourseAnalyticsOverview,
  InstructorCourse,
} from "@/types/course";
import type { Institution } from "@/types/institution";

interface InstitutionContextValue {
  institutions: Institution[];
  selectedInstitution: Institution;
  setSelectedInstitution: (institutionId: string) => void;
  courses: InstructorCourse[];
  analytics: CourseAnalyticsOverview;
}

const InstitutionContext = createContext<InstitutionContextValue | null>(null);

const DEFAULT_INSTITUTION_ID = institutions[0]?.id ?? "ubc";

function resolveInstitutionId(userId: number | undefined): string {
  if (userId) {
    const storedId = getStoredInstitutionId(userId);
    if (storedId && institutions.some((institution) => institution.id === storedId)) {
      return storedId;
    }
  }

  return DEFAULT_INSTITUTION_ID;
}

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(() =>
    resolveInstitutionId(user?.id),
  );
  const [prevUserId, setPrevUserId] = useState(user?.id);

  if (user?.id !== prevUserId) {
    setPrevUserId(user?.id);
    setSelectedInstitutionId(resolveInstitutionId(user?.id));
  }

  const setSelectedInstitution = useCallback(
    (institutionId: string) => {
      if (!institutions.some((institution) => institution.id === institutionId)) {
        return;
      }

      setSelectedInstitutionId(institutionId);

      if (user) {
        setStoredInstitutionId(user.id, institutionId);
      }
    },
    [user],
  );

  const selectedInstitution = useMemo(
    () =>
      institutions.find((institution) => institution.id === selectedInstitutionId) ??
      institutions[0]!,
    [selectedInstitutionId],
  );

  const institutionData = useMemo(
    () => getInstitutionData(selectedInstitution.id),
    [selectedInstitution.id],
  );

  const value = useMemo<InstitutionContextValue>(
    () => ({
      institutions,
      selectedInstitution,
      setSelectedInstitution,
      courses: institutionData?.courses ?? [],
      analytics: institutionData?.analytics ?? {
        averagePerformance: 0,
        averagePerformanceTrend: 0,
        activeStudents: 0,
        totalStudents: 0,
        completedAssignments: 0,
        completedAssignmentsTrend: 0,
        atRiskStudents: 0,
        atRiskStudentsTrend: 0,
      },
    }),
    [institutionData, selectedInstitution, setSelectedInstitution],
  );

  return (
    <InstitutionContext.Provider value={value}>
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitution(): InstitutionContextValue {
  const context = useContext(InstitutionContext);

  if (!context) {
    throw new Error("useInstitution must be used within an InstitutionProvider");
  }

  return context;
}
