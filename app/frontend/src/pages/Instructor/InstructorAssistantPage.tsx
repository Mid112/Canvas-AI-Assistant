import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveCourseContextBar } from "@/components/courses/ActiveCourseContextBar";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { buildSuggestedActions } from "@/data/assistantSeedData";
import {
  createDefaultLlmProviderSettings,
  getLlmProviderOption,
} from "@/data/llmProviders";
import {
  getStoredLlmProviderSettings,
  setStoredLlmProviderSettings,
} from "@/lib/llm-provider-storage";
import {
  InstructorAssistantHeader,
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";
import { instructorSettingsPath } from "@/routes/paths";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

interface InstructorAssistantLocationState {
  initialPrompt?: string;
  initialDraft?: string;
  initialConversationId?: number;
  initialPendingMessageId?: number;
}

function getLocationState(
  state: InstructorAssistantLocationState | null | undefined,
): InstructorAssistantLocationState {
  return state ?? {};
}

export function InstructorAssistantPage() {
  const location = useLocation();
  const { user } = useAuth();
  const { activeCourse } = useActiveCourse();
  const hasCanvas = Boolean(user?.has_canvas_token);
  const suggestedActions = useMemo(
    () => buildSuggestedActions(activeCourse?.displayName),
    [activeCourse?.displayName],
  );
  const [locationState] = useState(() =>
    getLocationState(
      location.state as InstructorAssistantLocationState | null,
    ),
  );
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(
    () => locationState.initialPrompt ?? null,
  );
  const [pendingDraft, setPendingDraft] = useState<string | null>(
    () => locationState.initialDraft ?? null,
  );
  const [pendingConversationId, setPendingConversationId] = useState<
    number | undefined
  >(() => locationState.initialConversationId);
  const [pendingMessageId, setPendingMessageId] = useState<number | undefined>(
    () => locationState.initialPendingMessageId,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LlmProviderSettings>(() =>
    user
      ? getStoredLlmProviderSettings(user.id)
      : createDefaultLlmProviderSettings(),
  );

  const handleModelProviderChange = useCallback(
    (providerId: LlmProviderId) => {
      const option = getLlmProviderOption(providerId);
      const next: LlmProviderSettings = {
        provider: providerId,
        model: option.defaultModel,
        baseUrl:
          providerId === "openai_compatible_custom" ? llmSettings.baseUrl : "",
      };
      setLlmSettings(next);
      if (user) {
        setStoredLlmProviderSettings(user.id, next);
      }
    },
    [llmSettings.baseUrl, user],
  );

  const handleSuggestedAction = (prompt: string) => {
    setPendingPrompt(prompt);
  };

  const previousCourseIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const nextCourseId = activeCourse?.localId ?? null;
    const previousCourseId = previousCourseIdRef.current;
    previousCourseIdRef.current = nextCourseId;
    if (previousCourseId === undefined || previousCourseId === nextCourseId) {
      return;
    }
    if (previousCourseId === null && nextCourseId !== null) {
      return;
    }
    setPendingPrompt(null);
    setPendingDraft(null);
    setPendingConversationId(undefined);
    setPendingMessageId(undefined);
  }, [activeCourse?.localId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorAssistantHeader />

      {!hasCanvas ? (
        <Card className="border-primary/20 bg-primary/5 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <p className="text-muted-foreground">
              You can use the assistant now for general guidance and workflow
              planning. Connect Canvas in Settings to load courses, preview
              changes, and publish to your LMS.
            </p>
            <Button
              variant="outline"
              size="sm"
              render={<Link to={instructorSettingsPath("canvas")} />}
            >
              Connect Canvas
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ActiveCourseContextBar />
      )}

      <InstructorAssistantSuggestedActions
        actions={suggestedActions}
        onSelect={handleSuggestedAction}
        disabled={isLoading}
      />

      <ChatWindow
        key={activeCourse?.localId ?? "no-course"}
        initialPrompt={pendingPrompt}
        initialDraft={pendingDraft}
        initialConversationId={pendingConversationId}
        initialPendingMessageId={pendingMessageId}
        onInitialPromptConsumed={() => setPendingPrompt(null)}
        onModifyContextConsumed={() => {
          setPendingDraft(null);
          setPendingConversationId(undefined);
          setPendingMessageId(undefined);
        }}
        onLoadingChange={setIsLoading}
        modelSettings={llmSettings}
        onModelProviderChange={handleModelProviderChange}
      />
    </div>
  );
}
