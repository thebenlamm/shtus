"use client";

import { useEffect, useState, useRef, use } from "react";
import PartySocket from "partysocket";
import { useTheme } from "@/hooks/useTheme";
import AdminPanel from "@/components/AdminPanel";

interface Player {
  id: string;
  name: string;
  score: number;
  winStreak: number;
  disconnectedAt?: number;
  isVoyeur?: boolean;
  // Note: isAdmin is NOT included here - it's not broadcast for security
  // Admin status is tracked separately via admin-state messages
}

interface AdminState {
  exactQuestion: string | null;
  promptGuidance: string | null;
}

interface Answer {
  answerId: number;
  playerId?: string; // Only present in REVEAL phase
  answer: string;
  votes: number;
  isOwn?: boolean; // Only present in VOTING phase
}

interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  type: "chat" | "system";
}

interface GameState {
  phase: string;
  round: number;
  roundLimit: number | null;
  players: Player[];
  hostId: string | null;
  currentPrompt: string;
  promptSource: "ai" | "fallback" | "admin" | null;
  theme: string;
  isGenerating: boolean;
  answers: Answer[];
  votes: Record<string, string>;
  submittedPlayerIds: string[];
  votedPlayerIds: string[];
}

export default function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ name?: string; admin?: string }>;
}) {
  const { roomId } = use(params);
  const { name, admin: adminParam } = use(searchParams);
  const [state, setState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [theme, setTheme] = useState("");
  const [roundLimit, setRoundLimit] = useState<number | null>(null); // Default to endless
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);
  const { theme: colorTheme, toggleTheme } = useTheme();

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminState, setAdminState] = useState<AdminState>({
    exactQuestion: null,
    promptGuidance: null,
  });
  const [showMobileAdmin, setShowMobileAdmin] = useState(false);

  useEffect(() => {
    // Generate or retrieve stable userId for session persistence across refreshes
    const storageKey = `psych-user-${roomId}`;
    let userId = localStorage.getItem(storageKey);
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(storageKey, userId);
    }

    // Handle admin key: store from URL param or retrieve from localStorage
    const adminStorageKey = `psych-admin-${roomId}`;
    let adminKey: string | null = null;
    if (adminParam) {
      // New admin key from URL - store it
      localStorage.setItem(adminStorageKey, adminParam);
      adminKey = adminParam;
    } else {
      // Check if we have a stored admin key (for reconnection)
      adminKey = localStorage.getItem(adminStorageKey);
    }

    const socket = new PartySocket({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
      room: roomId,
      id: userId,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      setMyId(socket.id);
      // Reset admin status on new connection - will be set if we receive admin-state
      setIsAdmin(false);
      setAdminState({ exactQuestion: null, promptGuidance: null });
      // Include admin key in join message if we have one
      const joinMessage: { type: string; name: string; adminKey?: string } = {
        type: "join",
        name: name || "Player",
      };
      if (adminKey) {
        joinMessage.adminKey = adminKey;
      }
      socket.send(JSON.stringify(joinMessage));
    };

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "state") {
        setState(data);
        // Note: isAdmin is NOT broadcast in player state for security
        // Admin status is determined by receiving admin-state messages
      } else if (data.type === "admin-state") {
        // Receiving admin-state means we are an admin (server only sends to validated admins)
        setIsAdmin(true);
        setAdminState({
          exactQuestion: data.exactQuestion,
          promptGuidance: data.promptGuidance,
        });
      } else if (data.type === "chat_history") {
        // Deduplicate by ID in case of reconnection
        setChatMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMessages = data.messages.filter((m: ChatMessage) => !existingIds.has(m.id));
          return [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
        });
      } else if (data.type === "chat_message") {
        setChatMessages(prev => {
          // Deduplicate
          if (prev.some(m => m.id === data.message.id)) {
            return prev;
          }
          // Sort to handle rare out-of-order WebSocket delivery
          return [...prev, data.message].sort((a, b) => a.timestamp - b.timestamp);
        });
      }
    };

    return () => socket.close();
  }, [roomId, name, adminParam]);

  useEffect(() => {
    if (state?.phase === "writing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasSubmitted(false);
      setAnswer("");
    }
    if (state?.phase === "voting") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasVoted(false);
    }
  }, [state?.phase, state?.round]);

  const send = (data: object) => {
    socketRef.current?.send(JSON.stringify(data));
  };

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const sendChat = () => {
    if (chatInput.trim()) {
      send({ type: "chat", text: chatInput.trim() });
      setChatInput("");
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const startGame = () => send({ type: "start", theme: theme || "random funny questions", roundLimit });
  const endWriting = () => send({ type: "end-writing" });
  const endVoting = () => send({ type: "end-voting" });
  const nextRound = () => send({ type: "next-round" });
  const toggleVoyeur = () => send({ type: "toggle-voyeur" });
  const submitAnswer = () => {
    if (answer.trim()) {
      send({ type: "answer", answer: answer.trim() });
      setHasSubmitted(true);
    }
  };
  const vote = (answerId: number) => {
    send({ type: "vote", votedFor: answerId });
    setHasVoted(true);
  };
  const restart = () => send({ type: "restart" });
  const setAdminOverride = (data: { exactQuestion?: string | null; promptGuidance?: string | null }) => {
    send({ type: "admin-set-override", ...data });
  };

  if (!state) {
    return (
      <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center" aria-busy="true">
        <div role="status" aria-live="polite" className="text-white text-2xl">Connecting...</div>
      </main>
    );
  }

  const isHost = myId === state.hostId;
  const myPlayer = state.players.find(p => p.id === myId);
  const isVoyeur = myPlayer?.isVoyeur ?? false;
  const activePlayers = state.players.filter(p => !p.isVoyeur && !p.disconnectedAt);
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);

  // Render streak badge (shows when winStreak >= 2)
  const streakBadge = (player: Player) =>
    player.winStreak >= 2 ? (
      <span className="text-orange-500" title={`${player.winStreak}-win streak!`}>
        🔥{player.winStreak}
      </span>
    ) : null;

  const copyLink = () => {
    const url = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render compact scoreboard for header
  const renderCompactScoreboard = () => {
    if (!["writing", "voting", "reveal"].includes(state.phase)) return null;
    return (
      <div className="flex flex-wrap gap-2 text-sm">
        {sortedPlayers.slice(0, 6).map((p, i) => (
          <span
            key={p.id}
            className={`px-2 py-1 rounded-full ${
              p.isVoyeur ? "opacity-50" : ""
            } ${i === 0 ? "bg-winner-bg text-card-text" : "bg-accent-bg text-white"}`}
          >
            {p.id === state.hostId && "👑 "}
            {p.name}: {p.score}
            {p.winStreak >= 2 && <span className="text-orange-400"> 🔥{p.winStreak}</span>}
          </span>
        ))}
        {sortedPlayers.length > 6 && (
          <span className="px-2 py-1 text-white/70">+{sortedPlayers.length - 6} more</span>
        )}
      </div>
    );
  };

  // Render chat panel
  const renderChatPanel = () => (
    <div className="flex flex-col h-full bg-card-bg backdrop-blur rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-card-border">
        <h3 className="font-bold text-card-text">Chat</h3>
      </div>
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
        style={{ minHeight: 0 }}
      >
        {chatMessages.length === 0 ? (
          <p className="text-card-muted text-sm text-center">No messages yet</p>
        ) : (
          chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`text-sm ${msg.type === "system" ? "text-card-muted italic text-center" : ""}`}
            >
              {msg.type === "chat" ? (
                <>
                  <span className="font-bold text-purple-600">{msg.playerName}:</span>{" "}
                  <span className="text-card-text">{msg.text}</span>
                </>
              ) : (
                <span>{msg.text}</span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="p-3 border-t border-card-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value.slice(0, 150))}
            onKeyDown={handleChatKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg border border-input-border bg-input-bg text-card-text text-sm focus:border-purple-500 focus:outline-none"
            maxLength={150}
          />
          <button
            onClick={sendChat}
            disabled={!chatInput.trim()}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors"
            aria-label="Send message"
          >
            →
          </button>
        </div>
        <div className="text-xs text-card-muted mt-1 text-right">{chatInput.length}/150</div>
      </div>
    </div>
  );

  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to p-4">
      <h1 className="sr-only">Psych! Game Room {roomId}</h1>
      {/* Screen reader announcements for game state changes */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {state.phase === "writing" && `Round ${state.round}. ${state.currentPrompt}. Write your answer now.`}
        {state.phase === "voting" && "Vote for your favorite answer."}
        {state.phase === "reveal" && "Results are in."}
        {state.phase === "final" && `Game over. ${sortedPlayers[0]?.name} wins!`}
      </div>

      <div className="max-w-6xl mx-auto relative lg:pr-96">
        {/* Game area - centered (pr-96 on lg accounts for fixed chat sidebar) */}
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-accent-bg backdrop-blur px-4 py-2 rounded-full text-white font-bold">
              Room: {roomId}
            </div>
            <button
              onClick={copyLink}
              className="bg-accent-bg backdrop-blur px-3 py-2 rounded-full text-white font-bold hover:bg-black/70 transition-colors"
              aria-label="Copy invite link"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={toggleVoyeur}
              className={`backdrop-blur px-3 py-2 rounded-full font-bold transition-colors ${
                isVoyeur
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-accent-bg text-white hover:bg-black/70"
              }`}
              aria-label={isVoyeur ? "Rejoin as player" : "Switch to watching mode"}
              aria-pressed={isVoyeur}
            >
              {isVoyeur ? "👁️ Watching" : "👁️"}
            </button>
            <button
              onClick={toggleTheme}
              className="bg-accent-bg backdrop-blur px-3 py-2 rounded-full font-bold text-white hover:bg-black/70 transition-colors"
              aria-label={colorTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {colorTheme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
          {state.round > 0 && (
            <div className="bg-accent-bg backdrop-blur px-4 py-2 rounded-full text-white font-bold">
              Round {state.round}{state.roundLimit ? `/${state.roundLimit}` : ''}
            </div>
          )}
        </div>

        {/* LOBBY */}
        {state.phase === "lobby" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-center mb-4">
              {state.isGenerating ? "Generating prompts..." : "Waiting for players..."}
            </h2>

            {state.isGenerating ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4 animate-pulse" role="img" aria-label="Generating">🎲</div>
                <p className="text-card-muted">AI is cooking up questions about:</p>
                <p className="text-purple-600 font-bold text-lg mt-2">{state.theme}</p>
              </div>
            ) : (
              <>
                <ul className="space-y-2 mb-6" aria-label="Players in room">
                  {state.players.map((p) => (
                    <li
                      key={p.id}
                      className={`p-3 rounded-xl ${
                        p.disconnectedAt
                          ? "opacity-40 bg-progress-bg italic"
                          : p.isVoyeur
                          ? "opacity-50 bg-progress-bg"
                          : p.id === myId
                          ? "bg-highlight-bg border-2 border-purple-500"
                          : "bg-progress-bg"
                      }`}
                    >
                      {p.id === state.hostId && <span role="img" aria-label="Host">👑 </span>}
                      {p.name} {streakBadge(p)}
                      {p.disconnectedAt && <span className="ml-2 text-muted-extra" role="img" aria-label="Reconnecting"> ⏳</span>}
                      {p.isVoyeur && !p.disconnectedAt && <span className="ml-2 text-card-muted" role="img" aria-label="Watching"> 👁️</span>}
                    </li>
                  ))}
                </ul>

                {isHost && (
                  <>
                    <div className="mb-4">
                      <label htmlFor="theme-input" className="block text-sm font-medium text-label-text mb-2">
                        Game Theme (AI will generate questions)
                      </label>
                      <input
                        id="theme-input"
                        type="text"
                        placeholder="e.g., The naked truth, Office nightmares, Dating disasters"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-input-border focus:border-purple-500 focus:outline-none bg-input-bg text-card-text"
                        maxLength={100}
                      />
                    </div>
                    <div className="mb-4">
                      <span className="block text-sm font-medium text-label-text mb-2">Rounds</span>
                      <div className="flex gap-2" role="group" aria-label="Select number of rounds">
                        {[3, 5, 10].map((num) => (
                          <button
                            key={num}
                            onClick={() => setRoundLimit(num)}
                            className={`px-4 py-2 rounded-full font-bold transition-colors ${
                              roundLimit === num
                                ? "bg-purple-600 text-white"
                                : "bg-card-border text-label-text hover:bg-btn-inactive-hover"
                            }`}
                            aria-pressed={roundLimit === num}
                          >
                            {num}
                          </button>
                        ))}
                        <button
                          onClick={() => setRoundLimit(null)}
                          className={`px-4 py-2 rounded-full font-bold transition-colors ${
                            roundLimit === null
                              ? "bg-purple-600 text-white"
                              : "bg-card-border text-label-text hover:bg-btn-inactive-hover"
                          }`}
                          aria-pressed={roundLimit === null}
                        >
                          Endless
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <p className="text-center text-card-muted mb-4">
                  {activePlayers.length < 2
                    ? `Need at least 2 active players (${activePlayers.length} active${state.players.length > activePlayers.length ? `, ${state.players.length - activePlayers.length} watching` : ""})`
                    : `${activePlayers.length} players ready!${state.players.length > activePlayers.length ? ` (${state.players.length - activePlayers.length} watching)` : ""}`}
                </p>

                {isHost && activePlayers.length >= 2 && (
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform"
                  >
                    START GAME
                  </button>
                )}
                {!isHost && <p className="text-center text-card-muted">Waiting for host to start...</p>}
              </>
            )}
          </div>
        )}

        {/* PROMPT */}
        {state.phase === "prompt" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-8 text-center">
            <p className="text-card-muted mb-4">Round {state.round}</p>
            <h2 className="text-3xl font-black text-card-text">{state.currentPrompt}</h2>
            {state.promptSource && (
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-progress-bg text-muted-extra">
                {state.promptSource === "ai" ? "🤖 grok" : state.promptSource === "admin" ? "👑 host" : "📦 classic"}
              </span>
            )}
          </div>
        )}

        {/* WRITING */}
        {state.phase === "writing" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-center mb-1">{state.currentPrompt}</h2>
            {state.promptSource && (
              <p className="text-center mb-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-progress-bg text-muted-extra">
                  {state.promptSource === "ai" ? "🤖 grok" : state.promptSource === "admin" ? "👑 host" : "📦 classic"}
                </span>
              </p>
            )}
            {isVoyeur ? (
              <div className="text-center py-8" role="status">
                <div className="text-6xl mb-4" role="img" aria-label="Watching">👁️</div>
                <p className="text-card-muted">You&apos;re watching. Waiting for players to submit...</p>
                <button
                  onClick={toggleVoyeur}
                  className="mt-4 px-4 py-2 text-purple-600 font-medium hover:underline"
                >
                  Rejoin as player
                </button>
              </div>
            ) : !hasSubmitted ? (
              <>
                <label htmlFor="answer-input" className="sr-only">Your answer</label>
                <textarea
                  id="answer-input"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value.slice(0, 100))}
                  placeholder="Type your answer..."
                  className="w-full p-4 rounded-xl border-2 border-input-border focus:border-purple-500 focus:outline-none text-lg resize-none h-32 bg-input-bg text-card-text"
                  maxLength={100}
                  aria-describedby="char-count"
                />
                <div className="flex justify-between items-center mt-2">
                  <span id="char-count" className="text-card-muted" aria-live="polite">{answer.length}/100 characters</span>
                  <button
                    onClick={submitAnswer}
                    disabled={!answer.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl disabled:opacity-50 hover:scale-105 transition-transform"
                  >
                    SUBMIT
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8" role="status">
                <div className="text-6xl mb-4" role="img" aria-label="Checkmark">✓</div>
                <p className="text-card-muted">Answer submitted. Waiting for others...</p>
              </div>
            )}
            {/* Submission progress */}
            <div className="mt-4 p-3 bg-progress-bg rounded-xl">
              <p className="text-sm text-card-muted mb-2">
                Submitted: {state.submittedPlayerIds?.length || 0}/{activePlayers.length}
                {state.players.length > activePlayers.length && (
                  <span className="text-muted-extra"> ({state.players.length - activePlayers.length} watching)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {state.players.map((p) => (
                  <span
                    key={p.id}
                    className={`text-xs px-2 py-1 rounded-full ${
                      p.isVoyeur
                        ? "bg-progress-bg text-muted-extra opacity-50"
                        : state.submittedPlayerIds?.includes(p.id)
                        ? "bg-submitted-bg text-submitted-text"
                        : "bg-card-border text-card-muted"
                    }`}
                  >
                    {p.id === state.hostId && <span role="img" aria-label="Host">👑 </span>}
                    {p.name} {streakBadge(p)}
                    {p.isVoyeur && <span role="img" aria-label="Watching"> 👁️</span>}
                    {!p.isVoyeur && state.submittedPlayerIds?.includes(p.id) && <span role="img" aria-label="Submitted"> ✓</span>}
                  </span>
                ))}
              </div>
            </div>
            {isHost && (
              <button
                onClick={endWriting}
                className="w-full mt-4 py-3 bg-btn-secondary text-white font-bold rounded-xl hover:bg-btn-secondary-hover transition-colors"
              >
                END WRITING → VOTE
              </button>
            )}
          </div>
        )}

        {/* VOTING */}
        {state.phase === "voting" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-center mb-1">{state.currentPrompt}</h2>
            {state.promptSource && (
              <p className="text-center mb-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-progress-bg text-muted-extra">
                  {state.promptSource === "ai" ? "🤖 grok" : state.promptSource === "admin" ? "👑 host" : "📦 classic"}
                </span>
              </p>
            )}
            {isVoyeur ? (
              <>
                <div className="text-center py-4 mb-4">
                  <span className="text-card-muted">👁️ Watching the votes come in...</span>
                </div>
                <div className="space-y-3">
                  {state.answers.map((a) => (
                    <div
                      key={a.answerId}
                      className="w-full p-4 bg-progress-bg rounded-xl text-left opacity-75"
                    >
                      {a.answer}
                    </div>
                  ))}
                </div>
                <button
                  onClick={toggleVoyeur}
                  className="w-full mt-4 py-2 text-purple-600 font-medium hover:underline"
                >
                  Rejoin as player
                </button>
              </>
            ) : !hasVoted ? (
              <div className="space-y-3">
                {state.answers
                  .filter((a) => !a.isOwn)
                  .map((a) => (
                    <button
                      key={a.answerId}
                      onClick={() => vote(a.answerId)}
                      className="w-full p-4 bg-progress-bg rounded-xl text-left hover:bg-highlight-bg hover:border-purple-500 border-2 border-transparent transition-colors"
                    >
                      {a.answer}
                    </button>
                  ))}
                {state.answers.filter((a) => !a.isOwn).length === 0 && (
                  <p className="text-center text-card-muted">No other answers to vote on</p>
                )}
              </div>
            ) : (
              <div className="text-center py-8" role="status">
                <div className="text-6xl mb-4" role="img" aria-label="Checkmark">✓</div>
                <p className="text-card-muted">Vote submitted. Waiting for others...</p>
              </div>
            )}
            {/* Voting progress */}
            <div className="mt-4 p-3 bg-progress-bg rounded-xl">
              <p className="text-sm text-card-muted mb-2">
                Voted: {state.votedPlayerIds?.length || 0}/{activePlayers.length}
                {state.players.length > activePlayers.length && (
                  <span className="text-muted-extra"> ({state.players.length - activePlayers.length} watching)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {state.players.map((p) => (
                  <span
                    key={p.id}
                    className={`text-xs px-2 py-1 rounded-full ${
                      p.isVoyeur
                        ? "bg-progress-bg text-muted-extra opacity-50"
                        : state.votedPlayerIds?.includes(p.id)
                        ? "bg-submitted-bg text-submitted-text"
                        : "bg-card-border text-card-muted"
                    }`}
                  >
                    {p.id === state.hostId && <span role="img" aria-label="Host">👑 </span>}
                    {p.name} {streakBadge(p)}
                    {p.isVoyeur && <span role="img" aria-label="Watching"> 👁️</span>}
                    {!p.isVoyeur && state.votedPlayerIds?.includes(p.id) && <span role="img" aria-label="Voted"> ✓</span>}
                  </span>
                ))}
              </div>
            </div>
            {isHost && (
              <button
                onClick={endVoting}
                className="w-full mt-4 py-3 bg-btn-secondary text-white font-bold rounded-xl hover:bg-btn-secondary-hover transition-colors"
              >
                END VOTING → RESULTS
              </button>
            )}
          </div>
        )}

        {/* REVEAL */}
        {state.phase === "reveal" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-center mb-4">Results</h2>
            <div className="space-y-3">
              {state.answers
                .sort((a, b) => b.votes - a.votes)
                .map((a, i) => {
                  const player = state.players.find((p) => p.id === a.playerId);
                  const isWinner = a.votes === Math.max(...state.answers.map((x) => x.votes)) && a.votes > 0;
                  return (
                    <div
                      key={i}
                      className={`p-4 rounded-xl ${isWinner ? "bg-winner-bg border-2 border-winner-border" : "bg-progress-bg"}`}
                    >
                      <div className="font-bold text-lg">{a.answer}</div>
                      <div className="flex justify-between text-sm text-card-muted mt-1">
                        <span>- {player?.name} {player && streakBadge(player)}</span>
                        <span>
                          {a.votes} vote{a.votes !== 1 ? "s" : ""}{" "}
                          {isWinner && a.votes > 0 && <span className="text-yellow-600">+{a.votes * 100 + 200}pts</span>}
                          {!isWinner && a.votes > 0 && <span className="text-purple-600">+{a.votes * 100}pts</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
            {isHost && (
              <button
                onClick={nextRound}
                className="w-full mt-4 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl hover:scale-105 transition-transform"
              >
                NEXT ROUND →
              </button>
            )}
          </div>
        )}

        {/* FINAL */}
        {state.phase === "final" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-3xl font-black text-center mb-6">
              {sortedPlayers[0]?.name} WINS!
            </h2>
            <div className="space-y-2 mb-6">
              {sortedPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl flex justify-between ${
                    p.isVoyeur
                      ? "bg-progress-bg opacity-50"
                      : i === 0
                      ? "bg-winner-bg border-2 border-winner-border"
                      : "bg-progress-bg"
                  }`}
                >
                  <span>
                    {i === 0 && !p.isVoyeur && <span role="img" aria-label="Winner">🏆 </span>}
                    {p.id === state.hostId && <span role="img" aria-label="Host">👑 </span>}
                    {p.name} {streakBadge(p)}
                    {p.isVoyeur && <span role="img" aria-label="Watching"> 👁️</span>}
                  </span>
                  <span className="font-bold">{p.score} pts</span>
                </div>
              ))}
            </div>
            {isHost && (
              <button
                onClick={restart}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform"
              >
                PLAY AGAIN
              </button>
            )}
          </div>
        )}

        {/* Compact Scoreboard (during game) */}
          {["writing", "voting", "reveal"].includes(state.phase) && (
            <div className="mt-4 bg-accent-bg backdrop-blur rounded-2xl p-3">
              {renderCompactScoreboard()}
            </div>
          )}
        </div>

        {/* Admin sidebar (desktop only) - positioned on left edge */}
        {isAdmin && (
          <div className="hidden lg:block fixed left-4 top-4 w-72 h-[calc(100vh-2rem)]">
            <AdminPanel
              exactQuestion={adminState.exactQuestion}
              promptGuidance={adminState.promptGuidance}
              onSetOverride={setAdminOverride}
            />
          </div>
        )}

        {/* Mobile admin button and drawer */}
        {isAdmin && (
          <>
            {/* Floating button (mobile only) */}
            <button
              onClick={() => setShowMobileAdmin(true)}
              className="lg:hidden fixed left-4 bottom-4 z-40 bg-purple-600 text-white px-4 py-3 rounded-full font-bold shadow-lg hover:bg-purple-700 transition-colors"
              aria-label="Open admin controls"
            >
              Admin
            </button>

            {/* Drawer overlay (mobile only) */}
            {showMobileAdmin && (
              <div className="lg:hidden fixed inset-0 z-50 flex">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setShowMobileAdmin(false)}
                />
                {/* Drawer */}
                <div className="relative w-80 max-w-[85vw] h-full bg-card-bg shadow-xl">
                  <button
                    onClick={() => setShowMobileAdmin(false)}
                    className="absolute top-4 right-4 z-10 text-card-muted hover:text-card-text text-2xl"
                    aria-label="Close admin panel"
                  >
                    x
                  </button>
                  <AdminPanel
                    exactQuestion={adminState.exactQuestion}
                    promptGuidance={adminState.promptGuidance}
                    onSetOverride={setAdminOverride}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Chat sidebar (desktop only) - positioned on right edge */}
        <div className="hidden lg:block fixed right-4 top-4 w-80 h-[calc(100vh-2rem)]">
          {renderChatPanel()}
        </div>
      </div>
    </main>
  );
}
