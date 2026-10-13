"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-requests the server-rendered market data on an interval, so the page
 * follows the chain without a manual reload. Pauses while the tab is hidden.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
