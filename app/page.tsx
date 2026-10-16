"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import { NikkeFields, readNikkes, emptyNikkes, hasAllChoices, type NikkeChoices } from "./components/coop-profile";

type Room = { id: number; room_number: number; title: string; notice: string | null };

export default function Home() {
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nikkes, setNikkes] = useState<NikkeChoices>(emptyNikkes);
  const [nickname, setNickname] = useState("");
  const [level, setLevel] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(0);
  const [error, setError] = useState("");

  async function loadRoom() {
    const { data, error: err } = await supabase.from("rooms")
      .select("id,room_number,title,notice").order("room_number", { ascending: true }).limit(5);
    if (err) setError(err.message);
    else { setRooms(data || []); setError(""); }
  }

  useEffect(() => {
    let active = true;
    setNikkes(readNikkes());
    setNickname(localStorage.getItem("ddure_nickname") || "");
    setLevel(localStorage.getItem("ddure_synchro_level") || "");
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const result = session ? null : await supabase.auth.signInAnonymously();
      if (!active) return;
      if (result?.error) { setError("익명 로그인 실패: " + result.error.message); return; }
      setReady(true);
      await loadRoom();
    })();
    const timer = setInterval(loadRoom, 5000);
    const channel = supabase.channel("ddure-lobby-presence")
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnline(Object.values(state).reduce((sum, entries) => sum + entries.length, 0));
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });
    return () => { active = false; clearInterval(timer); void supabase.removeChannel(channel); };
  }, []);

  function saveProfile() {
    const n = nickname.trim();
    const l = Number(level);
    if (!n || n.length > 40 || !Number.isInteger(l) || l < 1 || l > 10000) {
      alert("인게임닉네임(1~40자)과 싱크로 레벨(1~10000)을 입력해 주세요."); return false;
    }
    if (!hasAllChoices(nikkes)) { alert("니케 4종의 보유·미보유를 모두 선택해 주세요."); return false; }
    localStorage.setItem("ddure_nikkes_v3", JSON.stringify(nikkes));
    localStorage.setItem("ddure_nickname", n);
    localStorage.setItem("ddure_synchro_level", String(l));
    return true;
  }

  async function createRoom() {
    if (!ready || !saveProfile()) return;
    if (!title.trim()) { alert("방 제목을 입력해 주세요."); return; }
    setBusy(true);
    const { data, error: err } = await supabase.rpc("create_coop_room_v3", {
      p_title: title.trim(), p_nickname: nickname.trim(), p_level: Number(level), p_nikkes: nikkes,
    });
    setBusy(false);
    if (err) { alert(err.message); await loadRoom(); return; }
    window.location.href = `/room/${data}`;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="grid gap-5 md:grid-cols-2">
          <section className="rounded-3xl border bg-white p-7 shadow-sm">
            <p className="font-bold text-blue-600">NIKKE CO-OP LOBBY</p>
            <h1 className="mt-2 text-4xl font-black text-blue-600 md:text-5xl">DDURRE COOP</h1>
            <p className="mt-3 text-slate-500">최대 5개의 작전방 · 선착순 대기 · 방장 승인</p>
            <p className="mt-5 inline-block rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-700">🟢 현재 접속 {online}명</p>
          </section>
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-black">내 정보</h2>
              <p className="text-sm font-bold text-red-600">정확하게 적어주세요 불일치시 이용불가</p>
            </div>
            <label className="text-sm">인게임닉네임</label>
            <input className="mb-3 mt-1 w-full rounded-xl border p-3" maxLength={40} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="인게임닉네임" />
            <label className="text-sm">싱크로 레벨</label>
            <input className="mb-3 mt-1 w-full rounded-xl border p-3" type="number" min={1} max={10000} value={level} onChange={e => setLevel(e.target.value)} placeholder="예: 450" />
            <NikkeFields value={nikkes} onChange={setNikkes} />
            <button onClick={() => { if (saveProfile()) alert("저장했습니다."); }} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white">정보 저장</button>
          </section>
        </header>
        {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
        <div className="grid gap-6 md:grid-cols-[330px_1fr]">
          <div className="space-y-5">
            <div className="relative h-64 overflow-hidden rounded-3xl border bg-blue-50">
              <Image src="/toast.png" alt="DDURRE COOP" fill className="object-contain p-5" />
            </div>
            {rooms.length < 5 && ready && <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-black">작전방 생성</h2>
              <input className="mb-3 w-full rounded-xl border p-3" value={title} onChange={e => setTitle(e.target.value)} placeholder="방 제목" maxLength={100} />
              <button disabled={busy} onClick={createRoom} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50">{busy ? "생성 중..." : "+ 방 만들기"}</button>
            </section>}
          </div>
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">현재 작전방 ({rooms.length}/5)</h2><button onClick={loadRoom} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">새로고침</button></div>
            {!ready ? <p>연결 중...</p> : rooms.length > 0 ? <div className="space-y-3">{rooms.map(room => <Link key={room.id} href={`/room/${room.id}`} onClick={e => { if (!saveProfile()) e.preventDefault(); }} className="block rounded-2xl border border-blue-200 bg-blue-50 p-6 hover:bg-blue-100">
              <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-blue-700">{room.room_number}번 방</span>
              <h3 className="mt-2 text-2xl font-black">{room.title}</h3><p className="mt-3 text-slate-600">입장 대기 및 신청하기 →</p>
            </Link>)}</div> : <p className="rounded-xl bg-slate-50 p-6 text-center text-slate-500">현재 개설된 방이 없습니다.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
