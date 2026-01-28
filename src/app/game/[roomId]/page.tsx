"use client";

import { useEffect, useState, useRef, use, useCallback } from "react";
import PartySocket from "partysocket";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile, getInitialIsMobile } from "@/hooks/useIsMobile";
import AdminPanel from "@/components/AdminPanel";

const CHAT_ENABLED = process.env.NEXT_PUBLIC_CHAT_ENABLED === "true";

// Connection status for UI feedback
type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

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
  isPromptLoading: boolean;
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
  const [themeError, setThemeError] = useState<string | null>(null);
  const [roundLimit, setRoundLimit] = useState<number | null>(null); // Default to endless
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);
  const { theme: colorTheme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();

  // Connection state tracking
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const connectionStatusRef = useRef<ConnectionStatus>("connecting"); // Ref for handlers to avoid stale closures

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
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const showMobileChatRef = useRef(false); // Track current value for WebSocket handler
  const isMobileRef = useRef(getInitialIsMobile()); // Track current value for WebSocket handler
  const chatInputRef = useRef<HTMLInputElement>(null); // For focus management
  const adminDrawerRef = useRef<HTMLDivElement>(null); // For admin drawer focus
  const previousFocusRef = useRef<HTMLElement | null>(null); // Restore focus on close

  // Cleanup refs for timeouts
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Track if user is near bottom of chat for auto-scroll behavior
  const isNearBottomRef = useRef(true);

  // Guarded send function - only sends if socket is OPEN
  const send = useCallback((data: object): boolean => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // Check if we can send (for UI state)
  const canSend = connectionStatus === "connected";

  // Keep ref in sync with state for handlers
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    mountedRef.current = true;

    // Generate or retrieve stable userId for session persistence across refreshes
    const storageKey = `shtus-user-${roomId}`;
    let userId = localStorage.getItem(storageKey);
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(storageKey, userId);
    }

    // Handle admin key: use sessionStorage for reduced exposure (cleared on tab close).
    // This is a security tradeoff: sessionStorage limits persistence but admin key
    // still exists in browser memory during the session. True security requires
    // server-side token validation with short TTLs.
    const adminStorageKey = `shtus-admin-${roomId}`;
    let adminKey: string | null = null;
    try {
      if (adminParam) {
        // New admin key from URL - store in sessionStorage
        sessionStorage.setItem(adminStorageKey, adminParam);
        adminKey = adminParam;
      } else {
        // Check if we have a stored admin key (for reconnection within session)
        adminKey = sessionStorage.getItem(adminStorageKey);
      }
    } catch {
      // sessionStorage unavailable - use URL param only
      adminKey = adminParam || null;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: setting initial state when effect runs
    setConnectionStatus("connecting");

    const socket = new PartySocket({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
      room: roomId,
      id: userId,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connected");
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

    socket.onerror = () => {
      if (!mountedRef.current) return;
      // PartySocket handles reconnection automatically; we just track the state
      // Use ref to avoid stale closure
      if (connectionStatusRef.current !== "disconnected") {
        setConnectionStatus("reconnecting");
      }
    };

    socket.onclose = () => {
      if (!mountedRef.current) return;
      // PartySocket will attempt reconnection automatically with exponential backoff
      setConnectionStatus("reconnecting");
    };

    socket.onmessage = (e) => {
      if (!mountedRef.current) return;

      // Guard against malformed payloads
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        // Ignore malformed messages
        return;
      }

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
          const newMessages = (data.messages ?? []).filter((m: ChatMessage) => !existingIds.has(m.id));
          return [...prev, ...newMessages].sort((a, b) => a.timestamp - b.timestamp);
        });
      } else if (data.type === "chat_message") {
        setChatMessages(prev => {
          // Deduplicate
          if (prev.some(m => m.id === data.message?.id)) {
            return prev;
          }
          if (!data.message) return prev;
          // Sort to handle rare out-of-order WebSocket delivery
          return [...prev, data.message].sort((a, b) => a.timestamp - b.timestamp);
        });
        // Track unread for mobile only (when on mobile, drawer closed, message from others, not system)
        if (
          isMobileRef.current &&
          !showMobileChatRef.current &&
          data.message?.playerId !== socketRef.current?.id &&
          data.message?.type === "chat"
        ) {
          setUnreadChatCount(prev => prev + 1);
        }
      }
    };

    return () => {
      mountedRef.current = false;
      socket.close();
    };
    // Note: connectionStatus intentionally excluded - handlers use ref to avoid recreating socket
  }, [roomId, name, adminParam]);

  // Reset local state on phase change
  useEffect(() => {
    if (state?.phase === "writing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: reset local input when entering new writing phase
      setAnswer("");
    }
  }, [state?.phase, state?.round]);

  // Sync hasSubmitted with server state (derived from submittedPlayerIds)
  useEffect(() => {
    if (state?.phase === "writing" && myId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync local state with server state
      setHasSubmitted((state.submittedPlayerIds ?? []).includes(myId));
    } else if (state?.phase !== "writing") {
      setHasSubmitted(false);
    }
  }, [state?.phase, state?.submittedPlayerIds, myId]);

  // Sync hasVoted with server state (derived from votedPlayerIds)
  useEffect(() => {
    if (state?.phase === "voting" && myId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync local state with server state
      setHasVoted((state.votedPlayerIds ?? []).includes(myId));
    } else if (state?.phase !== "voting") {
      setHasVoted(false);
    }
  }, [state?.phase, state?.votedPlayerIds, myId]);

  // Sync refs with state for WebSocket handler
  useEffect(() => {
    showMobileChatRef.current = showMobileChat;
  }, [showMobileChat]);

  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  // Reset drawer state when crossing breakpoint to avoid stale state
  useEffect(() => {
    if (!isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional sync when breakpoint changes
      setShowMobileChat(false);
      setShowMobileAdmin(false);
      setUnreadChatCount(0); // Clear badge when switching to desktop (chat visible)
    }
  }, [isMobile]);

  // Escape key closes mobile drawers
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showMobileChat) setShowMobileChat(false);
        if (showMobileAdmin) setShowMobileAdmin(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showMobileChat, showMobileAdmin]);

  // Focus management and body scroll lock for drawers
  useEffect(() => {
    const isAnyDrawerOpen = showMobileChat || showMobileAdmin;

    if (isAnyDrawerOpen) {
      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Save current focus to restore later
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Focus the appropriate element after a brief delay for DOM to settle
      let focusTimer: ReturnType<typeof setTimeout> | null = null;
      if (showMobileChat) {
        focusTimer = setTimeout(() => chatInputRef.current?.focus(), 50);
      } else if (showMobileAdmin) {
        // Focus first focusable element in admin drawer
        focusTimer = setTimeout(() => {
          const focusable = adminDrawerRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          focusable?.focus();
        }, 50);
      }

      return () => {
        // Restore body scroll
        document.body.style.overflow = originalOverflow;
        // Clear focus timer
        if (focusTimer) clearTimeout(focusTimer);
      };
    } else if (previousFocusRef.current) {
      // Restore focus when drawer closes
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [showMobileChat, showMobileAdmin]);

  // Track scroll position in chat for smart auto-scroll
  const handleChatScroll = useCallback(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // Consider "near bottom" if within 100px of the bottom
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    }
  }, []);

  // Auto-scroll chat to bottom when new messages arrive (only if user is near bottom)
  useEffect(() => {
    if (chatContainerRef.current && isNearBottomRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const sendChat = () => {
    if (chatInput.trim() && canSend) {
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

  // Theme validation: allow letters, numbers, spaces, and common punctuation
  const THEME_REGEX = /^[a-zA-Z0-9\s.,!?'"()-]+$/;
  const MIN_THEME_LENGTH = 3;

  const validateTheme = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null; // Empty is OK (uses default)
    if (trimmed.length < MIN_THEME_LENGTH) return `Theme must be at least ${MIN_THEME_LENGTH} characters`;
    if (!THEME_REGEX.test(trimmed)) return "Theme contains invalid characters";
    return null;
  };

  const handleThemeChange = (value: string) => {
    setTheme(value);
    if (themeError) {
      setThemeError(validateTheme(value));
    }
  };

  const startGame = () => {
    const trimmedTheme = theme.trim();
    const error = validateTheme(trimmedTheme);
    if (error) {
      setThemeError(error);
      return;
    }
    setThemeError(null);
    if (canSend) send({ type: "start", theme: trimmedTheme || "random funny questions", roundLimit });
  };
  const endWriting = () => {
    if (canSend) send({ type: "end-writing" });
  };
  const endVoting = () => {
    if (canSend) send({ type: "end-voting" });
  };
  const nextRound = () => {
    if (canSend) send({ type: "next-round" });
  };
  const toggleVoyeur = () => {
    if (canSend) send({ type: "toggle-voyeur" });
  };
  const submitAnswer = () => {
    if (answer.trim() && canSend) {
      send({ type: "answer", answer: answer.trim() });
      // Optimistic update - server state will confirm via submittedPlayerIds
      setHasSubmitted(true);
    }
  };
  const vote = (answerId: number) => {
    if (canSend) {
      send({ type: "vote", votedFor: answerId });
      // Optimistic update - server state will confirm via votedPlayerIds
      setHasVoted(true);
    }
  };
  const restart = () => {
    if (canSend) send({ type: "restart" });
  };
  const setAdminOverride = (data: { exactQuestion?: string | null; promptGuidance?: string | null }) => {
    if (canSend) send({ type: "admin-set-override", ...data });
  };

  // Focus trap handler for modal drawers
  const handleFocusTrap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const container = e.currentTarget;
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Connection status banner
  const renderConnectionBanner = () => {
    if (connectionStatus === "connected" || !state) return null;

    const messages: Record<ConnectionStatus, string> = {
      connecting: "Connecting...",
      reconnecting: "Connection lost. Reconnecting...",
      disconnected: "Disconnected. Please refresh the page.",
      connected: "",
    };

    const bgColors: Record<ConnectionStatus, string> = {
      connecting: "bg-yellow-500",
      reconnecting: "bg-orange-500",
      disconnected: "bg-red-500",
      connected: "",
    };

    return (
      <div
        className={`fixed top-0 left-0 right-0 z-50 ${bgColors[connectionStatus]} text-white text-center py-2 px-4 text-sm font-medium`}
        role="status"
        aria-live="polite"
        data-testid="connection-status"
        data-status={connectionStatus}
      >
        {messages[connectionStatus]}
      </div>
    );
  };

  if (!state) {
    return (
      <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center" aria-busy="true">
        <div role="status" aria-live="polite" className="text-white text-2xl">Connecting...</div>
      </main>
    );
  }

  const isHost = myId === state.hostId;
  const myPlayer = (state.players ?? []).find(p => p.id === myId);
  const isVoyeur = myPlayer?.isVoyeur ?? false;
  const players = state.players ?? [];
  const activePlayers = players.filter(p => !p.isVoyeur && !p.disconnectedAt);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const answers = state.answers ?? [];

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
    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setCopied(false);
      }
    }, 2000);
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
        onScroll={handleChatScroll}
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
            ref={chatInputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value.slice(0, 150))}
            onKeyDown={handleChatKeyDown}
            placeholder={canSend ? "Type a message..." : "Reconnecting..."}
            disabled={!canSend}
            className="flex-1 px-3 py-2 rounded-lg border border-input-border bg-input-bg text-card-text text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
            maxLength={150}
          />
          <button
            onClick={sendChat}
            disabled={!chatInput.trim() || !canSend}
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
    <main id="main" className={`min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to p-4 ${connectionStatus !== "connected" && state ? "pt-12" : ""}`}>
      {/* Connection status banner */}
      {renderConnectionBanner()}

      <h1 className="sr-only">Shtus Game Room {roomId}</h1>
      {/* Screen reader announcements for game state changes */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {state.phase === "writing" && `Round ${state.round}. ${state.currentPrompt}. Write your answer now.`}
        {state.phase === "voting" && "Vote for your favorite answer."}
        {state.phase === "reveal" && "Results are in."}
        {state.phase === "final" && `Game over. ${sortedPlayers[0]?.name} wins!`}
      </div>

      <div className={`max-w-6xl mx-auto relative ${CHAT_ENABLED ? 'lg:pr-96' : ''}`}>
        {/* Game area - centered (pr-96 on lg accounts for fixed chat sidebar) */}
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-accent-bg backdrop-blur px-4 py-2 rounded-full text-white font-bold" data-testid="room-code">
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
              disabled={!canSend}
              className={`backdrop-blur px-3 py-2 rounded-full font-bold transition-colors disabled:opacity-50 ${
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
            <div className="bg-accent-bg backdrop-blur px-4 py-2 rounded-full text-white font-bold" data-testid="round-indicator">
              Round {state.round}{state.roundLimit ? `/${state.roundLimit}` : ''}
            </div>
          )}
        </div>

        {/* LOBBY */}
        {state.phase === "lobby" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6" data-testid="lobby-phase">
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
                <ul className="space-y-2 mb-6" aria-label="Players in room" data-testid="player-list">
                  {players.map((p) => (
                    <li
                      key={p.id}
                      data-testid={`player-${p.id}`}
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
                        data-testid="theme-input"
                        type="text"
                        placeholder="e.g., The naked truth, Office nightmares, Dating disasters"
                        value={theme}
                        onChange={(e) => handleThemeChange(e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none bg-input-bg text-card-text ${
                          themeError
                            ? "border-red-500 focus:border-red-500"
                            : "border-input-border focus:border-purple-500"
                        }`}
                        maxLength={100}
                        aria-invalid={!!themeError}
                        aria-describedby={themeError ? "theme-error" : undefined}
                      />
                      {themeError && (
                        <p id="theme-error" className="text-red-500 text-sm mt-1" role="alert">
                          {themeError}
                        </p>
                      )}
                    </div>
                    <div className="mb-4">
                      <span className="block text-sm font-medium text-label-text mb-2">Rounds</span>
                      <div className="flex gap-2" role="group" aria-label="Select number of rounds" data-testid="round-selector">
                        {[3, 5, 10].map((num) => (
                          <button
                            key={num}
                            data-testid={`round-${num}`}
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
                          data-testid="round-endless"
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
                    ? `Need at least 2 active players (${activePlayers.length} active${players.length > activePlayers.length ? `, ${players.length - activePlayers.length} watching` : ""})`
                    : `${activePlayers.length} players ready!${players.length > activePlayers.length ? ` (${players.length - activePlayers.length} watching)` : ""}`}
                </p>

                {isHost && activePlayers.length >= 2 && (
                  <button
                    data-testid="start-game-btn"
                    onClick={startGame}
                    disabled={!canSend}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
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
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6" data-testid="writing-phase">
            {state.isPromptLoading ? (
              <div className="text-center py-4 mb-2">
                <div className="text-4xl mb-2 animate-pulse" role="img" aria-label="Loading">🎲</div>
                <h2 className="text-xl font-bold text-card-muted" data-testid="current-prompt">Generating question...</h2>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-center mb-1" data-testid="current-prompt">{state.currentPrompt}</h2>
                {state.promptSource && (
                  <p className="text-center mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-progress-bg text-muted-extra">
                      {state.promptSource === "ai" ? "🤖 grok" : state.promptSource === "admin" ? "👑 host" : "📦 classic"}
                    </span>
                  </p>
                )}
              </>
            )}
            {isVoyeur ? (
              <div className="text-center py-8" role="status">
                <div className="text-6xl mb-4" role="img" aria-label="Watching">👁️</div>
                <p className="text-card-muted">You&apos;re watching. Waiting for players to submit...</p>
                <button
                  onClick={toggleVoyeur}
                  disabled={!canSend}
                  className="mt-4 px-4 py-2 text-purple-600 font-medium hover:underline disabled:opacity-50"
                >
                  Rejoin as player
                </button>
              </div>
            ) : !hasSubmitted ? (
              <>
                <label htmlFor="answer-input" className="sr-only">Your answer</label>
                <textarea
                  id="answer-input"
                  data-testid="answer-input"
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
                    data-testid="submit-answer-btn"
                    onClick={submitAnswer}
                    disabled={!answer.trim() || !canSend}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl disabled:opacity-50 hover:scale-105 transition-transform disabled:hover:scale-100"
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
                Submitted: {(state.submittedPlayerIds ?? []).length}/{activePlayers.length}
                {players.length > activePlayers.length && (
                  <span className="text-muted-extra"> ({players.length - activePlayers.length} watching)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => (
                  <span
                    key={p.id}
                    className={`text-xs px-2 py-1 rounded-full ${
                      p.isVoyeur
                        ? "bg-progress-bg text-muted-extra opacity-50"
                        : (state.submittedPlayerIds ?? []).includes(p.id)
                        ? "bg-submitted-bg text-submitted-text"
                        : "bg-card-border text-card-muted"
                    }`}
                  >
                    {p.id === state.hostId && <span role="img" aria-label="Host">👑 </span>}
                    {p.name} {streakBadge(p)}
                    {p.isVoyeur && <span role="img" aria-label="Watching"> 👁️</span>}
                    {!p.isVoyeur && (state.submittedPlayerIds ?? []).includes(p.id) && <span role="img" aria-label="Submitted"> ✓</span>}
                  </span>
                ))}
              </div>
            </div>
            {isHost && (
              <button
                onClick={endWriting}
                disabled={!canSend}
                data-testid="end-writing-btn"
                className="w-full mt-4 py-3 bg-btn-secondary text-white font-bold rounded-xl hover:bg-btn-secondary-hover transition-colors disabled:opacity-50"
              >
                END WRITING → VOTE
              </button>
            )}
          </div>
        )}

        {/* VOTING */}
        {state.phase === "voting" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6" data-testid="voting-phase">
            <h2 className="text-xl font-bold text-center mb-1" data-testid="current-prompt">{state.currentPrompt}</h2>
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
                  {answers.map((a) => (
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
                  disabled={!canSend}
                  className="w-full mt-4 py-2 text-purple-600 font-medium hover:underline disabled:opacity-50"
                >
                  Rejoin as player
                </button>
              </>
            ) : !hasVoted ? (
              <div className="space-y-3" data-testid="vote-options">
                {answers
                  .filter((a) => !a.isOwn)
                  .map((a, index) => (
                    <button
                      key={a.answerId}
                      data-testid={`answer-option-${index}`}
                      onClick={() => vote(a.answerId)}
                      disabled={!canSend}
                      className="w-full p-4 bg-progress-bg rounded-xl text-left hover:bg-highlight-bg hover:border-purple-500 border-2 border-transparent transition-colors disabled:opacity-50"
                    >
                      {a.answer}
                    </button>
                  ))}
                {answers.filter((a) => !a.isOwn).length === 0 && (
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
                Voted: {(state.votedPlayerIds ?? []).length}/{activePlayers.length}
                {players.length > activePlayers.length && (
                  <span className="text-muted-extra"> ({players.length - activePlayers.length} watching)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => (
                  <span
                    key={p.id}
                    className={`text-xs px-2 py-1 rounded-full ${
                      p.isVoyeur
                        ? "bg-progress-bg text-muted-extra opacity-50"
                        : (state.votedPlayerIds ?? []).includes(p.id)
                        ? "bg-submitted-bg text-submitted-text"
                        : "bg-card-border text-card-muted"
                    }`}
                  >
                    {p.id === state.hostId && <span role="img" aria-label="Host">👑 </span>}
                    {p.name} {streakBadge(p)}
                    {p.isVoyeur && <span role="img" aria-label="Watching"> 👁️</span>}
                    {!p.isVoyeur && (state.votedPlayerIds ?? []).includes(p.id) && <span role="img" aria-label="Voted"> ✓</span>}
                  </span>
                ))}
              </div>
            </div>
            {isHost && (
              <button
                onClick={endVoting}
                disabled={!canSend}
                data-testid="end-voting-btn"
                className="w-full mt-4 py-3 bg-btn-secondary text-white font-bold rounded-xl hover:bg-btn-secondary-hover transition-colors disabled:opacity-50"
              >
                END VOTING → RESULTS
              </button>
            )}
          </div>
        )}

        {/* REVEAL */}
        {state.phase === "reveal" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6" data-testid="reveal-phase">
            <h2 className="text-xl font-bold text-center mb-4">Results</h2>
            <div className="space-y-3">
              {/* Sort a copy to avoid mutating state, use answerId as stable key */}
              {[...answers]
                .sort((a, b) => b.votes - a.votes)
                .map((a) => {
                  const player = players.find((p) => p.id === a.playerId);
                  const maxVotes = Math.max(...answers.map((x) => x.votes));
                  const isWinner = a.votes === maxVotes && a.votes > 0;
                  return (
                    <div
                      key={a.answerId}
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
                data-testid="next-round-btn"
                onClick={nextRound}
                disabled={!canSend}
                className="w-full mt-4 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                NEXT ROUND →
              </button>
            )}
          </div>
        )}

        {/* FINAL */}
        {state.phase === "final" && (
          <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-6" data-testid="final-phase">
            <h2 className="text-3xl font-black text-center mb-6" data-testid="winner-display">
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
                data-testid="play-again-btn"
                onClick={restart}
                disabled={!canSend}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
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
              onClick={() => {
                setShowMobileAdmin(true);
                setShowMobileChat(false); // Mutual exclusion
              }}
              className="lg:hidden fixed left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 bg-purple-600 text-white px-4 py-3 rounded-full font-bold shadow-lg hover:bg-purple-700 transition-colors"
              aria-label="Open admin controls"
            >
              Admin
            </button>

            {/* Drawer overlay (mobile only) */}
            {showMobileAdmin && (
              <div
                className="lg:hidden fixed inset-0 z-50 flex"
                role="dialog"
                aria-modal="true"
                aria-label="Admin controls"
                onKeyDown={handleFocusTrap}
              >
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/50"
                  onClick={() => setShowMobileAdmin(false)}
                />
                {/* Drawer */}
                <div
                  ref={adminDrawerRef}
                  className="relative w-80 max-w-[85vw] h-full bg-card-bg shadow-xl"
                >
                  <button
                    onClick={() => setShowMobileAdmin(false)}
                    className="absolute top-4 right-4 z-10 text-card-muted hover:text-card-text text-2xl p-2"
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

        {/* Chat - render only one panel at a time to avoid shared ref issues */}
        {CHAT_ENABLED && (
          isMobile ? (
            <>
              {/* Floating button (mobile) */}
              <button
                onClick={() => {
                  setShowMobileChat(true);
                  setShowMobileAdmin(false); // Mutual exclusion
                  setUnreadChatCount(0);
                }}
                className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 bg-purple-600 text-white px-4 py-3 rounded-full font-bold shadow-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                aria-label={`Open chat${unreadChatCount > 0 ? `, ${unreadChatCount > 99 ? "99+" : unreadChatCount} unread messages` : ""}`}
              >
                Chat
                {unreadChatCount > 0 && (
                  <span className="bg-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {unreadChatCount > 99 ? "99+" : unreadChatCount}
                  </span>
                )}
              </button>

              {/* Drawer overlay (mobile) */}
              {showMobileChat && (
                <div
                  className="fixed inset-0 z-50 flex justify-end"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Chat"
                  onKeyDown={handleFocusTrap}
                >
                  {/* Backdrop */}
                  <div
                    className="absolute inset-0 bg-black/50"
                    onClick={() => setShowMobileChat(false)}
                  />
                  {/* Drawer (slides in from right) */}
                  <div className="relative w-80 max-w-[85vw] h-full bg-card-bg shadow-xl">
                    <button
                      onClick={() => setShowMobileChat(false)}
                      className="absolute top-4 right-4 z-10 text-card-muted hover:text-card-text text-2xl p-2"
                      aria-label="Close chat"
                    >
                      x
                    </button>
                    {renderChatPanel()}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Chat sidebar (desktop) - positioned on right edge */
            <div className="fixed right-4 top-4 w-80 h-[calc(100vh-2rem)]">
              {renderChatPanel()}
            </div>
          )
        )}
      </div>
    </main>
  );
}
