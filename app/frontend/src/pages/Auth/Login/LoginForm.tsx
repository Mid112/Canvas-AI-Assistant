import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { paths } from "@/routes/paths";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidEmail } from "@/lib/validation";
import { PasswordInput } from "@/pages/Auth/PasswordInput";
import {
  passwordMismatchInputClassName,
  passwordValidInputClassName,
} from "@/pages/Auth/PasswordMismatchAlert";

interface LoginFormProps {
  onSubmit: (credentials: { email: string; password: string }) => void | Promise<void>;
  error?: string | null;
  isSubmitting?: boolean;
}

export function LoginForm({
  onSubmit,
  error = null,
  isSubmitting = false,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const trimmedEmail = email.trim();
  const showEmailError = trimmedEmail !== "" && !isValidEmail(trimmedEmail);
  const isFormComplete = isValidEmail(trimmedEmail) && password !== "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete || isSubmitting) {
      return;
    }

    await onSubmit({ email: trimmedEmail, password });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-semibold text-foreground"
        >
          Email Address
        </label>
        <Input
          id="email"
          type="email"
          placeholder="professor@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={showEmailError}
          className={cn(
            "h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground",
            showEmailError && passwordMismatchInputClassName,
            isValidEmail(trimmedEmail) && passwordValidInputClassName,
          )}
        />
      </div>

      {showEmailError && (
        <p className="text-sm text-destructive" role="alert">
          Enter a valid email address
        </p>
      )}

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-semibold text-foreground"
        >
          Password
        </label>
        <PasswordInput
          id="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={cn(
            "h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground",
            password !== "" && passwordValidInputClassName,
          )}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            aria-label="Remember me"
            className={cn(
              "size-4 rounded border-input text-primary",
              "focus:ring-2 focus:ring-primary/20 focus:ring-offset-0",
            )}
          />
          <span className="text-sm text-muted-foreground">Remember me</span>
        </label>
        <Link
          to={paths.resetPassword}
          className="text-sm font-medium text-primary hover:underline"
        >
          Forgot password?
        </Link>
      </div>

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
        {isSubmitting ? "Signing In..." : "Sign In"}
      </Button>
    </form>
  );
}
