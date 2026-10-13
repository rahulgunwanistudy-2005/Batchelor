import type { DataStatus } from "@/types/market";

const LABELS: Record<DataStatus, string> = {
  live: "Reading from the contract",
  loading: "Connecting",
  unavailable: "No market configured",
  error: "Contract could not be read",
};

export function StatusLabel({ status }: { status: DataStatus }) {
  const tone = status === "live" ? "ok" : status === "error" ? "error" : status === "loading" ? "pending" : "off";
  return (
    <span className={`status status--${status}`}>
      <span className={`system-dot system-dot--${tone}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
