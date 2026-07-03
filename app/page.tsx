"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: number;
  title: string;
  type: string;
  created_at: string;
  participant_count: number;
};

function getOwnerKey() {
  let key = localStorage.getItem("ddure_owner_key");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("ddure_owner_key", key);
  }
  return key;
}

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomType, setRoomType] = useState("10%방");
  const [loading, setLoading] = useState(false);

  async function deleteOldRooms() {
    const limit = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("rooms")
      .select("id")
      .lt("created_at", limit);

    const oldRoomIds = data?.map((room) => room.id) || [];

    if (oldRoomIds.length === 0) return;

    await supabase.from("participants").delete().in("room_id", oldRoomIds);
    await supabase.from("messages").delete().in("room_id", oldRoomIds);
    await supabase.from("rooms").delete().in("id", oldRoomIds);
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

  async function createRoom() {
    if (!roomTitle.trim()) {
      alert("방 제목을 입력해줘.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("rooms").insert({
      title: roomTitle.trim(),
      type: roomType,
      owner_key: getOwnerKey(),
    });

    setLoading(false);

    if (error) {
      alert("방 만들기 실패: " + error.message);
      return;
    }

    setRoomTitle("");
    loadRooms();
  }

  useEffect(() => {
    loadRooms();

    const roomsChannel = supabase
      .channel("rooms-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        () => loadRooms()
      )
      .subscribe();

    const participantsChannel = supabase
      .channel("participants-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants" },
        () => loadRooms()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomsChannel);
      supabase.removeChannel(participantsChannel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-white text-zinc-900 p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-4xl font-bold text-center mb-2 text-blue-600">
          DDURE COOP
        </h1>
        <p className="text-center text-zinc-500 mb-8">
          니케 협동작전 방 생성 & 채팅
        </p>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 mb-5 shadow-sm">
          <label className="block text-sm text-zinc-600 mb-2">방 제목</label>
          <input
            className="w-full rounded-xl bg-zinc-50 border border-zinc-300 p-3 outline-none focus:border-blue-500"
            placeholder="예: 10% 목표 같이 하실 분"
            value={roomTitle}
            onChange={(e) => setRoomTitle(e.target.value)}
          />

          <label className="block text-sm text-zinc-600 mt-5 mb-2">
            방 종류
          </label>

          <div className="grid grid-cols-3 gap-2">
            {["10%방", "숫자단", "즐겜"].map((type) => (
              <button
                key={type}
                onClick={() => setRoomType(type)}
                className={`rounded-xl p-3 font-bold ${
                  roomType === type
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 hover:bg-zinc-200"
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
        </section>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 shadow-sm">
          <h2 className="font-bold mb-3">생성된 방</h2>

          {rooms.length === 0 ? (
            <p className="text-zinc-500 text-sm">아직 생성된 방이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/room/${room.id}`}
                  className="block w-full rounded-xl bg-zinc-50 border border-zinc-200 p-4 hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-blue-600 text-sm font-bold">
                        {room.type}
                      </p>
                      <p className="font-bold">{room.title}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        생성 후 30분 뒤 자동 삭제
                      </p>
                    </div>

                    <div className="rounded-xl bg-white border border-zinc-300 px-3 py-2 text-sm font-bold">
                      {room.participant_count} / 5
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}