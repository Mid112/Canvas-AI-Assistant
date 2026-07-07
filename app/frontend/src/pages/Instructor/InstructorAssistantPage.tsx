import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { paths } from "@/routes/paths";
import {
  InstructorAssistantHeader,
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";
import { suggestedActions } from "@/data/assistantSeedData";
import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";

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
  const { activeCourse, isLoading: isActiveCourseLoading } = useActiveCourse();
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

      {!user?.has_canvas_token ? (
        <CanvasConnectionRequired description="Connect Canvas to use the AI assistant with your courses and assignments." />
      ) : (
        <>
      {isActiveCourseLoading ? (
          <p
            role="status"
            className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-[#1e293b]"
          >
            Loading your active course...
          </p>
        ) : activeCourse ? (
          <p
            role="status"
            className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-[#1e293b]"
          >
            Answering in the context of{" "}
            <span className="font-medium">{activeCourse.displayName}</span>. Use{" "}
            <Link to={paths.instructor.courses} className="font-medium underline">
              Course Management
            </Link>{" "}
            to set a different active course.
          </p>
        ) : (
          <p
            role="status"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950"
          >
            No active course selected. Open{" "}
            <Link to={paths.instructor.courses} className="font-medium underline">
              Course Management
            </Link>{" "}
            and choose Set Active on a course for course-specific answers.
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
        </>
      )}
    </div>
  );
}
