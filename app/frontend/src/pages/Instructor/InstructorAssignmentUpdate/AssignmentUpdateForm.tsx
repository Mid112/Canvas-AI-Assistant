import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import type { Assignment, AssignmentFormValues } from "@/types/assignment";

import {
  assignmentUpdateSchema,
  type AssignmentUpdateFormSchema,
} from "./assignmentUpdateSchema";

interface AssignmentUpdateFormProps {
  assignment: Assignment;
  defaultValues: AssignmentFormValues;
  submitError?: string | null;
  onPreview: (values: AssignmentFormValues) => void;
}

export function AssignmentUpdateForm({
  assignment,
  defaultValues,
  submitError,
  onPreview,
}: AssignmentUpdateFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssignmentUpdateFormSchema>({
    resolver: zodResolver(assignmentUpdateSchema),
    defaultValues,
    mode: "onBlur",
  });

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Assignment Details</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onPreview)} noValidate>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="assignment-id">Assignment ID</Label>
            <Input
              id="assignment-id"
              value={String(assignment.id)}
              readOnly
              disabled
              aria-readonly="true"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-title">Assignment title</Label>
            <Input
              id="assignment-title"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "assignment-title-error" : undefined}
              {...register("name")}
            />
            {errors.name ? (
              <p
                id="assignment-title-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-description">Assignment description</Label>
            <Textarea
              id="assignment-description"
              rows={6}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? "assignment-description-error" : undefined
              }
              {...register("description")}
            />
            {errors.description ? (
              <p
                id="assignment-description-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-due-date">Due date</Label>
            <Input
              id="assignment-due-date"
              type="datetime-local"
              aria-invalid={Boolean(errors.dueDate)}
              aria-describedby={errors.dueDate ? "assignment-due-date-error" : undefined}
              {...register("dueDate")}
            />
            <p className="text-sm text-muted-foreground">
              Current due date: {formatDueDateForDisplay(assignment.due_at)}
            </p>
            {errors.dueDate ? (
              <p
                id="assignment-due-date-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.dueDate.message}
              </p>
            ) : null}
          </div>

          {submitError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end border-t bg-transparent">
          <Button type="submit" disabled={isSubmitting}>
            Preview Changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
