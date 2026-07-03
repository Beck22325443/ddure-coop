"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Room = {
  id: number;
  title: string;
  type: string;
  owner_key: string | null;
  created_at: string;
};

type Message = {
  id: number;
  room_id: number;
  nickname: string;
  message: string;
  created_at: string;
};

type Participant = {
  id: number;
  room_id: number;
  nickname: string;
  seat: string | null;
  visitor_key: string | null;
  created_at: string;
};

const seats = ["B1", "B2", "B3", "B4", "B5"];

function getOwnerKey() {
  return localStorage.getItem("ddure_owner_key");
}

function getVisitorKey() {
  let key = localStorage.getItem("ddure_visitor_key");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("ddure_visitor_key", key);
  }
  return key;
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRemainingMs(createdAt: string) {
  return new Date(createdAt).getTime() + 30 * 60 * 1000 - Date.now();
}

function getRemainingText(createdAt: string) {
  const diff = getRemainingMs(createdAt);

  if (diff <= 0) return "만료됨";

  const min = Math.floor(diff / 1000 / 60);
  const sec = Math.floor((diff / 1000) % 60);

  return `${min}:${String(sec).padStart(2, "0")} 남음`;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = Number(params.id);

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [visitorKey, setVisitorKey] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [, setTick] = useState(0);

  const isOwner = Boolean(room?.owner_key && getOwnerKey() === room.owner_key);
  const myParticipant = participants.find((p) => p.visitor_key === visitorKey);
  const isFull = participants.length >= 5;

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.seat && !b.seat) return -1;
      if (!a.seat && b.seat) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [participants]);

  async function cleanupRoom() {
    await supabase.from("participants").delete().eq("room_id", roomId);
    await supabase.from("messages").delete().eq("room_id", roomId);
    await supabase.from("rooms").delete().eq("id", roomId);
  }

  async function loadRoom() {
    const { data, error } = await supabase
      .from("rooms")
      .select("id,title,type,owner_key,created_at")
      .eq("id", roomId)
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (!data) {
      setErrorMessage("해당 방이 없습니다.");
      return;
    }

    if (getRemainingMs(data.created_at) <= 0) {
      await cleanupRoom();
      router.push("/");
      return;
    }

    setRoom(data);
  }

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("id,room_id,nickname,message,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    setMessages(data || []);
  }

  async function loadParticipants() {
    const { data } = await supabase
      .from("participants")
      .select("id,room_id,nickname,seat,visitor_key,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    setParticipants(data || []);
  }

  async function autoJoinRoom(key: string) {
    const savedName = localStorage.getItem("ddure_nickname") || "익명";

    const { error } = await supabase.from("participants").upsert(
      {
        room_id: roomId,
        visitor_key: key,
        nickname: savedName,
        seat: null,
      },
      {
        onConflict: "room_id,visitor_key",
      }
    );

    if (error) {
      alert("자동 입장 실패: " + error.message);
      return;
    }

    setNickname(savedName);
    loadParticipants();
  }

  async function saveNickname() {
    if (!nickname.trim()) {
      alert("닉네임을 입력해줘.");
      return;
    }

    localStorage.setItem("ddure_nickname", nickname.trim());

    const { error } = await supabase
      .from("participants")
      .update({ nickname: nickname.trim() })
      .eq("room_id", roomId)
      .eq("visitor_key", visitorKey);

    if (error) {
      alert("닉네임 저장 실패: " + error.message);
      return;
    }

    loadParticipants();
  }

  async function selectSeat(seat: string) {
    if (!myParticipant) {
      alert("입장 처리 중이야. 잠깐만 기다려줘.");
      return;
    }

    const taken = participants.find((p) => p.seat === seat);

    if (taken && taken.visitor_key !== visitorKey) {
      alert("이미 다른 사람이 선택한 자리야.");
      return;
    }

    const { error } = await supabase
      .from("participants")
      .update({ seat })
      .eq("room_id", roomId)
      .eq("visitor_key", visitorKey);

    if (error) {
      alert("자리 선택 실패: " + error.message);
      return;
    }

    loadParticipants();
  }

  async function leaveSeat() {
    const { error } = await supabase
      .from("participants")
      .update({ seat: null })
      .eq("room_id", roomId)
      .eq("visitor_key", visitorKey);

    if (error) {
      alert("자리 해제 실패: " + error.message);
      return;
    }

    loadParticipants();
  }

  async function leaveRoom() {
    await supabase
      .from("participants")
      .delete()
      .eq("room_id", roomId)
      .eq("visitor_key", visitorKey);

    router.push("/");
  }

  async function sendMessage() {
    if (!myParticipant) {
      alert("입장 처리 중이야. 잠깐만 기다려줘.");
      return;
    }

    if (!message.trim()) return;

    const name = myParticipant.nickname || nickname.trim() || "익명";

    const { error } = await supabase.from("messages").insert({
      room_id: roomId,
      nickname: name,
      message: message.trim(),
    });

    if (error) {
      alert("채팅 전송 실패: " + error.message);
      return;
    }

    setMessage("");
    loadMessages();
  }

  async function deleteRoom() {
    if (!isOwner) {
      alert("방장만 삭제할 수 있어.");
      return;
    }

    if (!confirm("정말 이 방을 삭제할까요?")) return;

    await cleanupRoom();
    router.push("/");
  }

  useEffect(() => {
    if (!roomId) return;

    const key = getVisitorKey();
    setVisitorKey(key);

    loadRoom();
    loadMessages();
    loadParticipants();
    autoJoinRoom(key);

    const timer = setInterval(() => {
      setTick((v) => v + 1);
      loadRoom();
    }, 1000);

    const participantChannel = supabase
      .channel(`participants-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `room_id=eq.${roomId}`,
        },
        () => loadParticipants()
      )
      .subscribe();

    const messageChannel = supabase
      .channel(`messages-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => loadMessages()
      )
      .subscribe();

    const roomChannel = supabase
      .channel(`room-delete-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        () => router.push("/")
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [roomId]);

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-white text-zinc-900 p-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="mb-4 inline-block text-zinc-500">
            ← 로비로 돌아가기
          </Link>
          <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-red-700">
            {errorMessage}
          </div>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-white text-zinc-900 p-6">
        <div className="mx-auto max-w-3xl">방 불러오는 중...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-zinc-900 p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-4 inline-block text-zinc-500">
          ← 로비로 돌아가기
        </Link>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 mb-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-blue-600 text-sm font-bold">{room.type}</p>
                {isFull && (
                  <span className="rounded-full bg-red-100 text-red-600 px-2 py-1 text-xs font-bold">
                    FULL
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold">{room.title}</h1>
              <p className="text-zinc-500 text-sm mt-2">
                참가자 {participants.length} / 5 · {getRemainingText(room.created_at)}
              </p>
            </div>

            {isOwner && (
              <button
                onClick={deleteRoom}
                className="rounded-xl bg-red-600 text-white px-4 py-2 text-sm font-bold hover:bg-red-700"
              >
                방 삭제
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 mb-5 shadow-sm">
          <label className="block text-sm text-zinc-600 mb-2">닉네임</label>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl bg-zinc-50 border border-zinc-300 p-3 outline-none focus:border-blue-500"
              placeholder="닉네임 입력"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />

            <button
              onClick={saveNickname}
              className="rounded-xl bg-blue-600 text-white px-4 font-bold hover:bg-blue-700"
            >
              저장
            </button>
          </div>

          <button
            onClick={leaveRoom}
            className="mt-3 w-full rounded-xl bg-zinc-100 py-3 font-bold hover:bg-zinc-200"
          >
            방 나가기
          </button>
        </section>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 mb-5 shadow-sm">
          <h2 className="font-bold mb-3">참가자</h2>

          <div className="grid grid-cols-1 gap-2">
            {sortedParticipants.length === 0 ? (
              <p className="text-zinc-500 text-sm">참가자가 없습니다.</p>
            ) : (
              sortedParticipants.map((p) => {
                const ownerMark =
                  room.owner_key && p.visitor_key === getOwnerKey() ? " 👑" : "";

                return (
                  <div
                    key={p.id}
                    className="rounded-xl bg-zinc-50 border border-zinc-200 p-3"
                  >
                    <span className="font-bold">{p.nickname}</span>
                    <span>{ownerMark}</span>
                    <span className="ml-3 text-zinc-500 text-sm">
                      {p.seat || "자리 미선택"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 mb-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">자리 선택</h2>
            {myParticipant?.seat && (
              <button
                onClick={leaveSeat}
                className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-bold hover:bg-zinc-200"
              >
                자리 해제
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            {seats.map((seat) => {
              const person = participants.find((p) => p.seat === seat);
              const isMine = person?.visitor_key === visitorKey;

              return (
                <button
                  key={seat}
                  onClick={() => selectSeat(seat)}
                  className={`rounded-xl p-4 text-left border ${
                    isMine
                      ? "bg-blue-600 text-white border-blue-600"
                      : person
                      ? "bg-zinc-100 border-zinc-300 opacity-70"
                      : "bg-white border-zinc-300 hover:bg-blue-50"
                  }`}
                >
                  <span className="font-bold">{seat}</span>
                  <span className="ml-4">
                    {person ? person.nickname : "비어있음"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-zinc-200 p-5 shadow-sm">
          <h2 className="font-bold mb-3">채팅</h2>

          <div className="h-80 overflow-y-auto rounded-xl bg-zinc-50 border border-zinc-200 p-4 mb-4 space-y-2">
            {messages.length === 0 ? (
              <p className="text-zinc-500 text-sm">아직 채팅이 없습니다.</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="rounded-xl bg-white border border-zinc-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-blue-600 text-sm font-bold">
                      {msg.nickname}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                  <p>{msg.message}</p>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl bg-zinc-50 border border-zinc-300 p-3 outline-none focus:border-blue-500"
              placeholder="메시지 입력"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />

            <button
              onClick={sendMessage}
              className="rounded-xl bg-blue-600 text-white px-5 font-bold hover:bg-blue-700"
            >
              전송
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}