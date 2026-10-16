"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

import { CoopExpiryLabel, isCoopRoomExpired } from "./coop-expiry";

type Message = { id: number; nickname: string; message: string; created_at: string | null };
type OtherRoom = { coop_expires_at: string | null; id: number; room_number: number; title: string };
const PAGE_SIZE = 50;

function mergeMessages(previous: Message[], incoming: Message[]) {
  return Array.from(new Map([...previous, ...incoming].map(message => [message.id, message])).values())
    .sort((a, b) => a.id - b.id);
}

// Mount only while a chat is expanded and the viewer is allowed to read it.
// Older and newer pages use ID cursors so messages are never lost at page boundaries.
export function CoopChatHistory({ roomId, singleMessage = false, refreshToken = 0 }: {
  roomId: number; singleMessage?: boolean; refreshToken?: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const olderRequest = useRef(false);
  const initialized = useRef(false);
  const newestId = useRef<number | null>(null);
  const requestRefresh = useRef<(() => void) | null>(null);
  const scrollBox = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);
  const previousBottom = useRef<number | null>(null);
  const prependSize = useRef<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    let refreshAgain = false;
    initialized.current = false;
    newestId.current = null;
    olderRequest.current = false;
    followLatest.current = true;
    previousBottom.current = null;
    prependSize.current = null;
    setMessages([]); setHasOlder(false); setLoading(true); setOlderBusy(false); setError("");

    async function poll() {
      if (controller.signal.aborted) return;
      if (polling) { refreshAgain = true; return; }
      polling = true;
      clearTimeout(timer);
      try {
        const firstPage = !initialized.current || singleMessage;
        let query = supabase.from("messages").select("id,nickname,message,created_at").eq("room_id", roomId);
        if (!firstPage && newestId.current !== null) query = query.gt("id", newestId.current);
        const { data, error: queryError } = await query.order("id", { ascending: !firstPage })
          .limit(singleMessage ? 1 : firstPage ? PAGE_SIZE + 1 : PAGE_SIZE).abortSignal(controller.signal);
        if (current !== generation.current || controller.signal.aborted) return;
        if (queryError) throw queryError;
        const rows = (data || []) as Message[];
        if (firstPage) {
          const page = rows.slice(0, singleMessage ? 1 : PAGE_SIZE).reverse();
          setMessages(page);
          setHasOlder(!singleMessage && rows.length > PAGE_SIZE);
          newestId.current = page.at(-1)?.id ?? null;
        } else if (rows.length > 0) {
          setMessages(previous => mergeMessages(previous, rows));
          newestId.current = rows[rows.length - 1].id;
          if (rows.length === PAGE_SIZE) refreshAgain = true;
        }
        initialized.current = true;
        setError("");
      } catch (err) {
        if (current === generation.current && !controller.signal.aborted) {
          setError(String((err as { message?: string })?.message || "채팅을 불러오지 못했습니다."));
        }
      } finally {
        polling = false;
        if (current === generation.current && !controller.signal.aborted) {
          setLoading(false);
          const delay = refreshAgain ? 0 : 3000;
          refreshAgain = false;
          timer = setTimeout(() => { void poll(); }, delay);
        }
      }
    }
    requestRefresh.current = () => { void poll(); };
    void poll();
    return () => {
      controller.abort(); clearTimeout(timer); ++generation.current;
      requestRefresh.current = null;
    };
  }, [roomId, singleMessage]);

  useEffect(() => { requestRefresh.current?.(); }, [refreshToken]);

  useEffect(() => {
    const box = scrollBox.current;
    if (!box) return;
    if (prependSize.current) {
      box.scrollTop = prependSize.current.top + box.scrollHeight - prependSize.current.height;
      prependSize.current = null;
    } else if (followLatest.current && messages.at(-1)?.id !== previousBottom.current) {
      box.scrollTop = box.scrollHeight;
    }
    previousBottom.current = messages.at(-1)?.id ?? null;
  }, [messages]);

  async function loadOlder() {
    if (!hasOlder || olderRequest.current || messages.length === 0) return;
    const current = generation.current;
    const beforeId = messages[0].id;
    olderRequest.current = true; setOlderBusy(true);
    try {
      const { data, error: queryError } = await supabase.from("messages")
        .select("id,nickname,message,created_at").eq("room_id", roomId)
        .lt("id", beforeId).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
      if (current !== generation.current) return;
      if (queryError) throw queryError;
      const rows = (data || []) as Message[];
      const box = scrollBox.current;
      if (box) prependSize.current = { height: box.scrollHeight, top: box.scrollTop };
      setMessages(previous => mergeMessages(previous, rows.slice(0, PAGE_SIZE)));
      setHasOlder(rows.length > PAGE_SIZE);
      setError("");
    } catch (err) {
      if (current === generation.current) setError(String((err as { message?: string })?.message || "이전 채팅을 불러오지 못했습니다."));
    } finally {
      if (current === generation.current) { olderRequest.current = false; setOlderBusy(false); }
    }
  }

  return <div className="min-w-0">
    {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
    <div ref={scrollBox} tabIndex={0} aria-label="채팅 내역"
      className="h-72 space-y-3 overflow-y-auto overscroll-contain rounded-xl bg-slate-50 p-3"
      onScroll={event => { const box = event.currentTarget; followLatest.current = box.scrollHeight - box.scrollTop - box.clientHeight < 48; }}>
      {hasOlder && <button type="button" disabled={olderBusy} onClick={() => void loadOlder()}
        className="w-full rounded-lg border bg-white px-3 py-2 text-sm font-bold text-blue-700 disabled:opacity-50">{olderBusy ? "불러오는 중..." : "이전 채팅 더 보기"}</button>}
      {loading && <p className="text-sm text-slate-500">채팅을 불러오는 중...</p>}
      {!loading && messages.length === 0 && !error && <p className="text-sm text-slate-500">아직 메시지가 없습니다.</p>}
      {messages.map(message => <div key={message.id} className="rounded-xl bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="break-all text-sm text-blue-600">{message.nickname}</b>
          <small className="text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</small>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.message}</p>
      </div>)}
    </div>
  </div>;
}

