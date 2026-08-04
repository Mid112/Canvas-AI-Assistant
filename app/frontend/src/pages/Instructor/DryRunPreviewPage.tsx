import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { AdminToast } from "@/components/admin/AdminToast";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { defaultDryRunPreviewId } from "@/data/mockDryRunPreview";
import { paths } from "@/routes/paths";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  modifyAssistantAction,
} from "@/services/assistant";
import {
  confirmDryRunPreview,
  DryRunPreviewError,
  fetchChatIntentPreview,
  fetchDryRunPreview,
} from "@/services/dryRunPreview";
import type { DryRunPreviewData } from "@/types/dryRunPreview";

interface DryRunPreviewLocationState {
  returnTo?: string;
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof DryRunPreviewError || error instanceof AssistantApiError) {
    return error.message;
  }

  return "Unable to load the workflow preview.";
}

interface DryRunPreviewContentProps {
  previewKey: string;
  isChatPreview: boolean;
  conversationId?: number;
  pendingMessageId?: number;
  previewId: string;
  returnTo: string;
}

function DryRunPreviewContent({
  previewKey,
  isChatPreview,
  conversationId,
  pendingMessageId,
  previewId,
  returnTo,
}: DryRunPreviewContentProps) {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { refreshActiveCourse, notifyCoursesChanged } = useActiveCourse();
  const [preview, setPreview] = useState<DryRunPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [saveEditsError, setSaveEditsError] = useState<string | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const loadPreview = useCallback(async () => {
    if (isChatPreview) {
      if (!accessToken || conversationId === undefined || pendingMessageId === undefined) {
        throw new DryRunPreviewError("You must be signed in to review this preview.");
      }

      return fetchChatIntentPreview(
        accessToken,
        conversationId,
        pendingMessageId,
        user?.name ?? "Instructor",
      );
    }

    return fetchDryRunPreview(previewId);
  }, [
    accessToken,
    conversationId,
    isChatPreview,
    pendingMessageId,
    previewId,
    user,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function runLoad() {
      try {
        const data = await loadPreview();
        if (!cancelled) {
          setPreview(data);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(getLoadErrorMessage(error));
          setPreview(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void runLoad();

    return () => {
      cancelled = true;
    };
  }, [loadPreview, previewKey]);

  const reloadPreview = async () => {
    setIsLoading(true);
    setLoadError(null);
    setPreview(null);

    try {
      const data = await loadPreview();
      setPreview(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(getLoadErrorMessage(error));
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturn = () => {
    navigate(returnTo, {
      state: {
        initialConversationId: conversationId,
        initialPendingMessageId: pendingMessageId,
      },
    });
  };

  const handleReject = async () => {
    if (!isChatPreview) {
      handleReturn();
      return;
    }

    if (!accessToken || conversationId === undefined || pendingMessageId === undefined) {
      setConfirmError("You must be signed in to cancel this preview.");
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    try {
      await cancelAssistantAction(accessToken, conversationId, pendingMessageId);
      handleReturn();
    } catch (error) {
      const message =
        error instanceof AssistantApiError
          ? error.message
          : "Unable to cancel this workflow.";
      setConfirmError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleModify = () => {
    if (!preview) {
      return;
    }

    navigate(returnTo, {
      state: {
        // Chat previews: leave the input empty. The backend now sends the
        // current structured plan to the model as context on every modify
        // turn (see _build_llm_message in chat.py), so the user only
        // needs to describe their change, not retype the whole request —
        // pre-filling stale original text invited exactly that mistake
        // (e.g. appending a year fix while dropping the description and
        // points that were answered in a later turn).
        // Mock previews have no such backend, so keep the old behavior.
        initialDraft: isChatPreview ? undefined : preview.originalRequest,
        initialConversationId: conversationId,
        initialPendingMessageId: pendingMessageId,
      },
    });
  };

  const handleConfirm = async () => {
    if (!preview) {
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    try {
      if (isChatPreview) {
        if (!accessToken || conversationId === undefined || pendingMessageId === undefined) {
          throw new DryRunPreviewError("You must be signed in to confirm this preview.");
        }

        const result = await confirmAssistantAction(
          accessToken,
          conversationId,
          pendingMessageId,
        );
        setConfirmedMessage(result.content);
      } else {
        // Always throws — mock/?preview demos cannot execute Canvas actions.
        await confirmDryRunPreview(preview.id);
      }

      setShowSuccessToast(true);
      void refreshActiveCourse();
      notifyCoursesChanged();
    } catch (error) {
      const message =
        error instanceof DryRunPreviewError || error instanceof AssistantApiError
          ? error.message
          : "Unable to approve this workflow.";
      setConfirmError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSaveEdits = async (changes: Record<string, unknown>) => {
    if (
      !isChatPreview ||
      !accessToken ||
      conversationId === undefined ||
      pendingMessageId === undefined
    ) {
      setSaveEditsError("This preview cannot be edited here.");
      return;
    }

    setIsSavingEdits(true);
    setSaveEditsError(null);
    try {
      await modifyAssistantAction(
        accessToken,
        conversationId,
        pendingMessageId,
        changes,
      );
      const refreshed = await loadPreview();
      setPreview(refreshed);
      setSaveEditsError(null);
    } catch (error) {
      setSaveEditsError(
        error instanceof AssistantApiError
          ? error.message
          : "Unable to regenerate this preview.",
      );
    } finally {
      setIsSavingEdits(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 p-4 md:p-6 lg:p-8">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading workflow preview...</p>
      </div>
    );
  }

  if (loadError) {
    const isEmpty = previewId === "empty";

    return (
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <AlertCircle className="size-10 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">
                {isEmpty ? "No Preview Available" : "Unable to Load Preview"}
              </h1>
              <p className="text-sm text-muted-foreground">{loadError}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {!isEmpty ? (
                <Button type="button" onClick={() => void reloadPreview()}>
                  Try Again
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={handleReturn}>
                Back to Assistant
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (confirmedMessage) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        {showSuccessToast ? (
          <AdminToast
            message={confirmedMessage}
            onDismiss={() => setShowSuccessToast(false)}
          />
        ) : null}
        <Card className="border-emerald-200 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-100">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">Workflow Approved</h1>
              <p className="text-sm text-muted-foreground" role="status">
                {confirmedMessage}
              </p>
            </div>
            <Button type="button" onClick={handleReturn}>
              Return to Assistant
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-6 lg:p-8">
      <PreviewPanel
        preview={preview}
        isConfirming={isConfirming}
        confirmError={confirmError}
        isSavingEdits={isSavingEdits}
        saveEditsError={saveEditsError}
        onSaveEdits={isChatPreview ? handleSaveEdits : undefined}
        onReject={() => void handleReject()}
        onModify={handleModify}
        onConfirm={() => void handleConfirm()}
      />
    </div>
  );
}

export function DryRunPreviewPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const previewId = searchParams.get("preview") ?? defaultDryRunPreviewId;
  const conversationId = parsePositiveInt(searchParams.get("conversation"));
  const pendingMessageId = parsePositiveInt(searchParams.get("pending"));
  const isChatPreview =
    conversationId !== undefined && pendingMessageId !== undefined;
  const returnTo =
    (location.state as DryRunPreviewLocationState | null)?.returnTo ??
    paths.instructor.assistant;
  const previewKey = isChatPreview
    ? `chat:${conversationId}:${pendingMessageId}`
    : `mock:${previewId}`;

  return (
    <DryRunPreviewContent
      key={previewKey}
      previewKey={previewKey}
      isChatPreview={isChatPreview}
      conversationId={conversationId}
      pendingMessageId={pendingMessageId}
      previewId={previewId}
      returnTo={returnTo}
    />
  );
}
