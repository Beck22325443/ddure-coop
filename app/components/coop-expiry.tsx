"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type CoopRoomExpiry = { room_number: number; coop_expires_at: string | null };

// Use database time and a monotonic clock, so the user's clock cannot extend a room.
export function useCoopClock(enabled: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) { setNow(null); return; }
    let active = true;
    let syncing = false;
    let anchor: { server: number; local: number } | null = null;
    const controller = new AbortController();
    async function sync() {
      if (!active || syncing) return;
      syncing = true;
      const started = performance.now();
      try {
        const { data, error } = await supabase.rpc("get_coop_server_time_v6").abortSignal(controller.signal);
        const ended = performance.now();
        const server = typeof data === "string" ? Date.parse(data) : NaN;
        if (active && !error && Number.isFinite(server)) {
          anchor = { server: server + (ended - started) / 2, local: ended };
          setNow(anchor.server);
        }
      } catch { /* RLS and the server expiry guard still enforce the deadline. */ }
      finally { syncing = false; }
    }
    const tick = setInterval(() => {
      if (anchor) setNow(anchor.server + performance.now() - anchor.local);
    }, 1000);
    const resync = setInterval(() => { void sync(); }, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void sync();
    return () => {
      active = false; controller.abort(); clearInterval(tick); clearInterval(resync);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled]);
  return now;
}

export function coopSecondsLeft(room: CoopRoomExpiry, now: number | null): number | null {
  if (room.room_number === 1 || !room.coop_expires_at || now === null) return null;
  const deadline = Date.parse(room.coop_expires_at);
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function isCoopRoomExpired(room: CoopRoomExpiry, now: number | null): boolean {
  return coopSecondsLeft(room, now) === 0;
}

export function CoopExpiryLabel({ room, now }: { room: CoopRoomExpiry; now: number | null }) {
  const seconds = coopSecondsLeft(room, now);
  if (room.room_number === 1) return <span className="text-xs font-bold text-slate-500">상시 운영</span>;
  const remaining = seconds === null ? "생성 후 4분 자동 삭제" : seconds === 0 ? "시간 만료" :
    `자동 삭제까지 ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <span className={`text-xs font-bold ${seconds !== null && seconds <= 30 ? "text-red-600" : "text-amber-700"}`}>{remaining}</span>;
}
