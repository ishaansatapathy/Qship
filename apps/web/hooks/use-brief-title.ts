"use client";

import { useSyncExternalStore } from "react";

import { briefTitleFromTimezoneOffset } from "@repo/services/pipeline-brief-time";

function getSnapshot() {
  return briefTitleFromTimezoneOffset(new Date().getTimezoneOffset());
}

/** Client-local brief title — avoids SSR/server timezone showing the wrong period. */
export function useBriefTitle(fallback = "Pipeline brief") {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return isClient ? getSnapshot() : fallback;
}
