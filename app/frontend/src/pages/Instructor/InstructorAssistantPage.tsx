import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { suggestedActions } from "@/data/mockAssistantChat";
import {
  InstructorAssistantHeader,
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";

interface InstructorAssistantLocationState {
  initialPrompt?: string;
}

export function InstructorAssistantPage() {
  const location = useLocation();
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const initialPrompt = (
      location.state as InstructorAssistantLocationState | null
    )?.initialPrompt;

    if (initialPrompt) {
      setPendingPrompt(initialPrompt);
    }
  }, [location.state]);

  const handleSuggestedAction = (prompt: string) => {
    setPendingPrompt(prompt);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorAssistantHeader />

      <InstructorAssistantSuggestedActions
        actions={suggestedActions}
        onSelect={handleSuggestedAction}
        disabled={isLoading}
      />

      <ChatWindow
        initialPrompt={pendingPrompt}
        onInitialPromptConsumed={() => setPendingPrompt(null)}
        onLoadingChange={setIsLoading}
      />
    </div>
  );
}
