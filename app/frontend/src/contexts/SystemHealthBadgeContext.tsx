import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { HealthStatus } from "@/services/systemHealth";

export type SystemHealthBadgeStatus = HealthStatus | "unknown" | undefined;

interface SystemHealthBadgeContextValue {
  status: SystemHealthBadgeStatus;
  setStatus: (status: SystemHealthBadgeStatus) => void;
}

// Default (no provider in the tree) is a harmless no-op -- lets
// SystemHealthPage call setStatus unconditionally without every test/host
// needing to wrap it in the provider.
const SystemHealthBadgeContext = createContext<SystemHealthBadgeContextValue>({
  status: undefined,
  setStatus: () => {},
});

/** Shares the admin nav badge's health status between DashboardLayout (which
 * seeds it from GET /admin/health/latest on mount) and SystemHealthPage
 * (which pushes a fresher value in directly after a live GET /admin/health
 * load or refresh) -- without this, the sidebar badge only ever reflected
 * whatever /latest returned on the last full layout mount, going stale the
 * moment an admin loaded or refreshed the System Health page itself. */
export function SystemHealthBadgeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SystemHealthBadgeStatus>(undefined);
  const value = useMemo(() => ({ status, setStatus }), [status]);

  return (
    <SystemHealthBadgeContext.Provider value={value}>
      {children}
    </SystemHealthBadgeContext.Provider>
  );
}

export function useSystemHealthBadge(): SystemHealthBadgeContextValue {
  return useContext(SystemHealthBadgeContext);
}
