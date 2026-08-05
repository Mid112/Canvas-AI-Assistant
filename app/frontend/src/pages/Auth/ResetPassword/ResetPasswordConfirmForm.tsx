import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ResetPasswordConfirmFormProps {
  onSubmit: (password: string) => void | Promise<void>;
  error?: string | null;
  isSubmitting?: boolean;
}

export function ResetPasswordConfirmForm({
  onSubmit,
  error = null,
  isSubmitting = false,
}: ResetPasswordConfirmFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordsMatch = password === confirmPassword;
  const showPasswordLengthError = password !== "" && password.length < 8;
  const showMismatch =
    confirmPassword !== "" && password !== "" && !passwordsMatch;
  const isFormComplete =
    password.length >= 8 && confirmPassword.length >= 8 && passwordsMatch;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete || isSubmitting) {
      return;
    }

    await onSubmit(password);
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <label
          htmlFor="reset-new-password"
          className="text-sm font-semibold text-foreground"
        >
          New Password
        </label>
        <Input
          id="reset-new-password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={showPasswordLengthError}
          aria-describedby={
            showPasswordLengthError ? "reset-password-length" : undefined
          }
          disabled={isSubmitting}
          className="h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground"
        />
        {showPasswordLengthError ? (
          <p
            id="reset-password-length"
            className="text-sm text-destructive"
            role="alert"
          >
            Password must be at least 8 characters.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="reset-confirm-password"
          className="text-sm font-semibold text-foreground"
        >
          Confirm Password
        </label>
        <Input
          id="reset-confirm-password"
          type="password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={showMismatch}
          aria-describedby={
            showMismatch ? "reset-confirm-password-mismatch" : undefined
          }
          disabled={isSubmitting}
          className="h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground"
        />
        {/* Ticket 27 / #1451: mismatch feedback stays under Confirm Password. */}
        {showMismatch ? (
          <p
            id="reset-confirm-password-mismatch"
            className="text-sm text-destructive"
            role="alert"
          >
            Confirm password must match the password above
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={!isFormComplete || isSubmitting}
        className="h-11 w-full text-base font-semibold"
      >
        {isSubmitting ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
}
