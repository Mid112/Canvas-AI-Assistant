import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isValidPassword } from "@/lib/validation";
import { PasswordInput } from "@/pages/Auth/PasswordInput";
import {
  PasswordMatchStatus,
  PasswordMismatchAlert,
} from "@/pages/Auth/PasswordMismatchAlert";
import {
  passwordMismatchInputClassName,
  passwordValidInputClassName,
} from "@/pages/Auth/passwordFieldStyles";
import { PasswordRequirementsChecklist } from "@/pages/Auth/PasswordRequirementsChecklist";

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

  const passwordIsValid = isValidPassword(password);
  const passwordsMatch = password === confirmPassword;
  const passwordIsInvalid = password !== "" && !passwordIsValid;
  const showMismatch =
    confirmPassword !== "" && password !== "" && !passwordsMatch;
  const showConfirmPasswordValid =
    confirmPassword !== "" && passwordsMatch && passwordIsValid;
  const isFormComplete =
    passwordIsValid && confirmPassword !== "" && passwordsMatch;

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
        <PasswordInput
          id="reset-new-password"
          placeholder="Create a strong password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={passwordIsInvalid}
          aria-describedby="reset-password-requirements"
          autoComplete="new-password"
          disabled={isSubmitting}
          className={cn(
            "h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground",
            passwordIsValid && passwordValidInputClassName,
          )}
        />
        <PasswordRequirementsChecklist
          id="reset-password-requirements"
          password={password}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="reset-confirm-password"
          className="text-sm font-semibold text-foreground"
        >
          Confirm Password
        </label>
        <PasswordInput
          id="reset-confirm-password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={showMismatch}
          aria-describedby={
            showMismatch
              ? "reset-confirm-password-mismatch"
              : showConfirmPasswordValid
                ? "reset-confirm-password-match"
                : undefined
          }
          autoComplete="new-password"
          disabled={isSubmitting}
          className={cn(
            "h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground",
            showMismatch && passwordMismatchInputClassName,
            showConfirmPasswordValid && passwordValidInputClassName,
          )}
        />
        {/* Ticket 27 / #1451: mismatch/match feedback under Confirm Password. */}
        {showMismatch ? (
          <PasswordMismatchAlert id="reset-confirm-password-mismatch" />
        ) : null}
        {showConfirmPasswordValid ? (
          <PasswordMatchStatus id="reset-confirm-password-match" />
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
