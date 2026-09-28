"use client";

import { decideLeave } from "@/lib/hr/actions";
import { DecisionButtons } from "./DecisionButtons";

export function LeaveRowActions({ leaveId }: { leaveId: string }) {
  return (
    <DecisionButtons
      onApprove={() => decideLeave(leaveId, "approved")}
      onReject={() => decideLeave(leaveId, "rejected")}
    />
  );
}
