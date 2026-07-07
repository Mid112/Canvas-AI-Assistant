import type { InstructorCourse } from "@/types/course";

export interface InstructorCourseLayoutContextValue {
  localCourseId: number;
  course: InstructorCourse | null;
  canvasUrl: string | undefined;
  isLoading: boolean;
  loadError: string | null;
  needsCanvasConnection: boolean;
  embedded: boolean;
}

export type InstructorCourseOutletContext =
  InstructorCourseLayoutContextValue;
