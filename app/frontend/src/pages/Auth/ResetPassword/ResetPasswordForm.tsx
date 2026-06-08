import type { FormEvent } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ResetPasswordFormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ResetPasswordForm({ onSubmit }: ResetPasswordFormProps) {
  return (
    <form className="space-y-5" onSubmit={onSubmit}>
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
            className="h-11 rounded-lg border-[#e2e8f0] bg-white pr-3.5 pl-10 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
      >
        Send Reset Link
      </Button>
    </form>
  );
}
