import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { pageShellXWide } from "@/lib/page-shell";
import { paths } from "@/routes/paths";
import {
  fetchFailedOperation,
  fetchFailedOperations,
  fetchFailedOperationsSummary,
  type FailedOperation,
  type FailedOperationDetail,
  type FailedOperationSource,
  type FailedOperationSummaryResponse,
} from "@/services/failedOperations";
import {
  createTicket,
  fetchTicketForFailedOperation,
  updateTicket,
  type SupportTicket,
  type TicketStatus,
} from "@/services/supportTickets";

const FAILED_OPS_PAGE_SIZE = 50;

const SOURCE_LABELS: Record<FailedOperationSource, string> = {
  canvas: "Canvas",
  ai: "AI",
};

type SourceFilter = "all" | FailedOperationSource;

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

function DetailPanel({ item }: { item: FailedOperationDetail | null }) {
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
        <p className="font-medium">{item.human_summary}</p>
        {item.user_name ? <p>User: {item.user_name}</p> : null}
        {item.provider ? <p>Provider: {item.provider}</p> : null}
        {item.course_id !== null ? <p>Course ID: {item.course_id}</p> : null}
        {item.conversation_id !== null ? (
          <p>Conversation ID: {item.conversation_id}</p>
        ) : null}
        {item.workflow_id !== null ? <p>Workflow ID: {item.workflow_id}</p> : null}
        {item.tool_call_id !== null ? <p>Tool call ID: {item.tool_call_id}</p> : null}
        <div>
          <p className="font-medium">Raw error detail</p>
          <p className="whitespace-pre-wrap text-destructive">{item.error_detail}</p>
        </div>
        {contextEntries.length > 0 ? (
          <div>
            <p className="font-medium">Raw context</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(item.context_json, null, 2)}
            </pre>
          </div>
        ) : null}
        <TicketPanel failedOperationId={item.id} />
      </CardContent>
    </Card>
  );
}

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
};

const TICKET_STATUS_BADGE_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  investigating: "secondary",
  resolved: "outline",
};

/** Admin-side escalation tracking for one failed operation — get-or-create
 * a ticket, then track status/notes. No retry/re-trigger action: read-only +
 * escalate-to-dev-team only, per the team's Canvas-write risk framework. */
function TicketPanel({ failedOperationId }: { failedOperationId: number }) {
  const { accessToken } = useAuth();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void fetchTicketForFailedOperation(accessToken, failedOperationId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setTicket(result);
        setNotesDraft(result?.admin_notes ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load ticket status.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, failedOperationId]);

  const handleEscalate = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const created = await createTicket(accessToken, failedOperationId);
      setTicket(created);
      setNotesDraft(created.admin_notes ?? "");
    } catch {
      setError("Unable to create ticket.");
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, failedOperationId]);

  const handleStatusChange = useCallback(
    async (status: TicketStatus) => {
      if (!accessToken || !ticket) {
        return;
      }
      setIsSaving(true);
      setError(null);
      try {
        const updated = await updateTicket(accessToken, ticket.id, { status });
        setTicket(updated);
      } catch {
        setError("Unable to update ticket status.");
      } finally {
        setIsSaving(false);
      }
    },
    [accessToken, ticket],
  );

  const handleSaveNotes = useCallback(async () => {
    if (!accessToken || !ticket) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateTicket(accessToken, ticket.id, { admin_notes: notesDraft });
      setTicket(updated);
    } catch {
      setError("Unable to save ticket notes.");
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, ticket, notesDraft]);

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Ticket</p>
        {ticket ? (
          <Badge variant={TICKET_STATUS_BADGE_VARIANT[ticket.status]}>
            {TICKET_STATUS_LABELS[ticket.status]}
          </Badge>
        ) : null}
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading ticket status…</p>
      ) : !ticket ? (
        <Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={() => void handleEscalate()}>
          Escalate to ticket
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={ticket.status === status ? "default" : "outline"}
                disabled={isSaving}
                onClick={() => void handleStatusChange(status)}
              >
                {TICKET_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
          {ticket.resolved_by_email ? (
            <p className="text-xs text-muted-foreground">
              Resolved by {ticket.resolved_by_email}
              {ticket.resolved_at ? ` on ${new Date(ticket.resolved_at).toLocaleString()}` : ""}
            </p>
          ) : null}
          <Textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            placeholder="Notes for whoever picks this up…"
            rows={3}
          />
          <Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={() => void handleSaveNotes()}>
            Save notes
          </Button>
        </div>
      )}
    </div>
  );
}

export function FailedOperationsPage() {
  const { accessToken } = useAuth();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [summary, setSummary] = useState<FailedOperationSummaryResponse | null>(null);
  const [items, setItems] = useState<FailedOperation[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FailedOperationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
          limit: FAILED_OPS_PAGE_SIZE,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async list load on mount/filter/auth changes
    void loadList();
  }, [loadList]);

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
        // No meaningful fallback: the list shape no longer carries
        // error_detail/context_json (see FailedOperation vs
        // FailedOperationDetail), so a failed detail fetch just clears
        // the panel rather than showing a fake partial one.
        if (!cancelled) {
          setSelectedItem(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedId]);

  const handleLoadMore = useCallback(async () => {
    if (!accessToken || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const batch = await fetchFailedOperations(accessToken, {
        source: sourceFilter === "all" ? undefined : sourceFilter,
        limit: FAILED_OPS_PAGE_SIZE,
        offset: items.length,
      });
      setItems((current) => [...current, ...batch.items]);
      setTotal(batch.total);
    } catch {
      setLoadError("Unable to load more failed operations.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [accessToken, isLoadingMore, items.length, sourceFilter]);

  const filterButtons: Array<{ key: SourceFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "canvas", label: "Canvas" },
    { key: "ai", label: "AI" },
  ];

  return (
    <div className={pageShellXWide}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            to={paths.admin.troubleshooting}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Troubleshooting
          </Link>
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
                        {item.human_summary}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          {total > items.length ? (
            <div className="px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading more..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </Card>

        <DetailPanel item={selectedItem} />
      </div>
    </div>
  );
}
