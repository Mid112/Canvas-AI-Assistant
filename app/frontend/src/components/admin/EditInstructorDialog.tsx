import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InstructorForm } from "@/components/admin/InstructorForm";
import type { EditInstructorFormValues } from "@/schemas/instructorSchema";
import type { Instructor } from "@/types/instructor";

interface EditInstructorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Instructor | null;
  serverError?: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: EditInstructorFormValues) => void;
}

export function EditInstructorDialog({
  open,
  onOpenChange,
  instructor,
  serverError = null,
  isSubmitting = false,
  onSubmit,
}: EditInstructorDialogProps) {
  if (!instructor) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit instructor account</DialogTitle>
          <DialogDescription>
            Update this instructor&apos;s account details.
          </DialogDescription>
        </DialogHeader>

        <InstructorForm
          key={`${instructor.id}-${open ? "open" : "closed"}`}
          mode="edit"
          defaultValues={{
            firstName: instructor.firstName,
            lastName: instructor.lastName,
            email: instructor.email,
          }}
          serverError={serverError}
          isSubmitting={isSubmitting}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
