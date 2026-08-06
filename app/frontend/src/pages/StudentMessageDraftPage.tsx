// Page note: coordinates the student message draft page screen from smaller components and route-level data.

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  MessageDraftPage,
  MessageDraftPageHeader,
} from "@/components/messages/MessageDraftPage";
import type { FetchMessageDraftOptions } from "@/types/messageDraft";
import { pageShell } from "@/lib/page-shell";

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
    <div className={pageShell}>
      <MessageDraftPageHeader />
      <MessageDraftPage fetchOptions={fetchOptions} />
    </div>
  );
}
