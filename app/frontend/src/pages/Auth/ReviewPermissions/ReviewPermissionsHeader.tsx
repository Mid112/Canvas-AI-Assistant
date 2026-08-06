// Auth page note: handles review permissions header onboarding/authentication UI while keeping Canvas connection steps explicit.

import { GraduationCap } from "lucide-react";

import { brandIconBadgeLgClassName } from "@/lib/surface-styles";

export function ReviewPermissionsHeader() {
  return (
    <div className="mb-8 text-center">
      <div className={brandIconBadgeLgClassName}>
        <GraduationCap className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Review Canvas Permissions
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Here&apos;s what the AI assistant can access in Canvas and why, so
        you can confirm it before continuing.
      </p>
    </div>
  );
}
