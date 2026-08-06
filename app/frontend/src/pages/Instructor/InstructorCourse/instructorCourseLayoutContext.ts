// Instructor page note: coordinates instructor course layout context UI state with Canvas-backed services and active-course context.

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
