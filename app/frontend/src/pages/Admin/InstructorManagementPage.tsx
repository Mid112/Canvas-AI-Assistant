import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminToast } from "@/components/admin/AdminToast";
import { ConfirmationDialog } from "@/components/admin/ConfirmationDialog";
import { CreateInstructorDialog } from "@/components/admin/CreateInstructorDialog";
import { EditInstructorDialog } from "@/components/admin/EditInstructorDialog";
import { InstructorSearch } from "@/components/admin/InstructorSearch";
import { InstructorTable } from "@/components/admin/InstructorTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { filterInstructors } from "@/data/mockInstructors";
import type { EditInstructorFormValues, InstructorFormValues } from "@/schemas/instructorSchema";
import {
  createInstructor,
  disableInstructor,
  enableInstructor,
  fetchInstructors,
  revokeInstructorAccess,
  updateInstructor,
} from "@/services/instructorAccounts";
import {
  getInstructorFullName,
  type Instructor,
  type InstructorConfirmAction,
} from "@/types/instructor";

type ConfirmDialogState = {
  action: InstructorConfirmAction;
  instructor: Instructor;
};

type ToastState = {
  type: "success" | "error";
  message: string;
};

export function InstructorManagementPage() {
  const { accessToken } = useAuth();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const loadRequestId = useRef(0);

  const filteredInstructors = useMemo(
    () => filterInstructors(instructors, searchQuery),
    [instructors, searchQuery],
  );

  const refreshInstructors = useCallback(async (options?: { showLoading?: boolean }) => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;

    if (options?.showLoading) {
      setIsLoading(true);
      setLoadError(null);
    }

    try {
      if (!accessToken) {
        throw new Error("You must be signed in to manage instructors.");
      }

      const data = await fetchInstructors(accessToken);
      if (loadRequestId.current === requestId) {
        setInstructors(data);
        setLoadError(null);
      }
    } catch {
      if (loadRequestId.current === requestId) {
        setLoadError("Unable to load instructor accounts. Please try again.");
        setInstructors([]);
      }
    } finally {
      if (loadRequestId.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setIsLoading(false);
      setLoadError("You must be signed in to manage instructors.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchInstructors(accessToken);
        if (!cancelled) {
          setInstructors(data);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load instructor accounts. Please try again.");
          setInstructors([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const showToast = (message: string, type: ToastState["type"] = "success") => {
    setToast({ message, type });
  };

  const handleCreate = async (values: InstructorFormValues) => {
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (!accessToken) {
        throw new Error("You must be signed in to manage instructors.");
      }

      await createInstructor(accessToken, values);
      await refreshInstructors();
      setIsCreateOpen(false);
      showToast("Instructor account created successfully.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create instructor account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (values: EditInstructorFormValues) => {
    if (!editingInstructor) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (!accessToken) {
        throw new Error("You must be signed in to manage instructors.");
      }

      await updateInstructor(accessToken, editingInstructor.id, values);
      await refreshInstructors();
      setEditingInstructor(null);
      showToast("Instructor account updated successfully.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to update instructor account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog) {
      return;
    }

    setIsSubmitting(true);

    const { action, instructor } = confirmDialog;
    const fullName = getInstructorFullName(instructor);

    try {
      if (!accessToken) {
        throw new Error("You must be signed in to manage instructors.");
      }

      if (action === "enable") {
        await enableInstructor(accessToken, instructor.id);
        showToast(`${fullName} has been enabled.`);
      } else if (action === "disable") {
        await disableInstructor(accessToken, instructor.id);
        showToast(`${fullName} has been disabled.`);
      } else {
        await revokeInstructorAccess(accessToken, instructor.id);
        showToast(`${fullName}'s access has been revoked.`);
      }

      await refreshInstructors();
      setConfirmDialog(null);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Unable to complete this action.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmCopy = confirmDialog
    ? {
        enable: {
          title: "Enable instructor account",
          description: `Enable ${getInstructorFullName(confirmDialog.instructor)}'s account? They will regain access to the application.`,
          confirmLabel: "Enable account",
          variant: "default" as const,
        },
        disable: {
          title: "Disable instructor account",
          description: `Disable ${getInstructorFullName(confirmDialog.instructor)}'s account? They will lose access to the application and will no longer be able to log in.`,
          confirmLabel: "Disable account",
          variant: "destructive" as const,
        },
        revoke: {
          title: "Revoke instructor access",
          description: `Revoke access for ${getInstructorFullName(confirmDialog.instructor)}? They will lose access to the application and this account will be removed from the list.`,
          confirmLabel: "Revoke access",
          variant: "destructive" as const,
        },
      }[confirmDialog.action]
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          User Management
        </h1>
        <Button
          type="button"
          onClick={() => {
            setFormError(null);
            setIsCreateOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          New Instructor
        </Button>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit items-center rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
          Instructors ({instructors.length})
        </div>
        <InstructorSearch value={searchQuery} onChange={setSearchQuery} />
      </div>

      <InstructorTable
        instructors={filteredInstructors}
        totalCount={instructors.length}
        isLoading={isLoading}
        errorMessage={loadError}
        onEdit={(instructor) => {
          setFormError(null);
          setEditingInstructor(instructor);
        }}
        onEnable={(instructor) => {
          setConfirmDialog({ action: "enable", instructor });
        }}
        onDisable={(instructor) => {
          setConfirmDialog({ action: "disable", instructor });
        }}
        onRevoke={(instructor) => {
          setConfirmDialog({ action: "revoke", instructor });
        }}
      />

      <CreateInstructorDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setFormError(null);
          }
        }}
        serverError={formError}
        isSubmitting={isSubmitting}
        onSubmit={(values) => void handleCreate(values)}
      />

      <EditInstructorDialog
        open={editingInstructor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingInstructor(null);
            setFormError(null);
          }
        }}
        instructor={editingInstructor}
        serverError={formError}
        isSubmitting={isSubmitting}
        onSubmit={(values) => void handleEdit(values)}
      />

      {confirmCopy ? (
        <ConfirmationDialog
          open={confirmDialog !== null}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmDialog(null);
            }
          }}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          variant={confirmCopy.variant}
          isLoading={isSubmitting}
          onConfirm={() => void handleConfirmAction()}
        />
      ) : null}

      {toast ? (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
