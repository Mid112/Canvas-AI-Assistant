const FAILURE_REASONS = [
  "Invalid Canvas credentials or API token",
  "Canvas server is temporarily unavailable",
  "Insufficient permissions on your Canvas account",
  "Network connectivity issues",
];

export function CanvasAuthErrorReasons() {
  return (
    <section
      aria-label="Possible failure reasons"
      className="mb-6 rounded-xl bg-muted px-5 py-4"
    >
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        {FAILURE_REASONS.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}
