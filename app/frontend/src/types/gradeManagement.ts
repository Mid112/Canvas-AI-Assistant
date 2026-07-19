import type { ApiSubmission } from "@/types/submission";

export interface GradeUpdatePayload {
  assignment_id: number;
  user_id: number;
  posted_grade: string;
  reason?: string | null;
  current_submission?: ApiSubmission;
}

export interface GradePreview {
  action: "update_grade";
  risk_level: "high";
  requires_approval: boolean;
  irreversible_warning: string;
  rollback_available: boolean;
  rollback_message: string;
  summary: string;
  current: {
    grade: string | null;
    score: number | null;
    status: string;
    student_name: string | null;
    student_canvas_id: number;
  };
  proposed: {
    posted_grade: string;
    reason: string | null;
  };
  affected_resources: Array<{
    type: string;
    id: number | string | null;
    name: string;
    status: string;
    changed_fields?: string[];
  }>;
}

export interface GradeUpdateResult extends GradePreview {
  submitted: boolean;
  history_id: number | null;
  canvas_submission: ApiSubmission;
}
