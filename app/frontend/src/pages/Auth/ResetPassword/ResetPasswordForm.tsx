import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/validation";

interface ResetPasswordFormProps {
  onSubmit: (email: string) => void | Promise<void>;
  error?: string | null;
  isSubmitting?: boolean;
}

export function ResetPasswordForm({
  onSubmit,
  error = null,
  isSubmitting = false,
}: ResetPasswordFormProps) {
  const [email, setEmail] = useState("");

  const trimmedEmail = email.trim();
  const showEmailError = trimmedEmail !== "" && !isValidEmail(trimmedEmail);
  const isFormComplete = isValidEmail(trimmedEmail);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete || isSubmitting) {
      return;
    }

    await onSubmit(trimmedEmail);
  };

  return (
    <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-2">
        <label
          htmlFor="reset-email"
          className="text-sm font-semibold text-foreground"
        >
          Email Address
        </label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="reset-email"
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={showEmailError}
            disabled={isSubmitting}
            className="h-11 rounded-lg border-border bg-card pr-3.5 pl-10 text-foreground shadow-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {showEmailError && (
        <p className="text-sm text-destructive" role="alert">
          Enter a valid email address
        </p>
      )}

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
        {isSubmitting ? "Sending..." : "Send Reset Link"}
      </Button>
    </form>
  );
}
