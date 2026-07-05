import { useState } from "react";
import { useLocation } from "react-router-dom";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { suggestedActions } from "@/data/assistantSeedData";
import {
  InstructorAssistantHeader,
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";

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
  const { activeCourse } = useActiveCourse();
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

  const handleSuggestedAction = (prompt: string) => {
    setPendingPrompt(prompt);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorAssistantHeader />

      {activeCourse ? (
        <p
          role="status"
          className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-[#1e293b]"
        >
          Answering in the context of{" "}
          <span className="font-medium">{activeCourse.displayName}</span>. Select
          a different course from the header to change context.
        </p>
      ) : (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950"
        >
          No active course selected. Choose a course from the header for
          course-specific answers.
        </p>
      )}

      <InstructorAssistantSuggestedActions
        actions={suggestedActions}
        onSelect={handleSuggestedAction}
        disabled={isLoading}
      />

      <ChatWindow
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
      />
    </div>
  );
}
