import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface AdminToastProps {
  message: string;
  type?: "success" | "error";
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

export function AdminToast({
  message,
  type = "success",
  onDismiss,
}: AdminToastProps) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismissRef.current();
    }, AUTO_DISMISS_MS);

    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className="fixed top-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm shadow-lg ring-1 ring-border/60 animate-in fade-in-0 slide-in-from-top-2"
    >
      {type === "success" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      )}
      <p className={type === "success" ? "text-foreground" : "text-destructive"}>
        {message}
      </p>
    </div>
  );
}
