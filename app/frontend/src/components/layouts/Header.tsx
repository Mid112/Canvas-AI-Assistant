import { useState } from "react";
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
  role: UserRole;
  roleLabel: string;
  navItems: NavItem[];
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function Header({
  title,
  role,
  roleLabel,
  navItems,
  sidebarOpen = true,
  onToggleSidebar,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
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
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
          {title}
        </h1>
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
