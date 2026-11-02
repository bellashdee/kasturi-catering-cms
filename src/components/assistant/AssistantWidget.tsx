"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantChat } from "./AssistantChat";

const SIZE = 56; // the round button (h-14 w-14)
const MARGIN = 12;
const DRAG_THRESHOLD = 6;
const STORAGE_KEY = "assistant-button-position";
const PANEL_W = 380;
const PANEL_H = 520;

type Pos = { x: number; y: number };

/** Keeps the button fully on the screen. */
function clamp(p: Pos): Pos {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, w - SIZE - MARGIN)), y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, h - SIZE - MARGIN)) };
}

/** Like the iPhone's home button: after it is let go it settles against the nearest side of the screen. */
function snapToSide(p: Pos): Pos {
  const c = clamp(p);
  const left = c.x + SIZE / 2 < window.innerWidth / 2;
  return { x: left ? MARGIN : window.innerWidth - SIZE - MARGIN, y: c.y };
}

function readSaved(): Pos | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { fx?: number; fy?: number };
    if (typeof v.fx !== "number" || typeof v.fy !== "number") return null;
    return snapToSide({ x: v.fx * window.innerWidth, y: v.fy * window.innerHeight });
  } catch {
    return null;
  }
}

function save(p: Pos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fx: p.x / window.innerWidth, fy: p.y / window.innerHeight }));
  } catch {
    /* the position is just not remembered */
  }
}

/**
 * Floating "Ask AI" button available from any authenticated page — mounted once in the dashboard layout. It can be dragged anywhere
 * (it settles against the nearest side, like the iPhone home button) and remembers where it was left. A tap opens the chat next to it.
 * Hidden on /ai-assistant itself since that page already shows the full-size chat.
 */
export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  // where the button is (bottom right until it is moved); kept on the screen when the window changes size
  useEffect(() => {
    const place = () => setPos((cur) => (cur ? snapToSide(cur) : (readSaved() ?? { x: window.innerWidth - SIZE - 24, y: window.innerHeight - SIZE - 24 })));
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y, moved: false };
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    setDragging(true);
    setPos(clamp({ x: d.originX + dx, y: d.originY + dy }));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      drag.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (!d) return;
      if (d.moved) {
        setDragging(false);
        setPos((cur) => {
          const next = cur ? snapToSide(cur) : cur;
          if (next) save(next);
          return next;
        });
      } else {
        setOpen((v) => !v);
      }
    },
    [],
  );

  if (pathname?.startsWith("/ai-assistant") || !pos) return null;

  // the chat opens beside the button: on the side with room, above or below it
  const w = typeof window === "undefined" ? 1200 : window.innerWidth;
  const h = typeof window === "undefined" ? 800 : window.innerHeight;
  const panelW = Math.min(PANEL_W, w - 2 * MARGIN);
  const panelH = Math.min(PANEL_H, h - 2 * MARGIN - SIZE - 8);
  const panelLeft = Math.min(Math.max(MARGIN, pos.x + SIZE / 2 > w / 2 ? pos.x + SIZE - panelW : pos.x), w - panelW - MARGIN);
  const above = pos.y + SIZE / 2 > h / 2;
  const panelTop = above ? Math.max(MARGIN, pos.y - panelH - 8) : Math.min(h - panelH - MARGIN, pos.y + SIZE + 8);

  // the page is enlarged with CSS zoom when a bigger font size is chosen in Settings; the button and the chat are placed in real screen
  // pixels, so the zoom is cancelled here (otherwise the button lands beyond the right edge and cannot be seen)
  return (
    <div style={{ zoom: "calc(1 / var(--ui-zoom, 1))" }}>
      {open && (
        <div style={{ left: panelLeft, top: panelTop, width: panelW, height: panelH }} className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl print:hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-[13.5px] font-bold text-text">🤖 AI Assistant</span>
            <button onClick={() => setOpen(false)} className="text-text-secondary hover:text-text" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantChat variant="widget" />
          </div>
        </div>
      )}

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE, touchAction: "none", transition: dragging ? "none" : "left 0.18s ease-out, top 0.18s ease-out" }}
        className={`fixed z-50 flex items-center justify-center rounded-full bg-primary text-2xl text-white shadow-xl select-none print:hidden ${dragging ? "scale-105 cursor-grabbing opacity-90" : "cursor-grab hover:scale-105"}`}
        aria-label="Ask AI"
        title="Ask AI (drag to move)"
      >
        🤖
      </button>
    </div>
  );
}
