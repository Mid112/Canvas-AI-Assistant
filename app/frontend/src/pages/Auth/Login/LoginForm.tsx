import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-semibold text-[#1e293b]"
        >
          Email Address
        </label>
        <Input
          id="email"
          type="email"
          placeholder="professor@university.edu"
          className="h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-semibold text-[#1e293b]"
        >
          Password
        </label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          className="h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            aria-label="Remember me"
            className={cn(
              "size-4 rounded border-[#cbd5e1] text-[#2563eb]",
              "focus:ring-2 focus:ring-[#2563eb]/20 focus:ring-offset-0",
            )}
          />
          <span className="text-sm text-[#475569]">Remember me</span>
        </label>
        <button
          type="button"
          className="text-sm font-medium text-[#2563eb] hover:underline"
        >
          Forgot password?
        </button>
      </div>

      <Button
        type="submit"
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
      >
        Sign In
      </Button>
    </form>
  );
}
