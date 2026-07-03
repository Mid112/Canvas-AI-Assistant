import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { AdminToast } from "@/components/admin/AdminToast";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { defaultDryRunPreviewId } from "@/data/mockDryRunPreview";
import { paths } from "@/routes/paths";
import {
  confirmDryRunPreview,
  DryRunPreviewError,
  fetchDryRunPreview,
} from "@/services/dryRunPreview";
import type { DryRunPreviewData } from "@/types/dryRunPreview";

interface DryRunPreviewLocationState {
  returnTo?: string;
}

export function DryRunPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const previewId = searchParams.get("preview") ?? defaultDryRunPreviewId;
  const returnTo =
    (location.state as DryRunPreviewLocationState | null)?.returnTo ??
    paths.instructor.assistant;

  const [preview, setPreview] = useState<DryRunPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const getLoadErrorMessage = useCallback((error: unknown) => {
    return error instanceof DryRunPreviewError
      ? error.message
      : "Unable to load the workflow preview.";
  }, []);

  const reloadPreview = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setPreview(null);

    try {
      const data = await fetchDryRunPreview(previewId);
      setPreview(data);
    } catch (error) {
      setLoadError(getLoadErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [getLoadErrorMessage, previewId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        const data = await fetchDryRunPreview(previewId);
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

    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load
    setIsLoading(true);
    setLoadError(null);
    setPreview(null);
    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [getLoadErrorMessage, previewId]);

  const handleReturn = () => {
    navigate(returnTo);
  };

  const handleModify = () => {
    if (!preview) {
      return;
    }

    navigate(returnTo, { state: { initialPrompt: preview.originalRequest } });
  };

  const handleConfirm = async () => {
    if (!preview) {
      return;
    }

    setIsConfirming(true);
    setConfirmError(null);

    try {
      const result = await confirmDryRunPreview(preview.id);
      setConfirmedMessage(result.message);
      setShowSuccessToast(true);
    } catch (error) {
      const message =
        error instanceof DryRunPreviewError
          ? error.message
          : "Unable to approve this workflow.";
      setConfirmError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 p-4 md:p-6 lg:p-8">
        <Loader2 className="size-8 animate-spin text-[#2563eb]" aria-hidden="true" />
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
              <h1 className="text-xl font-semibold text-[#1e293b]">
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
              <h1 className="text-xl font-semibold text-[#1e293b]">Workflow Approved</h1>
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
        onReject={handleReturn}
        onModify={handleModify}
        onConfirm={() => void handleConfirm()}
      />
    </div>
  );
}
