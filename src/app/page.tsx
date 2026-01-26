"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const router = useRouter();

  const createRoom = () => {
    if (!name.trim()) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    router.push(`/game/${code}?name=${encodeURIComponent(name)}`);
  };

  const joinRoom = () => {
    if (!name.trim() || !roomCode.trim()) return;
    router.push(`/game/${roomCode.toUpperCase()}?name=${encodeURIComponent(name)}`);
  };

  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-5xl font-black text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
          PSYCH!
        </h1>
        <p className="text-center text-gray-500 mb-8">The party game of outrageous answers</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="player-name" className="sr-only">Your Name</label>
            <input
              id="player-name"
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg"
              maxLength={20}
              autoComplete="name"
            />
          </div>

          <button
            onClick={createRoom}
            disabled={!name.trim()}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform active:scale-95"
          >
            CREATE GAME
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-gray-500">or join existing</span>
            </div>
          </div>

          <div>
            <label htmlFor="room-code" className="sr-only">Room Code</label>
            <input
              id="room-code"
              type="text"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg text-center tracking-widest font-mono"
              maxLength={6}
            />
          </div>

          <button
            onClick={joinRoom}
            disabled={!name.trim() || !roomCode.trim()}
            className="w-full py-4 bg-gray-800 text-white text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors active:scale-95"
          >
            JOIN GAME
          </button>
        </div>
      </div>
    </main>
  );
}
