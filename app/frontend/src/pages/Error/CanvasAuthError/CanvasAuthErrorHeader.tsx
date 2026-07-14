import { AlertCircle, GraduationCap } from "lucide-react";

export function CanvasAuthErrorHeader() {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <GraduationCap className="size-7" aria-hidden="true" />
      </div>
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-destructive/5">
        <AlertCircle
          className="size-10 text-destructive"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Canvas Authentication Failed
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        We couldn&apos;t connect to your Canvas account. This could be due to:
      </p>
    </div>
  );
}
