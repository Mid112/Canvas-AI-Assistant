import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { pageShell } from "@/lib/page-shell";
import {
  fetchFailedOperation,
  fetchFailedOperations,
  fetchFailedOperationsSummary,
  type FailedOperation,
  type FailedOperationSource,
  type FailedOperationSummaryResponse,
} from "@/services/failedOperations";

type SourceFilter = "all" | FailedOperationSource;

const SOURCE_LABELS: Record<FailedOperationSource, string> = {
  canvas: "Canvas",
  ai: "AI",
};

function SummaryCards({ summary }: { summary: FailedOperationSummaryResponse }) {
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

function DetailPanel({ item }: { item: FailedOperation | null }) {
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

export function FailedOperationsPage() {
  const { accessToken } = useAuth();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [summary, setSummary] = useState<FailedOperationSummaryResponse | null>(null);
  const [items, setItems] = useState<FailedOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FailedOperation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestId = useRef(0);

  const loadList = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = ++loadRequestId.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const [summaryData, listData] = await Promise.all([
        fetchFailedOperationsSummary(accessToken),
        fetchFailedOperations(accessToken, {
          source: sourceFilter === "all" ? undefined : sourceFilter,
          hours: 24,
          limit: 100,
        }),
      ]);
      if (requestId !== loadRequestId.current) {
        return;
      }
      setSummary(summaryData);
      setItems(listData.items);
      setTotal(listData.total);
      setSelectedId((currentId) => {
        if (currentId !== null && listData.items.some((item) => item.id === currentId)) {
          return currentId;
        }
        return listData.items[0]?.id ?? null;
      });
    } catch {
      if (requestId !== loadRequestId.current) {
        return;
      }
      setLoadError("Unable to load failed operations.");
      setItems([]);
      setTotal(0);
      setSummary(null);
      setSelectedId(null);
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [accessToken, sourceFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!accessToken || selectedId === null) {
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
          const fallback = items.find((item) => item.id === selectedId) ?? null;
          setSelectedItem(fallback);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedId, items]);

  const filterButtons: Array<{ key: SourceFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "canvas", label: "Canvas" },
    { key: "ai", label: "AI" },
  ];

  return (
    <div className={pageShell}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Failed Operations
          </h1>
          <p className="text-muted-foreground">
            Review recent Canvas and AI failures across the platform.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadList()}
          disabled={isLoading || !accessToken}
          aria-label="Refresh failed operations"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw className="size-4" data-icon="inline-start" />
          )}
          Refresh
        </Button>
      </header>

      {!accessToken ? (
        <p role="status" className="text-sm text-muted-foreground">
          Sign in as an admin to view failed operations.
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {summary ? <SummaryCards summary={summary} /> : null}

      <div className="flex flex-wrap gap-2">
        {filterButtons.map((button) => (
          <Button
            key={button.key}
            type="button"
            size="sm"
            variant={sourceFilter === button.key ? "default" : "outline"}
            onClick={() => setSourceFilter(button.key)}
            disabled={!accessToken}
          >
            {button.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Recent failures</CardTitle>
            {total > items.length ? (
              <p className="text-xs text-muted-foreground">
                Showing {items.length} of {total} in the last 24 hours.
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {!accessToken ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Waiting for authentication…
              </p>
            ) : isLoading && items.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No failed operations in the last 24 hours.
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
                      onClick={() => setSelectedId(item.id)}
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
          </CardContent>
        </Card>

        <DetailPanel item={selectedItem} />
      </div>
    </div>
  );
}
