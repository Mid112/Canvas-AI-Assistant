export type AnalyticsTrendDirection = "positive" | "negative" | "neutral";

export function formatAnalyticsTrend(value: number): string {
  if (value > 0) {
    return `+${value}%`;
  }

  return `${value}%`;
}

export function getTrendDirection(
  value: number,
  invertColors = false,
): AnalyticsTrendDirection {
  if (value > 0) {
    return invertColors ? "negative" : "positive";
  }

  if (value < 0) {
    return invertColors ? "positive" : "negative";
  }

  return "neutral";
}

export function getTrendColorClass(
  direction: AnalyticsTrendDirection,
): string {
  switch (direction) {
    case "positive":
      return "text-emerald-600";
    case "negative":
      return "text-destructive";
    case "neutral":
      return "text-muted-foreground";
  }
}
