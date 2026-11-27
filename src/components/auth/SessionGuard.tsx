"use client";

import { useEffect } from "react";
import { signOutOfDevice } from "@/lib/offline/signOut";

export const KEEP_SIGNED_IN_KEY = "kcms-keep-signed-in";

/**
 * "Keep me signed in" switched off at the sign-in means: signed out again when the browser is closed. The browser forgets
 * sessionStorage when it is closed, so a missing marker together with that choice means a new browser session.
 */
export function SessionGuard() {
  useEffect(() => {
    try {
      if (localStorage.getItem(KEEP_SIGNED_IN_KEY) === "0" && !sessionStorage.getItem("kcms-alive")) {
        localStorage.removeItem(KEEP_SIGNED_IN_KEY);
        // nothing is asked: changes not sent yet stay on this device for this person
        void signOutOfDevice(undefined, { ask: false }).then(() => window.location.assign("/login"));
        return;
      }
      sessionStorage.setItem("kcms-alive", "1");
    } catch {
      /* the browser does not keep it: nothing to do */
    }
  }, []);
  return null;
}
