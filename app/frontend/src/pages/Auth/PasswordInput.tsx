import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<"input">, "type">;

/**
 * Password field with a show/hide toggle (#1451).
 */
export function PasswordInput({
  className,
  disabled,
  id,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={toggleLabel}
        aria-controls={id}
        aria-pressed={visible}
        className={cn(
          "absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
