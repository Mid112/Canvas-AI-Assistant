import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { pageShellXWide } from "@/lib/page-shell";
import {
  fetchDiagnostics,
  fetchFailedOperations,
  type DiagnosticsResponse,
  type FailedOperation,
  type LlmProviderStatus,
} from "@/services/troubleshoot";

const FAILED_OPS_PAGE_SIZE = 50;

const HEALTH_STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  healthy: "default",
  degraded: "secondary",
  down: "destructive",
  unknown: "secondary",
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
          <Badge variant={HEALTH_STATUS_BADGE_VARIANT[diagnostics.health.overall_status]}>
            {diagnostics.health.overall_status}
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

function InstructorCanvasDiagnosticsCard({ diagnostics }: { diagnostics: DiagnosticsResponse }) {
  const { instructor_canvas: summary } = diagnostics;

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
              <li
                key={`${connection.user_email}-${connection.canvas_url}`}
                className="text-destructive"
              >
                {connection.user_name} ({connection.user_email}) — {connection.error_detail}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground/80">
          Connection URLs and error text only — Canvas tokens are never exposed here.
        </p>
      </CardContent>
    </Card>
  );
}

function LlmProvidersCard({ providers }: { providers: LlmProviderStatus[] }) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>LLM providers</CardTitle>
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

function FailedOperationsTable({
  operations,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  operations: FailedOperation[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Failed operations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {operations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failed operations recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operations.map((operation) => (
                <TableRow key={operation.id}>
                  <TableCell className="font-medium">{operation.action_name}</TableCell>
                  <TableCell>
                    {operation.user_name}
                    <span className="block text-xs text-muted-foreground">
                      {operation.user_email}
                    </span>
                  </TableCell>
                  <TableCell>{operation.course_name ?? "—"}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-destructive">
                    {operation.error_detail ?? "—"}
                  </TableCell>
                  <TableCell>{new Date(operation.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading more..." : "Load more"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TroubleshootingPage() {
  const { accessToken } = useAuth();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [operations, setOperations] = useState<FailedOperation[]>([]);
  const [operationsTotal, setOperationsTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const [diagnosticsData, operationsData] = await Promise.all([
        fetchDiagnostics(accessToken),
        fetchFailedOperations(accessToken, { limit: FAILED_OPS_PAGE_SIZE }),
      ]);
      setDiagnostics(diagnosticsData);
      setOperations(operationsData.items);
      setOperationsTotal(operationsData.total);
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

  const handleLoadMore = useCallback(async () => {
    if (!accessToken || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const batch = await fetchFailedOperations(accessToken, {
        limit: FAILED_OPS_PAGE_SIZE,
        offset: operations.length,
      });
      setOperations((current) => [...current, ...batch.items]);
      setOperationsTotal(batch.total);
    } catch {
      setLoadError("Unable to load more failed operations.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [accessToken, isLoadingMore, operations.length]);

  const hasMore = operations.length < operationsTotal;

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
            <InstructorCanvasDiagnosticsCard diagnostics={diagnostics} />
            <LlmProvidersCard providers={diagnostics.llm_providers} />
          </div>
          <FailedOperationsTable
            operations={operations}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={() => void handleLoadMore()}
          />
        </>
      ) : null}
    </div>
  );
}
