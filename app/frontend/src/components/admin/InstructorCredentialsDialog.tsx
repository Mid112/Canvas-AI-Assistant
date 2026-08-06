// Admin UI note: presents instructor credentials dialog controls for institution/admin workflows with service-backed state.

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export interface CreatedInstructorCredentials {
  fullName: string;
  email: string;
  temporaryPassword: string;
}

interface InstructorCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: CreatedInstructorCredentials | null;
}

export function InstructorCredentialsDialog({
  open,
  onOpenChange,
  credentials,
}: InstructorCredentialsDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!credentials) {
      return;
    }

    const text = `Email: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — credentials are
      // still visible in the dialog to copy by hand.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setCopied(false);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Instructor account created</DialogTitle>
          <DialogDescription>
            Share these sign-in details with {credentials?.fullName ?? "the new instructor"} now
            — this password won&apos;t be shown again after you close this dialog.
          </DialogDescription>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium">{credentials.email}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Temporary password</Label>
              <p className="font-mono text-sm font-medium">
                {credentials.temporaryPassword}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => void handleCopy()}>
            {copied ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden="true" />
                Copy credentials
              </>
            )}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
