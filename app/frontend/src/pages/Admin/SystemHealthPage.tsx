import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
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

const STATUS_BADGE_VARIANT: Record<HealthStatus, "default" | "secondary" | "destructive"> = {
  healthy: "default",
  degraded: "secondary",
  down: "destructive",
};

const STATUS_DOT_CLASS: Record<HealthStatus, string> = {
  healthy: "bg-primary",
  degraded: "bg-amber-500",
  down: "bg-destructive",
};

function HistorySparkline({ entries }: { entries: HealthHistoryEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {entries.map((entry, index) => (
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
        <Badge variant={STATUS_BADGE_VARIANT[health.status]}>
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

function InstructorCanvasCard({ health }: { health: HealthCheckResponse }) {
  const { instructor_canvas: summary } = health;

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Instructor Canvas connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          {summary.healthy} of {summary.total} instructor connections are healthy
          {summary.failing > 0 ? ` (${summary.failing} failing)` : ""}.
        </p>
        {summary.failing_connections.length > 0 ? (
          <ul className="space-y-1">
            {summary.failing_connections.map((connection) => (
              <li key={connection.user_email} className="text-destructive">
                {connection.user_name} ({connection.user_email}) — {connection.error_detail}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InstructorAiCard({ health }: { health: HealthCheckResponse }) {
  const { instructor_ai: summary } = health;

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Instructor AI usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>{summary.total} instructors have used AI drafting so far.</p>
        {summary.failing_recent > 0 ? (
          <p className="text-destructive">
            {summary.failing_recent} instructor{summary.failing_recent === 1 ? "" : "s"} had an AI
            failure in the last hour.
          </p>
        ) : (
          <p>No AI failures in the last hour.</p>
        )}
        <p className="text-xs text-muted-foreground/80">
          Covers message-draft and assignment-draft generation only — the main AI assistant chat
          isn&apos;t instrumented yet.
        </p>
      </CardContent>
    </Card>
  );
}

export function SystemHealthPage() {
  const { accessToken } = useAuth();
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
    } catch {
      setLoadError("Unable to load system health status.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

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
              <Badge variant={STATUS_BADGE_VARIANT[health.overall_status]}>
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

          <div className="grid gap-4 md:grid-cols-2">
            <InstructorCanvasCard health={health} />
            <InstructorAiCard health={health} />
          </div>
        </>
      ) : null}
    </div>
  );
}
