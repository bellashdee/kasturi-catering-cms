import { logTaskAudit } from "@/lib/taskProofs/actions";

type AuditInput = Parameters<typeof logTaskAudit>[0];

/**
 * Writes an entry in the audit log (who, what, when: the time is set by the database) for an important action.
 * The action itself has already succeeded, so a failure to write the log entry is reported to the server log and
 * never turns a saved invoice or payment into an error for the person.
 */
export async function recordAudit(input: AuditInput) {
  try {
    await logTaskAudit(input);
  } catch (err) {
    console.warn("Audit log entry could not be written:", input.relatedTable, input.action, err instanceof Error ? err.message : err);
  }
}
