"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";

export default function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [name, setName] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      router.push(`/game/${code}?name=${encodeURIComponent(name.trim())}`);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-4xl font-black text-center bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent mb-2">
          Join Game
        </h1>
        <p className="text-center text-gray-500 mb-6">
          Room: <span className="font-mono font-bold text-gray-800">{code.toUpperCase()}</span>
        </p>

        <form onSubmit={handleJoin}>
          <label htmlFor="name-input" className="block text-sm font-medium text-gray-700 mb-2">
            Your Name
          </label>
          <input
            id="name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            placeholder="Enter your name"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg mb-4"
            maxLength={20}
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
          >
            Join Game
          </button>
        </form>
      </div>
    </main>
  );
}
