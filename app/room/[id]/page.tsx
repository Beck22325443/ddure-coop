"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = { id: number; title: string; notice: string | null; owner_user_id: string };
type Person = { id: number; user_id: string; nickname: string; synchro_level: number | null; entry_count: number };
type Queue = { id: number; user_id: string; nickname: string; synchro_level: number; status: string; created_at: string };
type QueueStatus = { waiting_count: number; my_position: number | null };

type Msg = { id: number; nickname: string; message: string; created_at: string };

export default function RoomPage() {
  const roomId = Number(useParams().id);
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [queue, setQueue] = useState<Queue[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [nickname, setNickname] = useState("");
  const [level, setLevel] = useState("");
  const [text, setText] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatError, setChatError] = useState("");
  const editRoomId = useRef<number | null>(null);
  const refreshId = useRef(0);
  const running = useRef(false);

  const isOwner = !!userId && room?.owner_user_id === userId;
  const isMember = people.some(p => p.user_id === userId);
  const myQueue = queue.find(q => q.user_id === userId && q.status === "waiting");
  const waiting = queue.filter(q => q.status === "waiting");

  // Counts and positions come from the server: RLS hides other users' queue rows.
  const refresh = useCallback(async () => {
    if (!Number.isInteger(roomId) || roomId <= 0) {
      setError("올바른 방 주소가 아닙니다."); setLoaded(true); return;
    }
    const requestId = ++refreshId.current;
    try {
      const [r, p, q, summary] = await Promise.all([
        supabase.from("rooms").select("id,title,notice,owner_user_id").eq("id", roomId).maybeSingle(),
        supabase.from("participants").select("id,user_id,nickname,synchro_level,entry_count").eq("room_id", roomId).order("created_at"),
        supabase.from("waiting_queue").select("id,user_id,nickname,synchro_level,status,created_at")
          .eq("room_id", roomId).eq("status", "waiting")
          .order("created_at", { ascending: true, nullsFirst: false }).order("id"),
        supabase.rpc("get_coop_queue_status_v2", { p_room_id: roomId }),
      ]);
      if (requestId !== refreshId.current) return;
      const currentRoom = r.data;
      const errors: string[] = [];
      if (r.error) errors.push(r.error.message);
      else if (!currentRoom) { setRoom(null); errors.push("방이 삭제되었거나 존재하지 않습니다."); }
      else {
        setRoom(currentRoom);
        if (editRoomId.current !== roomId) {
          setEditTitle(currentRoom.title);
          setEditNotice(currentRoom.notice || "");
          editRoomId.current = roomId;
        }
      }
      if (p.error) { setPeople([]); errors.push(p.error.message); }
      else setPeople(p.data || []);
      if (q.error) { setQueue([]); errors.push(q.error.message); }
      else setQueue(q.data || []);
      if (summary.error) {
        setQueueStatus(null);
        errors.push("대기 현황을 불러오지 못했습니다. " + summary.error.message);
      } else {
        const status = summary.data as QueueStatus | null;
        if (!status || typeof status.waiting_count !== "number" ||
            !(status.my_position === null || typeof status.my_position === "number")) {
          setQueueStatus(null); errors.push("대기 현황 응답이 올바르지 않습니다.");
        } else setQueueStatus(status);
      }
      setError(errors.join(" / "));
    } catch (err) {
      if (requestId === refreshId.current) {
        setQueueStatus(null);
        setError(err instanceof Error ? err.message : "연결을 확인해 주세요.");
      }
    } finally {
      if (requestId === refreshId.current) setLoaded(true);
    }
  }, [roomId]);

  const refreshMessages = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.from("messages")
        .select("id,nickname,message,created_at").eq("room_id", roomId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200);
      if (err) { setChatError(err.message); return; }
      setMessages((data || []).slice().reverse());
      setChatError("");
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "채팅을 불러오지 못했습니다.");
    }
  }, [roomId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoaded(false);
    setRoom(null); setPeople([]); setQueue([]); setQueueStatus(null); setMessages([]);
    setNickname(localStorage.getItem("ddure_nickname") || "");
    setLevel(localStorage.getItem("ddure_synchro_level") || "");
    async function poll() {
      if (!active) return;
      await refresh();
      if (active) timer = setTimeout(() => { void poll(); }, 3000);
    }
    void (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const login = session ? null : await supabase.auth.signInAnonymously();
        if (login?.error) throw login.error;
        if (!active) return;
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error("로그인 정보를 확인하지 못했습니다. 새로고침해 주세요.");
        if (!active) return;
        setUserId(user.id);
        await poll();
      } catch (err) {
        if (active) { setError(err instanceof Error ? err.message : "로그인에 실패했습니다."); setLoaded(true); }
      }
    })();
    return () => { active = false; clearTimeout(timer); ++refreshId.current; };
  }, [roomId, refresh]);

  useEffect(() => {
    if (!isMember || !chatOpen) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      await refreshMessages();
      if (active) timer = setTimeout(() => { void poll(); }, 3000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [isMember, chatOpen, refreshMessages]);

  async function run(fn: string, args: Record<string, unknown>, success?: () => void) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const { error: err } = await supabase.rpc(fn, args);
      if (err) throw err;
      await refresh();
      if (isMember && chatOpen) await refreshMessages();
      success?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : String((err as { message?: string })?.message || "요청에 실패했습니다."));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function validProfile() {
    const n = nickname.trim(), l = Number(level);
    if (!n || n.length > 40 || !Number.isInteger(l) || l < 1 || l > 10000) {
      alert("인게임닉네임(1~40자)과 싱크로 레벨(1~10000)을 입력해 주세요."); return false;
    }
    localStorage.setItem("ddure_nickname", n);
    localStorage.setItem("ddure_synchro_level", String(l));
    return true;
  }

  async function apply() {
    if (!validProfile()) return;
    await run("join_coop_queue", { p_room_id: roomId, p_nickname: nickname.trim(), p_level: Number(level) });
  }

  async function send() {
    if (!isOwner || !isMember || !text.trim()) return;
    await run("send_coop_message", { p_room_id: roomId, p_message: text.trim() }, () => setText(""));
  }

  if (!loaded) return <main className="min-h-screen bg-slate-50 p-8">불러오는 중...</main>;
  if (error && !room) return <main className="min-h-screen bg-slate-50 p-8"><Link href="/" className="text-blue-600">← 로비</Link><p className="mt-6 text-red-600">{error}</p></main>;
  if (!room) return <main className="p-8">방을 찾을 수 없습니다.</main>;

  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-3xl border bg-white p-6 shadow-sm">
        <Link href="/" className="text-blue-600">← 로비로 돌아가기</Link>
        <h1 className="mt-3 text-3xl font-black">{room.title}</h1>
        <p className="mt-2 text-slate-500">참여 {people.length}/5 · 대기 {queueStatus ? `${queueStatus.waiting_count}명` : "확인 중"}</p>
        {room.notice?.trim() && <section aria-labelledby="room-notice-title" className="mt-5 rounded-2xl border-2 border-blue-300 bg-blue-50 p-5 md:p-7">
          <h2 id="room-notice-title" className="mb-3 text-lg font-black text-blue-700">📢 방장 공지</h2>
          <p className="whitespace-pre-wrap break-words text-xl font-bold leading-relaxed text-slate-900 md:text-2xl">{room.notice}</p>
        </section>}
      </header>
      {error && <p className="rounded-xl bg-red-50 p-3 text-red-600">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[300px_1fr_350px]">
        <aside className="space-y-5">
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-black">내 정보</h2>
              <p className="text-sm font-bold text-red-600">정확하게 적어주세요 불일치시 이용불가</p>
            </div>
            <input className="mb-2 w-full rounded-xl border p-3" value={nickname} maxLength={40} onChange={e => setNickname(e.target.value)} placeholder="인게임닉네임" />
            <input className="mb-3 w-full rounded-xl border p-3" value={level} onChange={e => setLevel(e.target.value)} type="number" min={1} max={10000} placeholder="싱크로 레벨" />
            <button className="w-full rounded-xl bg-slate-100 p-3 font-bold" onClick={() => { if (validProfile()) alert("저장했습니다. 대기 신청 시 반영됩니다."); }}>정보 저장</button>
            <p className="mt-3 text-sm text-slate-500">{isOwner ? "방장" : isMember ? "입장 완료" : myQueue?.status === "waiting" ? "승인 대기 중" : "아직 입장하지 않았습니다."}</p>
          </section>
          <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-black">참여자 ({people.length}/5)</h2>
            {people.map(p => <div key={p.id} className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <div><p className="font-bold">{p.user_id === room.owner_user_id ? "[방장] " : ""}{p.nickname}{p.entry_count > 1 ? ` (${p.entry_count})` : ""}</p><p className="text-sm text-slate-500">싱크로 {p.synchro_level ?? "-"}</p></div>
              {isOwner && p.user_id !== userId && <button disabled={busy} className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700" onClick={() => { if (confirm(`${p.nickname}님을 강퇴할까요?`)) void run("kick_coop_user", { p_room_id: roomId, p_user_id: p.user_id }); }}>강퇴</button>}
            </div>)}
            {isMember && !isOwner && <button disabled={busy} className="mt-2 w-full rounded-xl bg-slate-200 p-3" onClick={() => { if (confirm("방에서 나가시겠습니까?")) void run("leave_coop_room", { p_room_id: roomId }); }}>방 나가기</button>}
          </section>
          {isOwner && <section className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-black">방장 관리</h2>
            <input className="mb-2 w-full rounded-xl border p-3" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="방 제목" />
            <textarea rows={5} className="mb-2 w-full resize-y rounded-xl border p-3 leading-relaxed" value={editNotice} onChange={e => setEditNotice(e.target.value)} placeholder="공지사항 (Enter로 줄바꿈)" />
            <button disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white" onClick={() => void run("update_coop_room", { p_room_id: roomId, p_title: editTitle, p_notice: editNotice })}>정보 수정</button>
            <button disabled={busy} className="mt-3 w-full rounded-xl bg-red-600 p-3 font-bold text-white" onClick={() => { if (confirm("방과 대기열, 채팅을 모두 삭제할까요?")) void run("delete_coop_room", { p_room_id: roomId }, () => router.push("/")); }}>방 삭제</button>
          </section>}
        </aside>
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-xl font-black">선착순 대기열</h2>
          <p className="mb-5 text-sm text-slate-500">이 방에서 대기 신청한 순서입니다. 방장이 신청자를 선택하여 승인합니다. 현황은 약 3초마다 갱신됩니다.</p>
          {!isMember && !isOwner && myQueue?.status !== "waiting" && <button disabled={busy || !userId} onClick={apply} className="mb-5 w-full rounded-xl bg-blue-600 p-4 font-bold text-white disabled:opacity-50">대기 신청하기</button>}
          {!isMember && !isOwner && myQueue?.status === "waiting" && <div className="mb-5 rounded-xl bg-blue-50 p-4">
            <p className="font-bold text-blue-700">현재 대기 순번: {queueStatus?.my_position ? `${queueStatus.my_position}번` : "확인 중"}</p>
            <button disabled={busy} className="mt-2 rounded-lg bg-slate-200 px-4 py-2" onClick={() => void run("cancel_coop_queue", { p_room_id: roomId })}>대기 취소</button>
          </div>}
          {queueStatus === null ? <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-500">대기 현황을 확인하고 있습니다.</p> : queueStatus.waiting_count === 0 ? <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-500">대기자가 없습니다.</p> : isOwner ? waiting.map((q, i) => <div key={q.id} className="mb-3 rounded-xl border p-4">
            <p className="font-bold">{i + 1}번 · {q.nickname}</p><p className="mb-3 text-sm text-slate-500">싱크로 {q.synchro_level}</p>
            <div className="flex gap-2"><button disabled={busy || people.length >= 5} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-40" onClick={() => void run("manage_coop_queue", { p_queue_id: q.id, p_action: "approve" })}>승인</button>
            <button disabled={busy} className="rounded-lg bg-red-100 px-4 py-2 text-red-700" onClick={() => void run("manage_coop_queue", { p_queue_id: q.id, p_action: "reject" })}>거절</button></div>
          </div>) : <p className="rounded-xl bg-slate-50 p-5 text-center text-slate-500">현재 {queueStatus.waiting_count}명이 대기 중입니다. 다른 신청자의 정보는 방장에게만 표시됩니다.</p>}
        </section>
        <aside className={`flex flex-col self-start rounded-3xl border bg-white p-5 shadow-sm ${chatOpen ? "h-[540px]" : ""}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">실시간 채팅</h2>
            <button type="button" aria-expanded={chatOpen} aria-controls="room-chat"
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold"
              onClick={() => setChatOpen(open => !open)}>{chatOpen ? "내용 숨기기" : "내용 보기"}</button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
          {chatError && <p className="mb-2 text-sm text-red-600">{chatError}</p>}
          {isMember ? <><div id="room-chat" hidden={!chatOpen} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">
            {messages.length === 0 && <p className="text-sm text-slate-500">아직 메시지가 없습니다.</p>}
            {messages.map(m => <div key={m.id} className="rounded-xl bg-white p-3"><div className="flex justify-between gap-2"><b className="text-sm text-blue-600">{m.nickname}</b><small className="text-slate-400">{new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small></div><p className="mt-1 break-words">{m.message}</p></div>)}
          </div>{isOwner ? <div className="mt-3 flex gap-2"><input type="password" autoComplete="off" spellCheck={false} aria-label="방장 채팅 입력" className="min-w-0 flex-1 rounded-xl border p-3" maxLength={500} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void send(); }} placeholder="메시지 입력" /><button disabled={busy || !text.trim()} className="rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-50" onClick={send}>전송</button></div> : <p className="mt-3 text-sm text-slate-500">방장만 메시지를 보낼 수 있습니다.</p>}</> : <div className="rounded-xl bg-slate-50 p-6 text-center text-slate-500">방장 승인 후 채팅할 수 있습니다.</div>}
          </div>
        </aside>
      </div>
    </div>
  </main>;
}
