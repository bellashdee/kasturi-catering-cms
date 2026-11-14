/**
 * Opens a link that is only known after a wait (a signed file link from the server) in a new tab.
 * Phone browsers (Safari, Chrome on Android, the installed app) block a new tab opened after a wait, so the tab is opened at once,
 * at the moment of the tap, and sent to the link when it arrives. Call it in the click handler BEFORE the first await.
 * If the browser still refuses a new tab, the link opens in the same tab instead.
 */
export function reserveTab(): { go: (url: string) => void; cancel: () => void } {
  let tab: Window | null = null;
  try {
    tab = window.open("", "_blank");
    if (tab) tab.document.write('<p style="font-family:sans-serif;padding:24px;color:#555">Opening the file…</p>');
  } catch {
    tab = null;
  }
  return {
    go(url) {
      if (tab && !tab.closed) {
        try {
          tab.opener = null;
        } catch {}
        tab.location.href = url;
      } else window.location.assign(url);
    },
    cancel() {
      if (tab && !tab.closed) tab.close();
    },
  };
}
