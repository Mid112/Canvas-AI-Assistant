/** Mockup-aligned palette. App `primary` is neutral gray, not mockup blue. */
export const dashboardColors = {
  blue: {
    iconSquare: "rounded-lg bg-blue-100 text-blue-600",
    iconCircle: "rounded-full bg-blue-100 text-blue-600",
    link: "text-blue-600 transition-colors hover:text-blue-700 hover:underline",
    accent: "text-blue-600",
    button:
      "bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.99] focus-visible:ring-blue-600/30",
  },
  green: {
    iconSquare: "rounded-lg bg-emerald-100 text-emerald-600",
    iconCircle: "rounded-full bg-emerald-100 text-emerald-600",
    trend: "text-emerald-600",
  },
  orange: {
    iconSquare: "rounded-lg bg-amber-100 text-amber-600",
    iconCircle: "rounded-full bg-amber-100 text-amber-600",
  },
  red: {
    iconSquare: "rounded-lg bg-red-100 text-red-600",
    trend: "text-red-500",
    badge:
      "inline-flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white",
  },
  purple: {
    iconSquare: "rounded-lg bg-violet-100 text-violet-600",
    iconCircle: "rounded-full bg-violet-100 text-violet-600",
  },
} as const;

export const dashboardInteractive = {
  actionCard:
    "group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-white p-3 text-left transition-all duration-200 hover:border-blue-200 hover:bg-blue-50/70 hover:shadow-sm active:scale-[0.99] active:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30",
  actionIcon:
    "transition-colors duration-200 group-hover:bg-blue-200 group-hover:text-blue-700",
  listRow:
    "rounded-lg transition-colors duration-200 hover:bg-gray-50/80",
  footerButton:
    "rounded-md px-1 py-0.5 text-sm font-medium transition-colors duration-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30",
} as const;

export function formatMissingSubmissionsTrend(value: number): string {
  return `${Math.abs(value)}%`;
}

export function getMissingSubmissionsTrendClass(value: number): string {
  if (value > 0) {
    return dashboardColors.red.trend;
  }

  if (value < 0) {
    return dashboardColors.green.trend;
  }

  return "text-muted-foreground";
}
