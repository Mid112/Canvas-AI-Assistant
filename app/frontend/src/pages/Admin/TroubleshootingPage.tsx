import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { pageShellXWide } from "@/lib/page-shell";
import {
  fetchFailedOperation,
  fetchFailedOperations,
  fetchFailedOperationsSummary,
  type FailedOperation,
  type FailedOperationSource,
  type FailedOperationSummaryResponse,
} from "@/services/failedOperations";
import {
  fetchDiagnostics,
  type DiagnosticsResponse,
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

const SOURCE_LABELS: Record<FailedOperationSource, string> = {
  canvas: "Canvas",
  ai: "AI",
};

type SourceFilter = "all" | FailedOperationSource;

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

function FailedOperationsSummaryCards({ summary }: { summary: FailedOperationSummaryResponse }) {
  const cards = [
    { label: "Total failures", value: summary.total },
    { label: "Canvas failures", value: summary.canvas_count },
    { label: "AI failures", value: summary.ai_count },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label} className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{card.value}</p>
            <p className="text-xs text-muted-foreground">Last {summary.hours} hours</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FailedOperationDetailPanel({ item }: { item: FailedOperation | null }) {
  if (!item) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="py-10 text-sm text-muted-foreground">
          Select a failed operation to view details.
        </CardContent>
      </Card>
    );
  }

  const contextEntries = Object.entries(item.context_json ?? {});

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Badge variant={item.source === "canvas" ? "secondary" : "default"}>
            {SOURCE_LABELS[item.source]}
          </Badge>
          {item.operation}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </p>
        {item.user_name ? <p>User: {item.user_name}</p> : null}
        {item.provider ? <p>Provider: {item.provider}</p> : null}
        {item.course_id !== null ? <p>Course ID: {item.course_id}</p> : null}
        {item.conversation_id !== null ? (
          <p>Conversation ID: {item.conversation_id}</p>
        ) : null}
        {item.workflow_id !== null ? <p>Workflow ID: {item.workflow_id}</p> : null}
        {item.tool_call_id !== null ? <p>Tool call ID: {item.tool_call_id}</p> : null}
        <div>
          <p className="font-medium">Error</p>
          <p className="whitespace-pre-wrap text-destructive">{item.error_detail}</p>
        </div>
        {contextEntries.length > 0 ? (
          <div>
            <p className="font-medium">Context</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(item.context_json, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FailedOperationsSection({
  sourceFilter,
  onSourceFilterChange,
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  selectedId,
  selectedItem,
  onSelect,
}: {
  sourceFilter: SourceFilter;
  onSourceFilterChange: (source: SourceFilter) => void;
  items: FailedOperation[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  selectedId: number | null;
  selectedItem: FailedOperation | null;
  onSelect: (id: number) => void;
}) {
  const filterButtons: Array<{ key: SourceFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "canvas", label: "Canvas" },
    { key: "ai", label: "AI" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((button) => (
          <Button
            key={button.key}
            type="button"
            size="sm"
            variant={sourceFilter === button.key ? "default" : "outline"}
            onClick={() => onSourceFilterChange(button.key)}
          >
            {button.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Failed operations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No failed operations recorded.
              </p>
            ) : (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-1 px-6 py-4 text-left transition-colors hover:bg-muted/50",
                        selectedId === item.id && "bg-muted/60",
                      )}
                      onClick={() => onSelect(item.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={item.source === "canvas" ? "secondary" : "default"}>
                          {SOURCE_LABELS[item.source]}
                        </Badge>
                        <span className="font-medium">{item.operation}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                      <span className="line-clamp-2 text-sm text-destructive">
                        {item.error_detail}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore ? (
              <div className="px-6 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Loading more..." : "Load more"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <FailedOperationDetailPanel item={selectedItem} />
      </div>
    </div>
  );
}

export function TroubleshootingPage() {
  const { accessToken } = useAuth();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [opsSummary, setOpsSummary] = useState<FailedOperationSummaryResponse | null>(null);
  const [opsItems, setOpsItems] = useState<FailedOperation[]>([]);
  const [opsTotal, setOpsTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FailedOperation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const loadAll = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const [diagnosticsData, summaryData, opsData] = await Promise.all([
        fetchDiagnostics(accessToken),
        fetchFailedOperationsSummary(accessToken),
        fetchFailedOperations(accessToken, {
          source: sourceFilter === "all" ? undefined : sourceFilter,
          limit: FAILED_OPS_PAGE_SIZE,
        }),
      ]);
      if (requestId !== loadRequestId.current) {
        return;
      }
      setDiagnostics(diagnosticsData);
      setOpsSummary(summaryData);
      setOpsItems(opsData.items);
      setOpsTotal(opsData.total);
      setSelectedId((currentId) => {
        if (currentId !== null && opsData.items.some((item) => item.id === currentId)) {
          return currentId;
        }
        return opsData.items[0]?.id ?? null;
      });
    } catch {
      if (requestId !== loadRequestId.current) {
        return;
      }
      setLoadError("Unable to load troubleshooting diagnostics.");
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [accessToken, sourceFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async diagnostics load on mount/filter/auth changes
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!accessToken || selectedId === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear detail when nothing is selected
      setSelectedItem(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const detail = await fetchFailedOperation(accessToken, selectedId);
        if (!cancelled) {
          setSelectedItem(detail);
        }
      } catch {
        if (!cancelled) {
          const fallback = opsItems.find((item) => item.id === selectedId) ?? null;
          setSelectedItem(fallback);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedId, opsItems]);

  const handleLoadMore = useCallback(async () => {
    if (!accessToken || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const batch = await fetchFailedOperations(accessToken, {
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit: FAILED_OPS_PAGE_SIZE,
        offset: opsItems.length,
      });
      setOpsItems((current) => [...current, ...batch.items]);
      setOpsTotal(batch.total);
    } catch {
      setLoadError("Unable to load more failed operations.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [accessToken, isLoadingMore, opsItems.length, sourceFilter]);

  const handleSourceFilterChange = useCallback((next: SourceFilter) => {
    setSourceFilter(next);
  }, []);

  const hasMoreOps = opsItems.length < opsTotal;

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
        </>
      ) : null}

      {opsSummary ? <FailedOperationsSummaryCards summary={opsSummary} /> : null}

      <FailedOperationsSection
        sourceFilter={sourceFilter}
        onSourceFilterChange={handleSourceFilterChange}
        items={opsItems}
        hasMore={hasMoreOps}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => void handleLoadMore()}
        selectedId={selectedId}
        selectedItem={selectedItem}
        onSelect={setSelectedId}
      />
    </div>
  );
}
