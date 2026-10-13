"use client";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-shell route-state" role="alert">
      <strong>The terminal could not be loaded</strong>
      <p>Something failed while preparing this page. No order or transaction was affected.</p>
      <button type="button" className="connect-button" onClick={reset}>Try again</button>
    </main>
  );
}
