"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Name storage key - shared with home page
const NAME_STORAGE_KEY = "shtus-player-name";

function getStoredName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Ignore storage errors
  }
}

interface JoinFormProps {
  code: string;
}

export default function JoinForm({ code }: JoinFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Load saved name on mount
  useEffect(() => {
    const saved = getStoredName();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync with localStorage on mount
      setName(saved);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError("Please enter your name");
      return;
    }

    if (trimmedName.length < 1) {
      setNameError("Name must be at least 1 character");
      return;
    }

    setNameError(null);
    setIsNavigating(true);
    setStoredName(trimmedName);
    router.push(`/game/${code}?name=${encodeURIComponent(trimmedName)}`);
  };

  const handleNameChange = (value: string) => {
    setName(value.slice(0, 20));
    if (nameError) {
      setNameError(null);
    }
  };

  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center p-4">
      <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-4xl font-black text-center bg-gradient-to-r from-purple-800 to-pink-700 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-2">
          Join Game
        </h1>
        <p className="text-center text-card-muted mb-6">
          Room: <span className="font-mono font-bold text-card-text">{code}</span>
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="name-input" className="block text-sm font-medium text-label-text mb-2">
            Your Name
          </label>
          <input
            id="name-input"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Enter your name"
            className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none text-lg mb-1 bg-input-bg text-card-text ${
              nameError
                ? "border-red-500 focus:border-red-500"
                : "border-input-border focus:border-purple-500"
            }`}
            maxLength={20}
            autoFocus
            autoComplete="name"
            disabled={isNavigating}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? "name-error" : undefined}
          />
          {nameError && (
            <p id="name-error" className="text-red-500 text-sm mb-3" role="alert">
              {nameError}
            </p>
          )}
          {!nameError && <div className="mb-3" />}
          <button
            type="submit"
            disabled={!name.trim() || isNavigating}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isNavigating ? (
              <>
                <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                Joining...
              </>
            ) : (
              "Join Game"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
