import { Circle, Radio } from "lucide-react";
import type { DataStatus } from "@/types/market";

export function StatusLabel({ status }: { status: DataStatus }) {
  const label = {
    live: "Live data",
    loading: "Connecting",
    unavailable: "Not connected",
    error: "Data error",
  }[status];

  return (
    <span className={`status status--${status}`}>
      {status === "live" ? <Radio size={12} /> : <Circle size={8} />}
      {label}
    </span>
  );
}
