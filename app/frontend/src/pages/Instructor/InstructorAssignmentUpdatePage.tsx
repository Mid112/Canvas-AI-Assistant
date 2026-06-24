import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignmentToFormValues,
  formValuesToUpdatePayload,
  hasAssignmentChanges,
} from "@/lib/assignment-utils";
import { AssignmentUpdateForm } from "@/pages/Instructor/InstructorAssignmentUpdate/AssignmentUpdateForm";
import { AssignmentUpdatePreview } from "@/pages/Instructor/InstructorAssignmentUpdate/AssignmentUpdatePreview";
import { paths } from "@/routes/paths";
import {
  AssignmentApiError,
  fetchAssignment,
  updateAssignment,
} from "@/services/assignments";
import type { Assignment, AssignmentFormValues } from "@/types/assignment";

type PageMode = "edit" | "preview";

export function InstructorAssignmentUpdatePage() {
  const { localCourseId, assignmentId } = useParams();
  const { accessToken, user } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [formValues, setFormValues] = useState<AssignmentFormValues | null>(null);
  const [mode, setMode] = useState<PageMode>("edit");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedLocalCourseId = Number(localCourseId);
  const parsedAssignmentId = Number(assignmentId);
  const idsAreValid =
    Number.isInteger(parsedLocalCourseId) &&
    parsedLocalCourseId > 0 &&
    Number.isInteger(parsedAssignmentId) &&
    parsedAssignmentId > 0;

  useEffect(() => {
    if (!accessToken || !idsAreValid || !user?.has_canvas_token) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadAssignment() {
      try {
        const data = await fetchAssignment(
          parsedLocalCourseId,
          parsedAssignmentId,
          token,
        );

        if (cancelled) {
          return;
        }

        setAssignment(data);
        setFormValues(assignmentToFormValues(data));
        setMode("edit");
        setLoadError(null);
        setSuccessMessage(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof AssignmentApiError
            ? error.message
            : "Unable to load assignment details.";
        setLoadError(message);
        setAssignment(null);
        setFormValues(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    // Fetch-on-mount is intentional for assignment details loaded from Canvas.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load
    setIsLoading(true);
    void loadAssignment();

    return () => {
      cancelled = true;
    };
  }, [accessToken, idsAreValid, parsedAssignmentId, parsedLocalCourseId, user?.has_canvas_token]);

  const retryLoad = async () => {
    if (!accessToken || !idsAreValid || !user?.has_canvas_token) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setSuccessMessage(null);

    try {
      const data = await fetchAssignment(
        parsedLocalCourseId,
        parsedAssignmentId,
        accessToken,
      );
      setAssignment(data);
      setFormValues(assignmentToFormValues(data));
      setMode("edit");
    } catch (error) {
      const message =
        error instanceof AssignmentApiError
          ? error.message
          : "Unable to load assignment details.";
      setLoadError(message);
      setAssignment(null);
      setFormValues(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = (values: AssignmentFormValues) => {
    if (!assignment) {
      return;
    }

    setSubmitError(null);
    setSuccessMessage(null);

    if (!hasAssignmentChanges(assignment, values)) {
      setSubmitError("Update at least one field before previewing changes.");
      return;
    }

    setFormValues(values);
    setMode("preview");
  };

  const handleCancelPreview = () => {
    setSubmitError(null);
    setMode("edit");
  };

  const handleConfirm = async () => {
    if (!assignment || !formValues || !accessToken) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateAssignment(
        parsedLocalCourseId,
        parsedAssignmentId,
        formValuesToUpdatePayload(formValues),
        accessToken,
      );
      setAssignment(updated);
      setFormValues(assignmentToFormValues(updated));
      setMode("edit");
      setSuccessMessage("Assignment updated successfully.");
    } catch (error) {
      const message =
        error instanceof AssignmentApiError
          ? error.message
          : "Unable to update assignment.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!idsAreValid) {
    return (
      <PageState
        title="Invalid assignment link"
        message="The course or assignment ID in this URL is not valid."
        action={
          <Link
            to={paths.instructor.courses}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
          >
            Back to courses
          </Link>
        }
      />
    );
  }

  if (!user?.has_canvas_token) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Update Assignment
          </h1>
        </div>
        <CanvasConnectionRequired />
      </div>
    );
  }

  if (isLoading) {
    return (
      <PageState
        title="Loading assignment"
        message="Fetching the latest assignment details from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (loadError || !assignment || !formValues) {
    return (
      <PageState
        title="Unable to load assignment"
        message={loadError ?? "Assignment details could not be loaded."}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void retryLoad()}>Try again</Button>
            <Link
              to={paths.instructor.courses}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              Back to courses
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Update Assignment
        </h1>
        <p className="text-muted-foreground">
          Edit assignment details, preview your changes, and confirm before
          updating Canvas.
        </p>
      </div>

      {successMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {successMessage}
        </p>
      ) : null}

      {mode === "edit" ? (
        <AssignmentUpdateForm
          assignment={assignment}
          defaultValues={formValues}
          submitError={submitError}
          onPreview={handlePreview}
        />
      ) : (
        <AssignmentUpdatePreview
          assignment={assignment}
          proposedValues={formValues}
          isSubmitting={isSubmitting}
          submitError={submitError}
          onConfirm={() => void handleConfirm()}
          onCancel={handleCancelPreview}
        />
      )}
    </div>
  );
}

function PageState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <div className="flex items-center gap-3">
            {icon}
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
          {action}
        </CardContent>
      </Card>
    </div>
  );
}
