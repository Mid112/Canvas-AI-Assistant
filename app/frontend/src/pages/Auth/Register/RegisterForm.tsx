import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/validation";
import type { RegisterCredentials } from "@/types/auth";

interface RegisterFormProps {
  onSubmit: (credentials: RegisterCredentials) => void | Promise<void>;
  error?: string | null;
  isSubmitting?: boolean;
}

const inputClassName =
  "h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground";

const labelClassName = "text-sm font-semibold text-foreground";

export function RegisterForm({
  onSubmit,
  error = null,
  isSubmitting = false,
}: RegisterFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const trimmedEmail = email.trim();
  const showEmailError = trimmedEmail !== "" && !isValidEmail(trimmedEmail);
  const showPasswordError = password !== "" && !isValidPassword(password);
  const passwordsMatch = password === confirmPassword;
  const showPasswordMismatchError =
    confirmPassword !== "" && !passwordsMatch;

  const hasRequiredFields =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    isValidEmail(trimmedEmail) &&
    isValidPassword(password) &&
    confirmPassword !== "" &&
    passwordsMatch;

  const isFormComplete = hasRequiredFields && acceptedTerms;
  const showTermsReminder = hasRequiredFields && !acceptedTerms;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete || isSubmitting) {
      return;
    }

    await onSubmit({
      name: [firstName.trim(), lastName.trim()].join(" "),
      email: trimmedEmail,
      password,
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="first-name" className={labelClassName}>
            First Name
          </label>
          <Input
            id="first-name"
            type="text"
            placeholder="Jane"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClassName}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="last-name" className={labelClassName}>
            Last Name
          </label>
          <Input
            id="last-name"
            type="text"
            placeholder="Smith"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className={labelClassName}>
          Email Address
        </label>
        <Input
          id="email"
          type="email"
          placeholder="professor@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={showEmailError}
          className={inputClassName}
        />
      </div>

      {showEmailError && (
        <p className="text-sm text-destructive" role="alert">
          Enter a valid email address
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="password" className={labelClassName}>
          Password
        </label>
        <Input
          id="password"
          type="password"
          placeholder="Create a strong password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={showPasswordError}
          className={inputClassName}
        />
      </div>

      {showPasswordError && (
        <p className="text-sm text-destructive" role="alert">
          Password must be at least {MIN_PASSWORD_LENGTH} characters
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="confirm-password" className={labelClassName}>
          Confirm Password
        </label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={showPasswordMismatchError}
          aria-describedby={
            showPasswordMismatchError ? "confirm-password-mismatch" : undefined
          }
          className={inputClassName}
        />
        {/* Ticket 27 / #1451: keep mismatch feedback next to the confirm field
            so users can tell which value to correct before submit. */}
        {showPasswordMismatchError ? (
          <p
            id="confirm-password-mismatch"
            className="text-sm text-destructive"
            role="alert"
          >
            Confirm password must match the password above
          </p>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          aria-label="I agree to the Terms of Service and Privacy Policy"
          className={cn(
            "mt-0.5 size-4 shrink-0 rounded border-input text-primary",
            "focus:ring-2 focus:ring-primary/20 focus:ring-offset-0",
          )}
        />
        <span className="text-sm text-muted-foreground">
          I agree to the{" "}
          <Link
            to="#terms"
            className="font-medium text-primary hover:underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            to="#privacy"
            className="font-medium text-primary hover:underline"
          >
            Privacy Policy
          </Link>
        </span>
      </label>

      {showTermsReminder && (
        <p className="text-sm text-muted-foreground" role="status">
          Accept the Terms of Service and Privacy Policy to continue.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={!isFormComplete || isSubmitting}
        className="h-11 w-full text-base font-semibold"
      >
        {isSubmitting ? "Creating Account..." : "Create Account"}
      </Button>
    </form>
  );
}
