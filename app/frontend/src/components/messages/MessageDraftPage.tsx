import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Bot, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useLocation } from "react-router-dom";

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
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { mockMessageTemplates } from "@/data/mockMessageDraft";
import {
  discardTypedDraft,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { AiMessageDraftLocationState } from "@/routes/paths";
import {
  fetchMessageDraft,
  isMessageDraftSendMocked,
  sendMessageDraft,
} from "@/services/messageDraft";
import type {
  FetchMessageDraftOptions,
  MessageDraft,
  MessageDraftPageState,
  MessageRecipient,
} from "@/types/messageDraft";

interface MessageDraftPageProps {
  fetchOptions?: FetchMessageDraftOptions;
  onCancel?: () => void;
}

const TEMPLATE_PRESETS = {
  "assignment-reminder": {
    name: "Assignment Reminder",
    subject: "Assignment Reminder: Course Update",
    body: "Remind students about the assignment, due date, and any next steps.",
    subjectPlaceholder: "Reminder: Assignment due Friday",
    bodyPlaceholder: "Hi everyone, this is a reminder that...",
  },
  encouragement: {
    name: "Encouragement",
    subject: "Keep Going",
    body: "Write an encouraging note that helps students stay engaged.",
    subjectPlaceholder: "A quick note of encouragement",
    bodyPlaceholder: "Hi everyone, I wanted to recognize your effort...",
  },
  "course-announcement": {
    name: "Course Announcement",
    subject: "Course Announcement",
    body: "Share an important update with your class.",
    subjectPlaceholder: "Important course update",
    bodyPlaceholder: "Hi everyone, I’m sharing an update about...",
  },
} as const;

type MessageTemplateId = keyof typeof TEMPLATE_PRESETS;

const TEMPLATE_SUBJECTS = new Set(
  Object.values(TEMPLATE_PRESETS).map((preset) => preset.subject),
);
const TEMPLATE_BODIES = new Set(
  Object.values(TEMPLATE_PRESETS).map((preset) => preset.body),
);

function isMessageTemplateId(templateId: string | undefined): templateId is MessageTemplateId {
  return Boolean(templateId && templateId in TEMPLATE_PRESETS);
}

function canReplaceSubject(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || TEMPLATE_SUBJECTS.has(trimmed);
}

function canReplaceBody(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || TEMPLATE_BODIES.has(trimmed);
}

export function MessageDraftPage({ fetchOptions, onCancel }: MessageDraftPageProps) {
  const { accessToken, user } = useAuth();
  const location = useLocation();
  const typedDraftId = (location.state as AiMessageDraftLocationState | null)
    ?.typedDraftId;
  const [savedTypedDraftId, setSavedTypedDraftId] = useState<string | undefined>(
    typedDraftId,
  );
  const [draftSaveStatus, setDraftSaveStatus] = useState<string | null>(null);
  const [pageState, setPageState] = useState<MessageDraftPageState>("loading");
  const [draft, setDraft] = useState<MessageDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | undefined>();
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(
    new Set(),
  );

  const {
    register,
    control,
    reset,
    setValue,
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
      if (!accessToken) {
        throw new Error("You must be signed in to load message drafts.");
      }

      const loadedDraft = await fetchMessageDraft(accessToken, fetchOptions);
      setDraft(loadedDraft);
      setRecipients(loadedDraft.recipients);
      const preferred = fetchOptions?.preSelectedIds;
      const initialSelectedRecipientIds =
        preferred && preferred.length > 0
          ? new Set(
            loadedDraft.recipients
              .map((recipient) => recipient.id)
              .filter((id) => preferred.includes(id)),
          )
          : new Set<string>();
      const initialTemplateId: MessageTemplateId =
        // Delivery scope is encoded by recipient selection: no selected
        // students means the backend will post a course announcement.
        initialSelectedRecipientIds.size === 0
          ? "course-announcement"
          : isMessageTemplateId(loadedDraft.templateId)
            ? loadedDraft.templateId
            : "assignment-reminder";
      const initialPreset = TEMPLATE_PRESETS[initialTemplateId];
      const canUseTemplateDefault = !fetchOptions?.subject && !fetchOptions?.body;

      setSelectedTemplateId(initialTemplateId);
      setSelectedTemplateName(initialPreset.name);
      setSelectedRecipientIds(initialSelectedRecipientIds);
      reset({
        subject:
          canUseTemplateDefault || canReplaceSubject(loadedDraft.subject)
            ? initialPreset.subject
            : loadedDraft.subject,
        body:
          canUseTemplateDefault || canReplaceBody(loadedDraft.body)
            ? initialPreset.body
            : loadedDraft.body,
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
  }, [accessToken, fetchOptions, reset, trigger]);

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

  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selectedRecipientIds.has(recipient.id)),
    [recipients, selectedRecipientIds],
  );

  const selectedPreset = isMessageTemplateId(selectedTemplateId)
    ? TEMPLATE_PRESETS[selectedTemplateId]
    : undefined;

  const applyTemplatePreset = useCallback((
    templateId: MessageTemplateId,
    options: { force?: boolean } = {},
  ) => {
    const preset = TEMPLATE_PRESETS[templateId];
    setSelectedTemplateId(templateId);
    setSelectedTemplateName(preset.name);

    if (options.force || canReplaceSubject(subjectValue)) {
      setValue("subject", preset.subject, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if (options.force || canReplaceBody(bodyValue)) {
      setValue("body", preset.body, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [bodyValue, setValue, subjectValue]);

  const syncTemplateForRecipientSelection = useCallback((
    nextSelectedRecipientIds: ReadonlySet<string>,
  ) => {
    // Keep template selection aligned with delivery scope without using an
    // effect that sets state during render cleanup/lint-sensitive phases.
    if (
      nextSelectedRecipientIds.size === 0 &&
      selectedTemplateId !== "course-announcement"
    ) {
      applyTemplatePreset("course-announcement");
      return;
    }

    if (
      nextSelectedRecipientIds.size > 0 &&
      selectedTemplateId === "course-announcement"
    ) {
      applyTemplatePreset("assignment-reminder");
    }
  }, [applyTemplatePreset, selectedTemplateId]);

  const handleToggleRecipient = (recipientId: string) => {
    const next = new Set(selectedRecipientIds);
    if (next.has(recipientId)) {
      next.delete(recipientId);
    } else {
      next.add(recipientId);
    }
    setSelectedRecipientIds(next);
    syncTemplateForRecipientSelection(next);
  };

  const handleRemoveRecipient = (recipientId: string) => {
    setRecipients((prev) => prev.filter((recipient) => recipient.id !== recipientId));
    const next = new Set(selectedRecipientIds);
    next.delete(recipientId);
    setSelectedRecipientIds(next);
    syncTemplateForRecipientSelection(next);
  };

  const handleSelectAllRecipients = () => {
    const next =
      selectedRecipientIds.size === recipients.length
        ? new Set<string>()
        : new Set(recipients.map((recipient) => recipient.id));
    setSelectedRecipientIds(next);
    syncTemplateForRecipientSelection(next);
  };

  const handleSelectTemplate = (templateId: string) => {
    const template = mockMessageTemplates.find((item) => item.id === templateId);
    setSelectedTemplateId(template?.id);
    setSelectedTemplateName(template?.name);

    if (!isMessageTemplateId(templateId)) {
      return;
    }

    if (templateId !== "course-announcement" && selectedRecipientIds.size === 0) {
      // Student-message templates need at least one selected student. With an
      // empty audience, stay in the explicit announcement path.
      applyTemplatePreset("course-announcement");
      return;
    }

    if (templateId === "course-announcement") {
      setSelectedRecipientIds(new Set());
    }

    applyTemplatePreset(templateId, { force: true });
  };

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
    setIsConfirmOpen(false);
  };

  const handleSendClick = () => {
    setSendError(null);
    setSuccessMessage(null);
    setIsConfirmOpen(true);
  };

  const handleSaveTypedDraft = () => {
    if (!user?.id) return;
    const subject = subjectValue.trim();
    const body = bodyValue.trim();
    if (!subject && !body) {
      setDraftSaveStatus("Add a subject or body before saving a draft.");
      return;
    }
    const saved = saveTypedDraft(user.id, {
      id: savedTypedDraftId,
      kind: "message",
      content: {
        ...(subject ? { title: subject } : {}),
        ...(body ? { body } : {}),
      },
    });
    setSavedTypedDraftId(saved.id);
    setDraftSaveStatus("Draft saved. Resume it anytime from the assistant.");
  };

  const handleConfirmSend = async () => {
    if (!draft) {
      return;
    }

    setPageState("sending");
    setSendError(null);

    try {
      if (!accessToken) {
        throw new Error("You must be signed in to send messages.");
      }

      await sendMessageDraft(accessToken, {
        draftId: draft.id,
        subject: subjectValue.trim(),
        body: bodyValue.trim(),
        recipientIds: selectedRecipients.map((recipient) => recipient.id),
        recipients: selectedRecipients,
        conversationId: fetchOptions?.conversationId,
      });

      if (user?.id && savedTypedDraftId) {
        discardTypedDraft(user.id, savedTypedDraftId);
        setSavedTypedDraftId(undefined);
      }

      setIsConfirmOpen(false);
      setSuccessMessage(
        isMessageDraftSendMocked
          ? selectedRecipients.length === 0
            ? "Course announcement draft approved. No announcement has been posted through Canvas yet."
            : `Draft approved for ${selectedRecipients.length} student${
                selectedRecipients.length === 1 ? "" : "s"
              }. No message has been sent through Canvas yet.`
          : selectedRecipients.length === 0
            ? "Course announcement posted successfully."
            : `Message sent successfully to ${selectedRecipients.length} student${
                selectedRecipients.length === 1 ? "" : "s"
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
              <CardTitle>
                {isMessageDraftSendMocked ? "Draft Approved" : "Message Sent"}
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              {isMessageDraftSendMocked
                ? "Canvas messaging is not connected yet. This step recorded your review only—nothing was delivered to students."
                : "Your message has been queued for delivery through Canvas."}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <MessagePreview
              recipients={selectedRecipients}
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
          <RecipientSummary
            recipients={recipients}
            selectedIds={selectedRecipientIds}
            onToggle={handleToggleRecipient}
            onRemove={handleRemoveRecipient}
            onSelectAll={handleSelectAllRecipients}
          />
          <MessageTemplateSummary
            selectedTemplateId={selectedTemplateId}
            selectedTemplateName={selectedTemplateName}
            onSelectTemplate={handleSelectTemplate}
          />
        </aside>

        <section>
          <Card className="flex min-h-[520px] flex-col shadow-sm ring-1 ring-border/60">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-base">Review Message Draft</CardTitle>
              <p className="text-sm text-muted-foreground">
                Edit the generated message, then send when ready. You&apos;ll
                see the full message again before it goes out.
              </p>
            </CardHeader>

            {isLoading ? (
              <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2
                  className="size-8 animate-spin text-primary"
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
                    subjectPlaceholder={selectedPreset?.subjectPlaceholder}
                    bodyPlaceholder={selectedPreset?.bodyPlaceholder}
                    hasUnsavedChanges={isDirty}
                    disabled={pageState === "sending"}
                  />
                </CardContent>
                <CardFooter className="mt-auto flex-col gap-3 border-t bg-muted/20 px-6 py-4">
                  {draftSaveStatus ? (
                    <p role="status" className="w-full text-sm text-muted-foreground">
                      {draftSaveStatus}
                    </p>
                  ) : null}
                  <MessageToolbar
                    onCancel={handleCancel}
                    onSend={handleSendClick}
                    onSaveDraft={handleSaveTypedDraft}
                    isSending={pageState === "sending"}
                    isValid={isValid}
                    disabled={isLoading}
                  />
                </CardFooter>
              </>
            )}
          </Card>
        </section>
      </div>

      <ConfirmationDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        recipients={recipients}
        selectedRecipientIds={selectedRecipientIds}
        onToggleRecipient={handleToggleRecipient}
        onRemoveRecipient={handleRemoveRecipient}
        subject={previewValues.subject}
        body={previewValues.body}
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
