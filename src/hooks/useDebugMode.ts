"use client";

import { useEffect, useState } from "react";

const environmentDebugMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"
  || process.env.NODE_ENV === "development";

const readQueryDebugMode = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "true";
};

export function useDebugMode() {
  const [queryDebugMode, setQueryDebugMode] = useState(false);

  useEffect(() => {
    const syncQueryDebugMode = () => setQueryDebugMode(readQueryDebugMode());
    syncQueryDebugMode();
    window.addEventListener("popstate", syncQueryDebugMode);
    return () => window.removeEventListener("popstate", syncQueryDebugMode);
  }, []);

  return environmentDebugMode || queryDebugMode;
}
