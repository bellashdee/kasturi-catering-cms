import { createClient } from "@/lib/supabase/client";
import { clearOfflineDataForSignOut, syncStore, unsentCount } from "./sync";

/**
 * Sign-out of this device. Before signing out, the person is told about changes still waiting to be sent: they are kept (never
 * lost, only for this person) and sent the next time the same person signs in here. The pages and data kept for offline use are removed.
 * Returns false when the person chose to stay signed in.
 */
export async function signOutOfDevice(translate: (text: string) => string = (s) => s, options: { ask?: boolean } = {}): Promise<boolean> {
  const userId = syncStore.get().userId;
  if (userId && options.ask !== false) {
    const waiting = await unsentCount(userId);
    if (waiting > 0 && !window.confirm(translate(`${waiting} change(s) made offline have not been sent yet. They stay safely on this device and are sent the next time you sign in here. Sign out now?`))) {
      return false;
    }
  }
  await createClient().auth.signOut();
  if (userId) await clearOfflineDataForSignOut(userId);
  return true;
}
