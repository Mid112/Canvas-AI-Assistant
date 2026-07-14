/** Institutional product mockup styled like Canvas UI surfaces. */
export function LandingHeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      <div className="overflow-hidden rounded-md border border-border bg-card shadow-lg">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <div className="size-8 rounded-full bg-primary/10" />
          <div>
            <p className="text-sm font-semibold text-foreground">Canvas AI Assistant</p>
            <p className="text-xs text-muted-foreground">Workflow Assistant</p>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm text-foreground">
            Create a lab assignment due next Friday for COSC 499.
          </div>
          <div className="max-w-[90%] rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            I prepared a draft assignment. Please review the preview before publishing to Canvas.
          </div>

          <div className="rounded-md border border-border bg-canvas-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Action preview
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">Lab 3 — Memory Management</p>
            <p className="text-xs text-muted-foreground">
              Due Mar 14 · 100 points · Requires instructor approval
            </p>
            <div className="mt-3 flex gap-2">
              <span className="rounded border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                Modify
              </span>
              <span className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                Approve &amp; publish
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
