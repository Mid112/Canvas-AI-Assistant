import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RegisterCredentials } from "@/types/auth";

interface RegisterFormProps {
  onSubmit: (credentials: RegisterCredentials) => void | Promise<void>;
  isSubmitting?: boolean;
}

const inputClassName =
  "h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]";

const labelClassName = "text-sm font-semibold text-[#1e293b]";

export function RegisterForm({
  onSubmit,
  isSubmitting = false,
}: RegisterFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const showPasswordMismatchError =
    confirmPassword !== "" && !passwordsMatch;

  const isFormComplete =
    name.trim() !== "" &&
    email.trim() !== "" &&
    password !== "" &&
    confirmPassword !== "" &&
    passwordsMatch &&
    acceptedTerms;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete || isSubmitting) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      email: email.trim(),
      password,
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="name" className={labelClassName}>
          Full Name
        </label>
        <Input
          id="name"
          type="text"
          placeholder="Dr. Jane Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClassName}
        />
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
          className={inputClassName}
        />
      </div>

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
          className={inputClassName}
        />
      </div>

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
          className={inputClassName}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          aria-label="I agree to the Terms of Service and Privacy Policy"
          className={cn(
            "mt-0.5 size-4 shrink-0 rounded border-[#cbd5e1] text-[#2563eb]",
            "focus:ring-2 focus:ring-[#2563eb]/20 focus:ring-offset-0",
          )}
        />
        <span className="text-sm text-[#475569]">
          I agree to the{" "}
          <Link
            to="#terms"
            className="font-medium text-[#2563eb] hover:underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            to="#privacy"
            className="font-medium text-[#2563eb] hover:underline"
          >
            Privacy Policy
          </Link>
        </span>
      </label>

      {showPasswordMismatchError && (
        <p className="text-sm text-[#dc2626]" role="alert">
          Passwords must match
        </p>
      )}

      <Button
        type="submit"
        disabled={!isFormComplete || isSubmitting}
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8] disabled:bg-[#cbd5e1] disabled:text-[#94a3b8] disabled:shadow-none disabled:hover:bg-[#cbd5e1]"
      >
        {isSubmitting ? "Creating Account..." : "Create Account"}
      </Button>
    </form>
  );
}
