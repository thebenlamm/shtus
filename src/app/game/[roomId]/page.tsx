"use client";

import { useEffect, useState, useRef, use } from "react";
import PartySocket from "partysocket";

interface Player {
  id: string;
  name: string;
  score: number;
}

interface Answer {
  playerId: string;
  answer: string;
  votes: number;
}

interface GameState {
  phase: string;
  round: number;
  players: Player[];
  hostId: string | null;
  currentPrompt: string;
  theme: string;
  isGenerating: boolean;
  answers: Answer[];
  votes: Record<string, string>;
}

export default function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ name?: string }>;
}) {
  const { roomId } = use(params);
  const { name } = use(searchParams);
  const [state, setState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [theme, setTheme] = useState("");
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({
      host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
      room: roomId,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      setMyId(socket.id);
      socket.send(JSON.stringify({ type: "join", name: name || "Player" }));
    };

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "state") {
        setState(data);
      }
    };

    return () => socket.close();
  }, [roomId, name]);

  useEffect(() => {
    if (state?.phase === "writing") {
      setHasSubmitted(false);
      setAnswer("");
    }
    if (state?.phase === "voting") {
      setHasVoted(false);
    }
  }, [state?.phase, state?.round]);

  const send = (data: object) => {
    socketRef.current?.send(JSON.stringify(data));
  };

  const startGame = () => send({ type: "start", theme: theme || "random funny questions" });
  const endWriting = () => send({ type: "end-writing" });
  const endVoting = () => send({ type: "end-voting" });
  const nextRound = () => send({ type: "next-round" });
  const submitAnswer = () => {
    if (answer.trim()) {
      send({ type: "answer", answer: answer.trim() });
      setHasSubmitted(true);
    }
  };
  const vote = (playerId: string) => {
    send({ type: "vote", votedFor: playerId });
    setHasVoted(true);
  };
  const restart = () => send({ type: "restart" });

  if (!state) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
        <div className="text-white text-2xl">Connecting...</div>
      </div>
    );
  }

  const isHost = myId === state.hostId;
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);

  const copyLink = () => {
    const url = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-4">
      {/* Screen reader announcements for game state changes */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {state.phase === "writing" && `Round ${state.round}. ${state.currentPrompt}. Write your answer now.`}
        {state.phase === "voting" && "Vote for your favorite answer."}
        {state.phase === "reveal" && "Results are in."}
        {state.phase === "final" && `Game over. ${sortedPlayers[0]?.name} wins!`}
      </div>
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-black/50 backdrop-blur px-4 py-2 rounded-full text-white font-bold">
              Room: {roomId}
            </div>
            <button
              onClick={copyLink}
              className="bg-black/50 backdrop-blur px-3 py-2 rounded-full text-white font-bold hover:bg-black/70 transition-colors"
              aria-label="Copy invite link"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
          {state.round > 0 && (
            <div className="bg-black/50 backdrop-blur px-4 py-2 rounded-full text-white font-bold">
              Round {state.round}/5
            </div>
          )}
        </div>

        {/* LOBBY */}
        {state.phase === "lobby" && (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-center mb-4">
              {state.isGenerating ? "Generating prompts..." : "Waiting for players..."}
            </h2>

            {state.isGenerating ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4 animate-pulse">🎲</div>
                <p className="text-gray-600">AI is cooking up questions about:</p>
                <p className="text-purple-600 font-bold text-lg mt-2">{state.theme}</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-6">
                  {state.players.map((p) => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl ${p.id === myId ? "bg-purple-100 border-2 border-purple-500" : "bg-gray-100"}`}
                    >
                      {p.name} {p.id === state.hostId && "(Host)"}
                    </div>
                  ))}
                </div>

                {isHost && (
                  <div className="mb-4">
                    <label htmlFor="theme-input" className="block text-sm font-medium text-gray-700 mb-2">
                      Game Theme (AI will generate questions)
                    </label>
                    <input
                      id="theme-input"
                      type="text"
                      placeholder="e.g., The naked truth, Office nightmares, Dating disasters"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
                      maxLength={100}
                    />
                  </div>
                )}

                <p className="text-center text-gray-500 mb-4">
                  {state.players.length < 2
                    ? `Need at least 2 players (${state.players.length}/8)`
                    : `${state.players.length} players ready!`}
                </p>

                {isHost && state.players.length >= 2 && (
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl font-bold rounded-xl hover:scale-105 transition-transform"
                  >
                    START GAME
                  </button>
                )}
                {!isHost && <p className="text-center text-gray-500">Waiting for host to start...</p>}
              </>
            )}
          </div>
        )}

        {/* PROMPT */}
        {state.phase === "prompt" && (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-8 text-center">
            <p className="text-gray-500 mb-4">Round {state.round}</p>
            <h2 className="text-3xl font-black text-gray-800">{state.currentPrompt}</h2>
          </div>
        )}

        {/* WRITING */}
        {state.phase === "writing" && (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-center mb-2">{state.currentPrompt}</h2>
            {!hasSubmitted ? (
              <>
                <label htmlFor="answer-input" className="sr-only">Your answer</label>
                <textarea
                  id="answer-input"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value.slice(0, 100))}
                  placeholder="Type your answer..."
                  className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:outline-none text-lg resize-none h-32"
                  maxLength={100}
                  aria-describedby="char-count"
                />
                <div className="flex justify-between items-center mt-2">
                  <span id="char-count" className="text-gray-500" aria-live="polite">{answer.length}/100 characters</span>
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
                <p className="text-gray-500">Answer submitted. Waiting for others...</p>
              </div>
            )}
            {isHost && (
              <button
                onClick={endWriting}
                className="w-full mt-4 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition-colors"
              >
                END WRITING → VOTE
              </button>
            )}
          </div>
        )}

        {/* VOTING */}
        {state.phase === "voting" && (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-center mb-4">{state.currentPrompt}</h2>
            {!hasVoted ? (
              <div className="space-y-3">
                {state.answers
                  .filter((a) => a.playerId !== myId)
                  .map((a, i) => (
                    <button
                      key={i}
                      onClick={() => vote(a.playerId)}
                      className="w-full p-4 bg-gray-100 rounded-xl text-left hover:bg-purple-100 hover:border-purple-500 border-2 border-transparent transition-colors"
                    >
                      {a.answer}
                    </button>
                  ))}
                {state.answers.filter((a) => a.playerId !== myId).length === 0 && (
                  <p className="text-center text-gray-500">No other answers to vote on</p>
                )}
              </div>
            ) : (
              <div className="text-center py-8" role="status">
                <div className="text-6xl mb-4" role="img" aria-label="Checkmark">✓</div>
                <p className="text-gray-500">Vote submitted. Waiting for others...</p>
              </div>
            )}
            {isHost && (
              <button
                onClick={endVoting}
                className="w-full mt-4 py-3 bg-gray-800 text-white font-bold rounded-xl hover:bg-gray-700 transition-colors"
              >
                END VOTING → RESULTS
              </button>
            )}
          </div>
        )}

        {/* REVEAL */}
        {state.phase === "reveal" && (
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-6">
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
                      className={`p-4 rounded-xl ${isWinner ? "bg-yellow-100 border-2 border-yellow-400" : "bg-gray-100"}`}
                    >
                      <div className="font-bold text-lg">{a.answer}</div>
                      <div className="flex justify-between text-sm text-gray-600 mt-1">
                        <span>- {player?.name}</span>
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
          <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl p-6">
            <h2 className="text-3xl font-black text-center mb-6">
              {sortedPlayers[0]?.name} WINS!
            </h2>
            <div className="space-y-2 mb-6">
              {sortedPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl flex justify-between ${i === 0 ? "bg-yellow-100 border-2 border-yellow-400" : "bg-gray-100"}`}
                >
                  <span>
                    {i === 0 && "Winner "} {p.name}
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

        {/* Scoreboard (during game) */}
        {["writing", "voting", "reveal"].includes(state.phase) && (
          <div className="mt-4 bg-black/50 backdrop-blur rounded-2xl p-4">
            <h3 className="text-white font-bold mb-2">Scores</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-white">
              {sortedPlayers.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