export function OtherRoomChats({ now }: { now: number | null }) {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<OtherRoom[]>([]);
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeRooms = rooms.filter(room => !isCoopRoomExpired(room, now));

  useEffect(() => {
    if (!open) { setRooms([]); setExpandedRoomId(null); setError(""); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    async function poll() {
      try {
        const { data, error: queryError } = await supabase.from("rooms").select("id,room_number,title,coop_expires_at")
          .neq("room_number", 1).order("room_number").limit(4).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (queryError) throw queryError;
        const nextRooms = (data || []) as OtherRoom[];
        setRooms(nextRooms);
        setExpandedRoomId(previous => nextRooms.some(room => room.id === previous) ? previous : null);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted) setError(String((err as { message?: string })?.message || "다른 방을 불러오지 못했습니다."));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(() => { void poll(); }, 5000);
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open]);

  return <section className="min-w-0 rounded-3xl border bg-white p-5 shadow-sm">
    <button type="button" aria-expanded={open} aria-controls="other-room-chats" onClick={() => setOpen(value => !value)}
      className="flex w-full items-center justify-between gap-3 text-left">
      <span className="text-lg font-black">다른 작전방 채팅</span>
      <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold">{open ? "접기 ▴" : "펼치기 ▾"}</span>
    </button>
    {open && <div id="other-room-chats" className="mt-4 space-y-3">
      <p className="text-xs text-slate-500">확인할 방을 펼쳐 주세요.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">작전방을 불러오는 중...</p>}
      {!loading && !error && activeRooms.length === 0 && <p className="text-sm text-slate-500">다른 작전방이 없습니다.</p>}
      {activeRooms.map(room => <div key={room.id} className="min-w-0 rounded-xl border border-slate-200">
        <button type="button" aria-expanded={expandedRoomId === room.id} aria-controls={`other-room-${room.id}`}
          onClick={() => setExpandedRoomId(previous => previous === room.id ? null : room.id)}
          className="flex w-full items-center justify-between gap-3 p-3 text-left">
          <span className="min-w-0"><span className="text-xs font-bold text-blue-700">{room.room_number}번 방</span><span className="ml-2"><CoopExpiryLabel room={room} now={now} /></span><span className="mt-1 block break-words text-sm font-bold">{room.title}</span></span>
          <span aria-hidden="true" className="shrink-0 text-slate-500">{expandedRoomId === room.id ? "▴" : "▾"}</span>
        </button>
        {expandedRoomId === room.id && <div id={`other-room-${room.id}`} className="px-3 pb-3"><CoopChatHistory roomId={room.id} /></div>}
      </div>)}
    </div>}
  </section>;
}
