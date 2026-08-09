import { useState, type ReactNode } from "react";
import { Menu, PanelLeft } from "lucide-react";

import { AccountMenu } from "@/components/layouts/AccountMenu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/layouts/Sidebar";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/navigation";
import type { UserRole } from "@/types/user";

interface HeaderProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  role: UserRole;
  roleLabel: string;
  navItems: NavItem[];
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** Drops the title block and tightens the bar to give the page its vertical
   * space back. The nav controls stay: this header owns the sidebar toggle and
   * the mobile navigation sheet, so hiding it outright would leave small
   * screens with no way to navigate. */
  compact?: boolean;
}

export function Header({
  title,
  subtitle,
  leading,
  role,
  roleLabel,
  navItems,
  sidebarOpen = true,
  onToggleSidebar,
  compact = false,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6",
        compact ? "min-h-0 py-1.5" : "min-h-16 py-3",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onToggleSidebar ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("hidden lg:inline-flex", sidebarOpen && "lg:hidden")}
            aria-label="Open sidebar"
            onClick={onToggleSidebar}
          >
            <PanelLeft className="size-4" />
          </Button>
        ) : null}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation menu"
              />
            }
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent side="left" className="h-full w-72 overflow-hidden p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar
              navItems={navItems}
              role={role}
              roleLabel={roleLabel}
              onNavigate={() => setMobileOpen(false)}
              className="w-full border-0"
            />
          </SheetContent>
        </Sheet>
        {compact ? null : (
          <>
            {leading ? <div className="shrink-0">{leading}</div> : null}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="truncate text-sm text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
      {onToggleSidebar ? (
        <div className={cn("shrink-0", sidebarOpen && "lg:hidden")}>
          <AccountMenu
            role={role}
            trigger="icon"
            align="end"
            side="bottom"
          />
        </div>
      ) : null}
    </header>
  );
}
