import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemHealthBadge } from "@/contexts/SystemHealthBadgeContext";
import { cn } from "@/lib/utils";
import { pageShell } from "@/lib/page-shell";
import {
  fetchSystemHealth,
  fetchSystemHealthHistory,
  type HealthCheckResponse,
  type HealthHistoryEntry,
  type HealthHistoryResponse,
  type HealthStatus,
  type ServiceHealth,
  type ServiceMap,
} from "@/services/systemHealth";

const SERVICE_LABELS: Record<keyof ServiceMap, string> = {
  backend: "Backend",
  database: "Database",
  canvas: "Canvas connectivity",
  ai: "AI service",
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};

// Deliberately independent of the Badge component's default/secondary/
// destructive variants -- this app's --primary token is the same brand red
// as --destructive (see index.css), so variant="default" rendered "Healthy"
// in red. Health status needs its own green/grey/red scale regardless of
// brand color.
const STATUS_BADGE_CLASS: Record<HealthStatus, string> = {
  healthy:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  degraded: "border-transparent bg-muted text-muted-foreground",
  down: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
};

const STATUS_DOT_CLASS: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-muted-foreground/50",
  down: "bg-destructive",
};

// Backend already caps GET /admin/health/history's total row count
// (services/health.py), but a compact sparkline still shouldn't try to
// render however many points that cap allows through -- slice to the most
// recent points actually worth showing here.
const SPARKLINE_MAX_POINTS = 48;

function HistorySparkline({ entries }: { entries: HealthHistoryEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  const visibleEntries = entries.slice(-SPARKLINE_MAX_POINTS);

  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {visibleEntries.map((entry, index) => (
        <span
          key={`${entry.checked_at}-${index}`}
          title={`${entry.status} at ${new Date(entry.checked_at).toLocaleString()}`}
          className={cn("size-2 rounded-full", STATUS_DOT_CLASS[entry.status])}
        />
      ))}
    </div>
  );
}

function ServiceStatusCard({
  title,
  health,
  history,
}: {
  title: string;
  health: ServiceHealth;
  history: HealthHistoryEntry[];
}) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Badge variant="outline" className={STATUS_BADGE_CLASS[health.status]}>
          {STATUS_LABELS[health.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {health.latency_ms !== null ? <p>Latency: {health.latency_ms} ms</p> : null}
        {health.uptime_seconds !== null ? (
          <p>Uptime: {Math.floor(health.uptime_seconds / 60)} min</p>
        ) : null}
        {health.error_detail ? (
          <p className="text-destructive">{health.error_detail}</p>
        ) : null}
        <HistorySparkline entries={history} />
      </CardContent>
    </Card>
  );
}

export function SystemHealthPage() {
  const { accessToken } = useAuth();
  const { setStatus: setBadgeStatus } = useSystemHealthBadge();
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [history, setHistory] = useState<HealthHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [healthData, historyData] = await Promise.all([
        fetchSystemHealth(accessToken),
        fetchSystemHealthHistory(accessToken),
      ]);
      setHealth(healthData);
      setHistory(historyData);
      // Push this live result straight into the shared nav-badge state --
      // otherwise the sidebar badge only reflected whatever GET
      // /admin/health/latest returned on the last full layout mount, and
      // stayed stale after a visit/refresh here actually changed things.
      setBadgeStatus(healthData.overall_status);
    } catch {
      setLoadError("Unable to load system health status.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, setBadgeStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async health load on mount/auth changes
    void loadHealth();
  }, [loadHealth]);

  return (
    <div className={pageShell}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            System Health
          </h1>
          <p className="text-muted-foreground">
            Live status of the backend, database, Canvas connectivity, and AI
            service.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadHealth()}
          disabled={isLoading}
          aria-label="Refresh health status"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw className="size-4" data-icon="inline-start" />
          )}
          Refresh
        </Button>
      </header>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {health ? (
        <>
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Overall status</CardTitle>
              <Badge variant="outline" className={STATUS_BADGE_CLASS[health.overall_status]}>
                {STATUS_LABELS[health.overall_status]}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Last checked: {new Date(health.checked_at).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(SERVICE_LABELS) as Array<keyof ServiceMap>).map((service) => (
              <ServiceStatusCard
                key={service}
                title={SERVICE_LABELS[service]}
                health={health.services[service]}
                history={history?.services[service] ?? []}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
