/** Canvas-aligned dashboard palette. */
export const dashboardColors = {
  red: {
    iconSquare: "rounded-md bg-primary/10 text-primary",
    iconCircle: "rounded-full bg-primary/10 text-primary",
    link: "text-primary transition-colors hover:text-primary/80 hover:underline",
    accent: "text-primary",
    trend: "text-destructive",
    badge:
      "inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground",
    button:
      "bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] focus-visible:ring-primary/30",
  },
  blue: {
    iconSquare: "rounded-md bg-primary/10 text-primary",
    iconCircle: "rounded-full bg-primary/10 text-primary",
    link: "text-primary transition-colors hover:text-primary/80 hover:underline",
    accent: "text-primary",
    button:
      "bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] focus-visible:ring-primary/30",
  },
  green: {
    iconSquare: "rounded-md bg-emerald-100 text-emerald-700",
    iconCircle: "rounded-full bg-emerald-100 text-emerald-700",
    trend: "text-emerald-700",
  },
  orange: {
    iconSquare: "rounded-md bg-amber-100 text-amber-800",
    iconCircle: "rounded-full bg-amber-100 text-amber-800",
  },
  purple: {
    iconSquare: "rounded-md bg-muted text-foreground",
    iconCircle: "rounded-full bg-muted text-foreground",
  },
} as const;

export const dashboardInteractive = {
  actionCard:
    "group flex w-full cursor-pointer items-start gap-3 rounded-md border border-border bg-card p-3 text-left transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
  actionIcon: "transition-colors duration-200 group-hover:bg-primary/15",
  listRow: "rounded-md transition-colors duration-200 hover:bg-muted/60",
  footerButton:
    "rounded-md px-1 py-0.5 text-sm font-medium transition-colors duration-200 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
} as const;

export function formatMissingSubmissionsTrend(value: number): string {
  return `${Math.abs(value)}%`;
}

export function getMissingSubmissionsTrendClass(value: number): string {
  if (value > 0) {
    return "text-destructive";
  }

  if (value < 0) {
    return dashboardColors.green.trend;
  }

  return "text-muted-foreground";
}
