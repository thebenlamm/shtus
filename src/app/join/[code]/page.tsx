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
    <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center p-4">
      <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-4xl font-black text-center bg-gradient-to-r from-purple-800 to-pink-700 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-2">
          Join Game
        </h1>
        <p className="text-center text-card-muted mb-6">
          Room: <span className="font-mono font-bold text-card-text">{code.toUpperCase()}</span>
        </p>

        <form onSubmit={handleJoin}>
          <label htmlFor="name-input" className="block text-sm font-medium text-label-text mb-2">
            Your Name
          </label>
          <input
            id="name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            placeholder="Enter your name"
            className="w-full px-4 py-3 rounded-xl border-2 border-input-border focus:border-purple-500 focus:outline-none text-lg mb-4 bg-input-bg text-card-text"
            maxLength={20}
            autoFocus
            autoComplete="name"
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
