import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/validation";

interface ResetPasswordFormProps {
  onSubmit: (email: string) => void | Promise<void>;
}

export function ResetPasswordForm({ onSubmit }: ResetPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const trimmedEmail = email.trim();
  const showEmailError = trimmedEmail !== "" && !isValidEmail(trimmedEmail);
  const isFormComplete = isValidEmail(trimmedEmail);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete) {
      return;
    }

    await onSubmit(trimmedEmail);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm leading-relaxed text-[#475569]" role="status">
          If an account exists for{" "}
          <span className="font-semibold text-[#1e293b]">{trimmedEmail}</span>,
          we sent a password reset link. Check your inbox and follow the
          instructions.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label
          htmlFor="reset-email"
          className="text-sm font-semibold text-[#1e293b]"
        >
          Email Address
        </label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#94a3b8]"
            aria-hidden="true"
          />
          <Input
            id="reset-email"
            type="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border-[#e2e8f0] bg-white pr-3.5 pl-10 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]"
          />
        </div>
      </div>

      {showEmailError && (
        <p className="text-sm text-[#dc2626]" role="alert">
          Enter a valid email address
        </p>
      )}

      <Button
        type="submit"
        disabled={!isFormComplete}
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8] disabled:bg-[#cbd5e1] disabled:text-[#94a3b8] disabled:shadow-none disabled:hover:bg-[#cbd5e1]"
      >
        Send Reset Link
      </Button>
    </form>
  );
}
