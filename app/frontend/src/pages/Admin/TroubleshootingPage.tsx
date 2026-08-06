// Admin page note: coordinates troubleshooting page admin workflows and service data.

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { ResetCanvasTokenDialog } from "@/components/admin/ResetCanvasTokenDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { pageShellXWide } from "@/lib/page-shell";
import { adminInstructorsFailingCanvasPath, paths } from "@/routes/paths";
import {
  fetchFailedOperationsSummary,
  type FailedOperationSummaryResponse,
} from "@/services/failedOperations";
import {
  fetchDiagnostics,
  fetchFailingCanvasConnections,
  type DiagnosticsResponse,
  type FailingCanvasConnection,
  type LlmProviderStatus,
} from "@/services/troubleshoot";

// Independent of Badge's default/secondary/destructive variants -- --primary
// and --destructive share the same brand red (index.css), so variant="default"
// rendered "Healthy" in red. Same fix as SystemHealthPage.tsx.
const HEALTH_STATUS_BADGE_CLASS: Record<string, string> = {
  healthy:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  degraded: "border-transparent bg-muted text-muted-foreground",
  down: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  unknown: "border-transparent bg-muted text-muted-foreground",
};

const HEALTH_STATUS_LABEL: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

const PROVIDER_STATUS_LABEL: Record<LlmProviderStatus["status"], string> = {
  available: "Available",
  configured: "Configured",
  unavailable: "Unavailable",
  unconfigured: "Not configured",
};

function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function DiagnosticsOverview({ diagnostics }: { diagnostics: DiagnosticsResponse }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overall health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge
            variant="outline"
            className={HEALTH_STATUS_BADGE_CLASS[diagnostics.health.overall_status]}
          >
            {HEALTH_STATUS_LABEL[diagnostics.health.overall_status] ?? diagnostics.health.overall_status}
          </Badge>
        </CardContent>
      </Card>
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Backend uptime
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {formatUptime(diagnostics.backend_uptime_seconds)}
        </CardContent>
      </Card>
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Canvas host
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground break-all">
          {diagnostics.canvas_api_url}
        </CardContent>
      </Card>
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Failed operations (24h)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {diagnostics.recent_failed_operations_count}
        </CardContent>
      </Card>
    </div>
  );
}

interface ResetTarget {
  instructorId: string;
  instructorName: string;
  canvasUrl: string;
}

const FAILING_CONNECTIONS_PAGE_SIZE = 5;

function InstructorCanvasDiagnosticsCard({
  diagnostics,
  onConnectionFixed,
}: {
  diagnostics: DiagnosticsResponse;
  onConnectionFixed: () => void;
}) {
  const { accessToken } = useAuth();
  const { instructor_canvas: summary } = diagnostics;
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [items, setItems] = useState<FailingCanvasConnection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (targetPage: number) => {
      if (!accessToken) {
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const offset = (targetPage - 1) * FAILING_CONNECTIONS_PAGE_SIZE;
        const data = await fetchFailingCanvasConnections(accessToken, {
          limit: FAILING_CONNECTIONS_PAGE_SIZE,
          offset,
        });
        setItems(data.items);
        setTotal(data.total);
        setPage(targetPage);
      } catch {
        setLoadError("Unable to load failing connections.");
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load on mount/auth change
    void loadPage(1);
  }, [loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / FAILING_CONNECTIONS_PAGE_SIZE));

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Instructor Canvas connections</CardTitle>
        <Button render={<Link to={adminInstructorsFailingCanvasPath()} />} variant="outline" size="sm">
          Manage instructors
          <ArrowRight className="size-4" data-icon="inline-end" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          {summary.healthy} of {summary.total} instructor connections are healthy
          {summary.failing > 0 ? ` (${summary.failing} failing)` : ""}.
        </p>
        {loadError ? <p role="alert" className="text-destructive">{loadError}</p> : null}
        {items.length > 0 ? (
          <>
            <ul className="space-y-2">
              {items.map((connection) => (
                <li
                  key={`${connection.user_email}-${connection.canvas_url}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">{connection.user_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {connection.user_email} · {connection.canvas_url}
                    </p>
                    <p className="text-destructive">{connection.human_summary}</p>
                  </div>
                  {connection.needs_token_reset ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setResetTarget({
                          instructorId: String(connection.user_id),
                          instructorName: connection.user_name,
                          canvasUrl: connection.canvas_url,
                        })
                      }
                    >
                      Reset token
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoading || page <= 1}
                    onClick={() => void loadPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isLoading || page >= totalPages}
                    onClick={() => void loadPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>

      {resetTarget ? (
        <ResetCanvasTokenDialog
          open={resetTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setResetTarget(null);
            }
          }}
          instructorId={resetTarget.instructorId}
          instructorName={resetTarget.instructorName}
          canvasUrl={resetTarget.canvasUrl}
          lockUrl
          onSuccess={() => {
            setResetTarget(null);
            onConnectionFixed();
            void loadPage(page);
          }}
        />
      ) : null}
    </Card>
  );
}

function LlmProvidersCard({ providers }: { providers: LlmProviderStatus[] }) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>LLM providers</CardTitle>
        <Button render={<Link to={paths.admin.settings} />} variant="outline" size="sm">
          Manage providers
          <ArrowRight className="size-4" data-icon="inline-end" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {providers.map((provider) => (
          <div key={provider.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{provider.name}</span>
            <Badge variant="outline">{PROVIDER_STATUS_LABEL[provider.status]}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FailedOperationsSummaryCard({ summary }: { summary: FailedOperationSummaryResponse }) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Failed operations</CardTitle>
        <Button
          render={<Link to={paths.admin.failedOperations} />}
          variant="outline"
          size="sm"
        >
          View failed operations
          <ArrowRight className="size-4" data-icon="inline-end" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total", value: summary.total },
            { label: "Canvas", value: summary.canvas_count },
            { label: "AI", value: summary.ai_count },
          ].map((stat) => (
            <div key={stat.label} className="space-y-1">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Last {summary.hours} hours</p>
      </CardContent>
    </Card>
  );
}

export function TroubleshootingPage() {
  const { accessToken } = useAuth();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [opsSummary, setOpsSummary] = useState<FailedOperationSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [diagnosticsData, summaryData] = await Promise.all([
        fetchDiagnostics(accessToken),
        fetchFailedOperationsSummary(accessToken),
      ]);
      setDiagnostics(diagnosticsData);
      setOpsSummary(summaryData);
    } catch {
      setLoadError("Unable to load troubleshooting diagnostics.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async diagnostics load on mount/auth changes
    void loadAll();
  }, [loadAll]);

  return (
    <div className={pageShellXWide}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Troubleshooting
          </h1>
          <p className="text-muted-foreground">
            Diagnostic information for the platform, with credentials always masked.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadAll()}
          disabled={isLoading}
          aria-label="Refresh diagnostics"
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

      {diagnostics ? (
        <>
          <DiagnosticsOverview diagnostics={diagnostics} />
          <div className="grid gap-4 md:grid-cols-2">
            <InstructorCanvasDiagnosticsCard
              diagnostics={diagnostics}
              onConnectionFixed={() => void loadAll()}
            />
            <LlmProvidersCard providers={diagnostics.llm_providers} />
          </div>
        </>
      ) : null}

      {opsSummary ? <FailedOperationsSummaryCard summary={opsSummary} /> : null}
    </div>
  );
}
