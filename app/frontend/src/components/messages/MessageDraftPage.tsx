import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Bot, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { ConfirmationDialog } from "@/components/messages/ConfirmationDialog";
import { MessageEditor } from "@/components/messages/MessageEditor";
import { MessagePreview } from "@/components/messages/MessagePreview";
import { MessageTemplateSummary } from "@/components/messages/MessageTemplateSummary";
import {
  messageDraftSchema,
  type MessageDraftFormSchema,
} from "@/components/messages/messageDraftSchema";
import { MessageToolbar } from "@/components/messages/MessageToolbar";
import { RecipientSummary } from "@/components/messages/RecipientSummary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import { fetchMessageDraft, sendMessageDraft } from "@/services/messageDraft";
import type {
  FetchMessageDraftOptions,
  MessageDraft,
  MessageDraftPageState,
} from "@/types/messageDraft";

interface MessageDraftPageProps {
  fetchOptions?: FetchMessageDraftOptions;
  onCancel?: () => void;
}

export function MessageDraftPage({ fetchOptions, onCancel }: MessageDraftPageProps) {
  const [pageState, setPageState] = useState<MessageDraftPageState>("loading");
  const [draft, setDraft] = useState<MessageDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const {
    register,
    control,
    reset,
    trigger,
    formState: { errors, isValid, isDirty },
  } = useForm<MessageDraftFormSchema>({
    resolver: zodResolver(messageDraftSchema),
    defaultValues: {
      subject: "",
      body: "",
    },
    mode: "onChange",
  });

  const subjectValue = useWatch({ control, name: "subject", defaultValue: "" });
  const bodyValue = useWatch({ control, name: "body", defaultValue: "" });

  const loadDraft = useCallback(async () => {
    setPageState("loading");
    setLoadError(null);
    setSendError(null);
    setSuccessMessage(null);

    try {
      // Placeholder API — loads mock draft data until backend Canvas messaging exists.
      const loadedDraft = await fetchMessageDraft(fetchOptions);
      setDraft(loadedDraft);
      reset({
        subject: loadedDraft.subject,
        body: loadedDraft.body,
      });
      setPageState("editing");
      void trigger();
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load message draft. Please try again.",
      );
      setPageState("editing");
    }
  }, [fetchOptions, reset, trigger]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async draft load on mount
    void loadDraft();
  }, [loadDraft]);

  const previewValues = useMemo(
    () => ({
      subject: subjectValue,
      body: bodyValue,
    }),
    [subjectValue, bodyValue],
  );

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }

    if (draft) {
      reset({
        subject: draft.subject,
        body: draft.body,
      });
    }

    setSendError(null);
    setSuccessMessage(null);
    setIsPreviewOpen(false);
    setIsConfirmOpen(false);
  };

  const handleSendClick = () => {
    setSendError(null);
    setSuccessMessage(null);
    setIsConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    if (!draft) {
      return;
    }

    setPageState("sending");
    setSendError(null);

    try {
      // Placeholder API — simulates Canvas send; no real message is delivered yet.
      await sendMessageDraft({
        draftId: draft.id,
        subject: subjectValue.trim(),
        body: bodyValue.trim(),
        recipientIds: draft.recipients.map((recipient) => recipient.id),
      });

      setIsConfirmOpen(false);
      setSuccessMessage(
        `Message sent successfully to ${draft.recipients.length} student${
          draft.recipients.length === 1 ? "" : "s"
        }.`,
      );
      setPageState("success");
    } catch (error) {
      setIsConfirmOpen(false);
      setSendError(
        error instanceof Error
          ? error.message
          : "Unable to send message. Please try again.",
      );
      setPageState("editing");
    }
  };

  const handleComposeAnother = () => {
    setSuccessMessage(null);
    setSendError(null);
    void loadDraft();
  };

  if (pageState === "success" && draft) {
    return (
      <div className="space-y-6">
        {successMessage ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"
          >
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        ) : null}

        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3 text-emerald-700">
              <CheckCircle2 className="size-6" aria-hidden="true" />
              <CardTitle>Message Sent</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Your message has been queued for delivery through Canvas.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MessagePreview
              recipients={draft.recipients}
              subject={subjectValue}
              body={bodyValue}
            />
          </CardContent>
          <CardFooter className="border-t bg-transparent">
            <Button type="button" onClick={handleComposeAnother}>
              Compose Another Message
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isLoading = pageState === "loading";
  const recipientCount = draft?.recipients.length ?? 0;

  return (
    <div className="space-y-6">
      {loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 size-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadDraft()}>
            Retry
          </Button>
        </div>
      ) : null}

      {sendError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <AlertCircle
            className="mt-0.5 size-5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="text-sm text-destructive">{sendError}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <RecipientSummary recipients={draft?.recipients ?? []} />
          <MessageTemplateSummary
            selectedTemplateId={draft?.templateId}
            selectedTemplateName={draft?.templateName}
          />
        </aside>

        <section>
          <Card className="flex min-h-[520px] flex-col shadow-sm ring-1 ring-border/60">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-base">Review Message Draft</CardTitle>
              <p className="text-sm text-muted-foreground">
                Edit the generated message, preview it, then send when ready.
              </p>
            </CardHeader>

            {isLoading ? (
              <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2
                  className="size-8 animate-spin text-blue-600"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">Loading message draft...</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Fetching AI-generated content and recipient details.
                </p>
              </CardContent>
            ) : (
              <>
                <CardContent className="flex-1 py-6">
                  <MessageEditor
                    register={register}
                    errors={errors}
                    bodyValue={bodyValue}
                    hasUnsavedChanges={isDirty}
                    disabled={pageState === "sending"}
                  />
                </CardContent>
                <CardFooter className="mt-auto flex-col gap-0 border-t bg-muted/20 px-6 py-4">
                  <MessageToolbar
                    onPreview={() => setIsPreviewOpen(true)}
                    onCancel={handleCancel}
                    onSend={handleSendClick}
                    isSending={pageState === "sending"}
                    isValid={isValid}
                    hasRecipients={recipientCount > 0}
                    disabled={isLoading}
                  />
                </CardFooter>
              </>
            )}
          </Card>
        </section>
      </div>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
            <DialogDescription>
              Review exactly what will be sent. This preview is read-only.
            </DialogDescription>
          </DialogHeader>
          <MessagePreview
            recipients={draft?.recipients ?? []}
            subject={previewValues.subject}
            body={previewValues.body}
          />
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        recipientCount={recipientCount}
        isSending={pageState === "sending"}
        onConfirm={() => void handleConfirmSend()}
      />
    </div>
  );
}

export function MessageDraftPageHeader() {
  return (
    <header>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center",
            dashboardColors.purple.iconSquare,
          )}
        >
          <Bot className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            AI Message Drafting
          </h1>
          <p className="text-muted-foreground">
            Generate personalized messages for students
          </p>
        </div>
      </div>
    </header>
  );
}
