import type * as Party from "partykit/server";

const PROMPTS = [
  "The worst thing to say on a first date",
  "A terrible name for a band",
  "What your dog is actually thinking",
  "The real reason dinosaurs went extinct",
  "A rejected slogan for McDonald's",
  "The worst superpower to have",
  "What your browser history would reveal about you",
  "A bad excuse for being late to work",
];

const PHASES = {
  LOBBY: "lobby",
  PROMPT: "prompt",
  WRITING: "writing",
  VOTING: "voting",
  REVEAL: "reveal",
  FINAL: "final",
} as const;

type Phase = (typeof PHASES)[keyof typeof PHASES];

interface Player {
  id: string;
  name: string;
  score: number;
  answer?: string;
  vote?: string;
}

interface GameState {
  phase: Phase;
  round: number;
  players: Record<string, Player>;
  hostId: string | null;
  currentPrompt: string;
  promptIndices: number[];
  answers: Record<string, string>;
  votes: Record<string, string>;
  timer: number;
}

export default class PsychServer implements Party.Server {
  state: GameState;
  timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly room: Party.Room) {
    this.state = this.initialState();
  }

  initialState(): GameState {
    return {
      phase: PHASES.LOBBY,
      round: 0,
      players: {},
      hostId: null,
      currentPrompt: "",
      promptIndices: this.shufflePrompts(),
      answers: {},
      votes: {},
      timer: 0,
    };
  }

  shufflePrompts(): number[] {
    const indices = Array.from({ length: PROMPTS.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, 5);
  }

  broadcast(message: object) {
    this.room.broadcast(JSON.stringify(message));
  }

  sendState() {
    const publicState = {
      type: "state",
      phase: this.state.phase,
      round: this.state.round,
      players: Object.values(this.state.players),
      hostId: this.state.hostId,
      currentPrompt: this.state.currentPrompt,
      timer: this.state.timer,
      answers:
        this.state.phase === PHASES.VOTING || this.state.phase === PHASES.REVEAL
          ? Object.entries(this.state.answers).map(([playerId, answer]) => ({
              playerId,
              answer,
              votes:
                this.state.phase === PHASES.REVEAL
                  ? Object.values(this.state.votes).filter((v) => v === playerId)
                      .length
                  : 0,
            }))
          : [],
      votes: this.state.phase === PHASES.REVEAL ? this.state.votes : {},
    };
    this.broadcast(publicState);
  }

  startTimer(seconds: number, onComplete: () => void) {
    this.clearTimer();
    this.state.timer = seconds;
    this.sendState();

    this.timerInterval = setInterval(() => {
      this.state.timer--;
      if (this.state.timer <= 0) {
        this.clearTimer();
        onComplete();
      } else {
        this.sendState();
      }
    }, 1000);
  }

  clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  startRound() {
    if (this.state.round >= 5) {
      this.state.phase = PHASES.FINAL;
      this.sendState();
      return;
    }

    this.state.round++;
    this.state.answers = {};
    this.state.votes = {};
    this.state.phase = PHASES.PROMPT;
    this.state.currentPrompt =
      PROMPTS[this.state.promptIndices[this.state.round - 1]];

    this.sendState();

    setTimeout(() => {
      this.state.phase = PHASES.WRITING;
      this.startTimer(35, () => this.endWriting());
    }, 3000);
  }

  endWriting() {
    // Move to voting
    this.state.phase = PHASES.VOTING;
    this.startTimer(20, () => this.endVoting());
  }

  endVoting() {
    // Calculate scores
    const voteCounts: Record<string, number> = {};
    Object.values(this.state.votes).forEach((votedFor) => {
      voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
    });

    // Find max votes
    const maxVotes = Math.max(...Object.values(voteCounts), 0);

    // Award points
    Object.entries(voteCounts).forEach(([playerId, votes]) => {
      if (this.state.players[playerId]) {
        this.state.players[playerId].score += votes * 100;
        if (votes === maxVotes && maxVotes > 0) {
          this.state.players[playerId].score += 200;
        }
      }
    });

    this.state.phase = PHASES.REVEAL;
    this.sendState();

    setTimeout(() => {
      this.startRound();
    }, 10000);
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    conn.send(JSON.stringify({ type: "connected", roomId: this.room.id }));
    this.sendState();
  }

  onClose(conn: Party.Connection) {
    if (this.state.players[conn.id]) {
      delete this.state.players[conn.id];
      this.sendState();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "join": {
          const name = (data.name || "Player").slice(0, 20);
          this.state.players[sender.id] = {
            id: sender.id,
            name,
            score: 0,
          };
          if (!this.state.hostId) {
            this.state.hostId = sender.id;
          }
          this.sendState();
          break;
        }

        case "start": {
          if (
            sender.id === this.state.hostId &&
            this.state.phase === PHASES.LOBBY &&
            Object.keys(this.state.players).length >= 2
          ) {
            this.startRound();
          }
          break;
        }

        case "answer": {
          if (
            this.state.phase === PHASES.WRITING &&
            this.state.players[sender.id] &&
            !this.state.answers[sender.id]
          ) {
            this.state.answers[sender.id] = (data.answer || "").slice(0, 100);
            this.sendState();
          }
          break;
        }

        case "vote": {
          if (
            this.state.phase === PHASES.VOTING &&
            this.state.players[sender.id] &&
            !this.state.votes[sender.id] &&
            data.votedFor !== sender.id &&
            this.state.answers[data.votedFor]
          ) {
            this.state.votes[sender.id] = data.votedFor;
            this.sendState();
          }
          break;
        }

        case "restart": {
          if (
            sender.id === this.state.hostId &&
            this.state.phase === PHASES.FINAL
          ) {
            this.clearTimer();
            // Keep players but reset scores
            Object.values(this.state.players).forEach((p) => (p.score = 0));
            this.state.round = 0;
            this.state.phase = PHASES.LOBBY;
            this.state.promptIndices = this.shufflePrompts();
            this.state.answers = {};
            this.state.votes = {};
            this.sendState();
          }
          break;
        }
      }
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  }
}
