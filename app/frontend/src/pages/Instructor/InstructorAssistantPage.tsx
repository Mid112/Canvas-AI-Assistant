import { useState } from "react";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { suggestedActions } from "@/data/mockAssistantChat";
import {
  InstructorAssistantHeader,
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";

export function InstructorAssistantPage() {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
