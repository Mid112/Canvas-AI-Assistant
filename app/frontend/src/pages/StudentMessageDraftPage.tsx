import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  MessageDraftPage,
  MessageDraftPageHeader,
} from "@/components/messages/MessageDraftPage";
import type { FetchMessageDraftOptions } from "@/types/messageDraft";

export function StudentMessageDraftPage() {
  const [searchParams] = useSearchParams();

  const fetchOptions = useMemo<FetchMessageDraftOptions>(
    () => ({
      emptyRecipients: searchParams.get("empty") === "true",
      simulateLoadError: searchParams.get("loadError") === "true",
    }),
    [searchParams],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <MessageDraftPageHeader />
      <MessageDraftPage fetchOptions={fetchOptions} />
    </div>
  );
}
