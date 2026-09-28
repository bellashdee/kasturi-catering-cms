"use client";

import { decideOvertime } from "@/lib/hr/actions";
import { DecisionButtons } from "./DecisionButtons";

export function OvertimeRowActions({ overtimeId }: { overtimeId: string }) {
  return (
    <DecisionButtons
      onApprove={() => decideOvertime(overtimeId, "approved")}
      onReject={() => decideOvertime(overtimeId, "rejected")}
    />
  );
}
