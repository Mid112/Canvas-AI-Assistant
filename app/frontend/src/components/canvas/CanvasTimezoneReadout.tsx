// Component note: renders reusable canvas timezone readout UI for the instructor/admin experience.

interface CanvasTimezoneReadoutProps {
  timeZone?: string | null;
  className?: string;
}

export function CanvasTimezoneReadout({
  timeZone,
  className,
}: CanvasTimezoneReadoutProps) {
  return (
    <p className={className ?? "text-sm text-muted-foreground"}>
      Your Canvas timezone:{" "}
      <span className="font-medium text-foreground">
        {timeZone ?? "Not synced yet — reconnect Canvas to refresh"}
      </span>
    </p>
  );
}
