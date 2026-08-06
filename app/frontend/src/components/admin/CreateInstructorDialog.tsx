// Admin UI note: presents create instructor dialog controls for institution/admin workflows with service-backed state.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InstructorForm } from "@/components/admin/InstructorForm";
import type { InstructorFormValues } from "@/schemas/instructorSchema";

interface CreateInstructorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverError?: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: InstructorFormValues) => void;
}

export function CreateInstructorDialog({
  open,
  onOpenChange,
  serverError = null,
  isSubmitting = false,
  onSubmit,
}: CreateInstructorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create instructor account</DialogTitle>
          <DialogDescription>
            Add a new instructor account with a temporary password.
          </DialogDescription>
        </DialogHeader>

        <InstructorForm
          key={open ? "create-open" : "create-closed"}
          mode="create"
          serverError={serverError}
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
