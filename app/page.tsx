"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: number;
  title: string;
  type: string;
  created_at: string;
  participant_count: number;
};

const roomTypes = ["전체", "10%방", "숫자단", "즐겜"];

function getOwnerKey() {
  let key = localStorage.getItem("ddure_owner_key");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("ddure_owner_key", key);
  }
  return key;
}

function getVisitorKey() {
  let key = localStorage.getItem("ddure_visitor_key");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("ddure_visitor_key", key);
  }
  return key;
}

function getRemainingText(createdAt: string) {
  const diff = new Date(createdAt).getTime() + 30 * 60 * 1000 - Date.now();
  if (diff <= 0) return "만료됨";
  const min = Math.floor(diff / 1000 / 60);
  const sec = Math.floor((diff / 1000) % 60);
  return `${min}:${String(sec).padStart(2, "0")} 남음`;
}

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomType, setRoomType] = useState("10%방");
  const [filterType, setFilterType] = useState("전체");
  const [search, setSearch] = useState("");
  const [nickname, setNickname] = useState("");
  const [nicknameReady, setNicknameReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);

  async function deleteOldRooms() {
    const limit = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data } = await supabase.from("rooms").select("id").lt("created_at", limit);
    const ids = data?.map((r) => r.id) || [];
    if (ids.length === 0) return;

    await supabase.from("participants").delete().in("room_id", ids);
    await supabase.from("messages").delete().in("room_id", ids);
    await supabase.from("rooms").delete().in("id", ids);
  }

  async function loadRooms() {
    await deleteOldRooms();

    const { data, error } = await supabase
      .from("rooms_with_count")
      .select("id,title,type,created_at,participant_count")
      .order("created_at", { ascending: false });

    if (error) {
      alert("방 목록 불러오기 실패: " + error.message);
      return;
    }

    setRooms((data || []) as Room[]);
  }

  function saveNickname() {
    if (!nickname.trim()) {
      alert("닉네임을 입력해줘.");
      return;
    }

    localStorage.setItem("ddure_nickname", nickname.trim());
    setNicknameReady(true);
  }

  async function createRoom() {
    if (!nicknameReady) {
      alert("닉네임을 먼저 저장해줘.");
      return;
    }

    if (!roomTitle.trim()) {
      alert("방 제목을 입력해줘.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("rooms").insert({
      title: roomTitle.trim(),
      type: roomType,
      owner_key: getOwnerKey(),
      owner_visitor_key: getVisitorKey(),
    });

    setLoading(false);

    if (error) {
      alert("방 만들기 실패: " + error.message);
      return;
    }

    setRoomTitle("");
    loadRooms();
  }

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const typeOk = filterType === "전체" || room.type === filterType;
      const searchOk = room.title.toLowerCase().includes(search.toLowerCase());
      return typeOk && searchOk;
    });
  }, [rooms, filterType, search]);

  useEffect(() => {
    const saved = localStorage.getItem("ddure_nickname") || "";
    setNickname(saved);
    setNicknameReady(Boolean(saved));

    loadRooms();

    const timer = setInterval(() => {
      setTick((v) => v + 1);
      loadRooms();
    }, 10000);

    const roomsChannel = supabase
      .channel("rooms-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, loadRooms)
      .subscribe();

    const participantsChannel = supabase
      .channel("participants-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, loadRooms)
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(roomsChannel);
      supabase.removeChannel(participantsChannel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 rounded-3xl bg-white border border-slate-200 p-8 shadow-sm">
          <p className="text-blue-600 font-bold mb-2">NIKKE CO-OP LOBBY</p>
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-5xl font-black text-blue-600">DDURE COOP</h1>
              <p className="text-slate-500 mt-3">
                협동작전 방 생성, 자리 선택, 실시간 채팅을 한 곳에서.
              </p>
            </div>

            <div className="min-w-72 rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <label className="block text-sm text-slate-600 mb-2">내 닉네임</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-xl bg-white border border-slate-300 p-3 outline-none focus:border-blue-500"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임"
                />
                <button
                  onClick={saveNickname}
                  className="rounded-xl bg-blue-600 text-white px-4 font-bold hover:bg-blue-700"
                >
                  저장
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {nicknameReady ? `현재 닉네임: ${nickname}` : "닉네임을 먼저 저장해줘."}
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-[360px_1fr] gap-6">
          <section className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm h-fit">
            <h2 className="text-xl font-black mb-5">작전 생성</h2>

            <label className="block text-sm text-slate-600 mb-2">방 제목</label>
            <input
              className="w-full rounded-xl bg-slate-50 border border-slate-300 p-3 outline-none focus:border-blue-500"
              placeholder="예: 10% 목표 같이 하실 분"
              value={roomTitle}
              onChange={(e) => setRoomTitle(e.target.value)}
            />

            <label className="block text-sm text-slate-600 mt-5 mb-2">방 종류</label>
            <div className="grid grid-cols-3 gap-2">
              {["10%방", "숫자단", "즐겜"].map((type) => (
                <button
                  key={type}
                  onClick={() => setRoomType(type)}
                  className={`rounded-xl p-3 font-bold ${
                    roomType === type
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 hover:bg-slate-200"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <button
              onClick={createRoom}
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-blue-600 text-white py-4 font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "생성 중..." : "방 만들기"}
            </button>

            <p className="text-xs text-slate-500 mt-3">방은 생성 후 30분 뒤 자동 삭제됩니다.</p>
          </section>

          <section className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black">작전 목록</h2>
              <button
                onClick={loadRooms}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold hover:bg-slate-200"
              >
                새로고침
              </button>
            </div>

            <input
              className="w-full rounded-xl bg-slate-50 border border-slate-300 p-3 mb-3 outline-none focus:border-blue-500"
              placeholder="방 제목 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="grid grid-cols-4 gap-2 mb-5">
              {roomTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`rounded-xl p-3 text-sm font-bold ${
                    filterType === type
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 hover:bg-slate-200"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {filteredRooms.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center text-slate-500">
                표시할 방이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRooms.map((room) => {
                  const isFull = room.participant_count >= 5;

                  return (
                    <Link
                      key={room.id}
                      href={`/room/${room.id}`}
                      className="block rounded-2xl bg-slate-50 border border-slate-200 p-5 hover:bg-blue-50 hover:border-blue-200"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-blue-600 text-sm font-black">{room.type}</p>
                            {isFull && (
                              <span className="rounded-full bg-red-100 text-red-600 px-2 py-1 text-xs font-black">
                                FULL
                              </span>
                            )}
                          </div>
                          <p className="text-lg font-black">{room.title}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {getRemainingText(room.created_at)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-white border border-slate-300 px-4 py-3 text-sm font-black">
                          {room.participant_count} / 5
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}