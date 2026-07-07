import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  MessageDraftPage,
  MessageDraftPageHeader,
} from "@/components/messages/MessageDraftPage";
import type { FetchMessageDraftOptions } from "@/types/messageDraft";

interface StudentMessageDraftPageProps {
  fetchOptions?: FetchMessageDraftOptions;
}

export function StudentMessageDraftPage({
  fetchOptions: providedFetchOptions,
}: StudentMessageDraftPageProps = {}) {
  const [searchParams] = useSearchParams();

  const queryFetchOptions = useMemo<FetchMessageDraftOptions>(
    () => ({
      emptyRecipients: searchParams.get("empty") === "true",
      simulateLoadError: searchParams.get("loadError") === "true",
    }),
    [searchParams],
  );

  const fetchOptions = useMemo<FetchMessageDraftOptions>(
    () => ({
      ...queryFetchOptions,
      ...providedFetchOptions,
      simulateLoadError: queryFetchOptions.simulateLoadError,
    }),
    [providedFetchOptions, queryFetchOptions],
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <MessageDraftPageHeader />
      <MessageDraftPage fetchOptions={fetchOptions} />
    </div>
  );
}
