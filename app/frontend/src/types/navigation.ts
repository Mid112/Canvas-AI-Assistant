import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Set only when there's something to flag (degraded/down) — a calm nav
   * item renders no badge at all. Powers the admin System Health nav dot. */
  badge?: "healthy" | "degraded" | "down";
}
