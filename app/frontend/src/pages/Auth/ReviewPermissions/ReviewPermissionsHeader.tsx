import { GraduationCap } from "lucide-react";

export function ReviewPermissionsHeader() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <GraduationCap className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Review Permissions
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Review what the AI assistant can and cannot do in Canvas
      </p>
    </div>
  );
}
