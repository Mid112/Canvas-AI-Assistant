import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ConnectCanvasFormProps {
  error?: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: { canvasToken: string }) => void | Promise<void>;
}

const inputClassName =
  "h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]";

const labelClassName = "text-sm font-semibold text-[#1e293b]";

export function ConnectCanvasForm({
  error = null,
  isSubmitting = false,
  onSubmit,
}: ConnectCanvasFormProps) {
  const [canvasToken, setCanvasToken] = useState("");

  const isFormComplete = canvasToken.trim() !== "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isFormComplete || isSubmitting) {
      return;
    }

    await onSubmit({ canvasToken: canvasToken.trim() });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label htmlFor="canvas-token" className={labelClassName}>
          Canvas API Token
        </label>
        <Input
          id="canvas-token"
          type="password"
          autoComplete="off"
          placeholder="Paste your Canvas access token"
          value={canvasToken}
          onChange={(event) => setCanvasToken(event.target.value)}
          className={inputClassName}
        />
      </div>

      {error && (
        <p className="text-sm text-[#dc2626]" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={!isFormComplete || isSubmitting}
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8] disabled:bg-[#cbd5e1] disabled:text-[#94a3b8] disabled:shadow-none disabled:hover:bg-[#cbd5e1]"
      >
        {isSubmitting ? "Connecting..." : "Connect Canvas"}
      </Button>
    </form>
  );
}
