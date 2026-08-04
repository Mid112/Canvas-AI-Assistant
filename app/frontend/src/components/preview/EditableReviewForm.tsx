import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlanField } from "@/types/dryRunPreview";

interface EditableReviewFormProps {
  fields: PlanField[];
  error?: string | null;
  isSaving?: boolean;
  onSave: (changes: Record<string, unknown>) => void;
}

function initialValues(fields: PlanField[]): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((field) => field.editable && !Array.isArray(field.rawValue))
      .map((field) => [field.field, String(field.rawValue ?? "")]),
  );
}

function parseValue(field: PlanField, value: string): unknown {
  if (
    typeof field.rawValue === "number" ||
    ["points_possible", "allowed_attempts", "time_limit"].includes(field.field)
  ) {
    return value.trim() === "" ? null : Number(value);
  }
  return value;
}

export function EditableReviewForm({
  fields,
  error,
  isSaving = false,
  onSave,
}: EditableReviewFormProps) {
  const editableFields = useMemo(
    () => fields.filter((field) => field.editable),
    [fields],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(editableFields),
  );

  if (editableFields.length === 0) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const changes = Object.fromEntries(
      editableFields
        .filter((field) => !Array.isArray(field.rawValue))
        .map((field) => [
          field.field,
          parseValue(field, values[field.field] ?? ""),
        ]),
    );
    onSave(changes);
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Edit before approval
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Changes are validated and regenerate this preview before they can be
          confirmed.
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {editableFields.map((field) => {
            if (Array.isArray(field.rawValue)) {
              return (
                <div key={field.field} className="space-y-1">
                  <Label>{field.label}</Label>
                  <p className="text-sm text-muted-foreground">
                    {field.value}. Use the dedicated editor link in the action
                    card to edit individual items.
                  </p>
                </div>
              );
            }

            const isLongText = ["description", "body", "feedback"].includes(
              field.field,
            );
            const isNumber =
              typeof field.rawValue === "number" ||
              ["points_possible", "allowed_attempts", "time_limit"].includes(
                field.field,
              );

            return (
              <div key={field.field} className="space-y-2">
                <Label htmlFor={`preview-edit-${field.field}`}>
                  {field.label}
                </Label>
                {field.field === "quiz_engine" ? (
                  <select
                    id={`preview-edit-${field.field}`}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={values[field.field] ?? "classic"}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.field]: event.target.value,
                      }))
                    }
                  >
                    <option value="classic">Classic Quiz</option>
                    <option value="new_quizzes">New Quiz</option>
                  </select>
                ) : isLongText ? (
                  <Textarea
                    id={`preview-edit-${field.field}`}
                    rows={4}
                    value={values[field.field] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.field]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id={`preview-edit-${field.field}`}
                    type={isNumber ? "number" : "text"}
                    value={values[field.field] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.field]: event.target.value,
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Regenerating preview..." : "Save & regenerate preview"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
