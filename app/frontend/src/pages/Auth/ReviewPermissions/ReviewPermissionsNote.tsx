// Auth page note: handles review permissions note onboarding/authentication UI while keeping Canvas connection steps explicit.

export function ReviewPermissionsNote() {
  return (
    <section
      aria-label="Permissions note"
      className="mb-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3"
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Note:</span> All
        AI-generated actions will be previewed before execution. You maintain
        full control over what gets applied to your Canvas courses.
      </p>
    </section>
  );
}
