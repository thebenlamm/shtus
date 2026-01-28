"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Room code validation regex - 6 alphanumeric characters
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

// Generate cryptographically secure room code using base36 characters
function generateRoomCode(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  // Convert to base36 and take first 6 characters, pad if needed
  const code = Array.from(array)
    .map((b) => b.toString(36))
    .join("")
    .toUpperCase()
    .slice(0, 6)
    .padEnd(6, "0");
  return code;
}

// Validate room code format
function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_REGEX.test(code.toUpperCase());
}

// Name storage key
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

export default function Home() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomCodeError, setRoomCodeError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  // Load saved name on mount
  useEffect(() => {
    const saved = getStoredName();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync with localStorage on mount
      setName(saved);
    }
  }, []);

  // Clear room code error when user types
  const handleRoomCodeChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setRoomCode(upper);
    if (roomCodeError && upper.length === 0) {
      setRoomCodeError(null);
    }
  };

  const createRoom = () => {
    const trimmedName = name.trim();
    if (!trimmedName || isNavigating) return;
    setIsNavigating(true);
    setStoredName(trimmedName);
    const code = generateRoomCode();
    router.push(`/game/${code}?name=${encodeURIComponent(trimmedName)}`);
  };

  const joinRoom = () => {
    const trimmedName = name.trim();
    const trimmedCode = roomCode.trim().toUpperCase();

    if (!trimmedName || !trimmedCode || isNavigating) return;

    // Validate room code format
    if (!isValidRoomCode(trimmedCode)) {
      setRoomCodeError("Room code must be 6 letters/numbers");
      return;
    }

    setRoomCodeError(null);
    setIsNavigating(true);
    setStoredName(trimmedName);
    router.push(`/game/${trimmedCode}?name=${encodeURIComponent(trimmedName)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") {
      action();
    }
  };

  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center p-4">
      <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-5xl font-black text-center mb-2 bg-gradient-to-r from-purple-800 to-pink-700 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
          SHTUS!
        </h1>
        <p className="text-center text-card-muted mb-8">The party game of outrageous answers</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="player-name" className="sr-only">Your Name</label>
            <input
              id="player-name"
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, createRoom)}
              className="w-full px-4 py-3 rounded-xl border-2 border-input-border focus:border-purple-500 focus:outline-none text-lg bg-input-bg text-card-text"
              maxLength={20}
              autoComplete="name"
              disabled={isNavigating}
            />
          </div>

          <button
            onClick={createRoom}
            disabled={!name.trim() || isNavigating}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform active:scale-95 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isNavigating ? (
              <>
                <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                Creating...
              </>
            ) : (
              "CREATE GAME"
            )}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-card-border"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-input-bg px-4 text-card-muted">or join existing</span>
            </div>
          </div>

          <div>
            <label htmlFor="room-code" className="sr-only">Room Code</label>
            <input
              id="room-code"
              type="text"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => handleRoomCodeChange(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, joinRoom)}
              className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none text-lg text-center tracking-widest font-mono bg-input-bg text-card-text ${
                roomCodeError
                  ? "border-red-500 focus:border-red-500"
                  : "border-input-border focus:border-purple-500"
              }`}
              maxLength={6}
              disabled={isNavigating}
              aria-invalid={!!roomCodeError}
              aria-describedby={roomCodeError ? "room-code-error" : undefined}
            />
            {roomCodeError && (
              <p id="room-code-error" className="text-red-500 text-sm mt-1" role="alert">
                {roomCodeError}
              </p>
            )}
          </div>

          <button
            onClick={joinRoom}
            disabled={!name.trim() || !roomCode.trim() || isNavigating}
            className="w-full py-4 bg-btn-secondary text-white text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-btn-secondary-hover transition-colors active:scale-95 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isNavigating ? (
              <>
                <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                Joining...
              </>
            ) : (
              "JOIN GAME"
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
