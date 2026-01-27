import type * as Party from "partykit/server";

// Hardcoded quality prompts - mixed in with AI-generated ones
// {name} will be replaced with a random player's name
const HARDCODED_PROMPTS = [
  // Personalized questions
  "What's {name}'s go-to excuse for leaving a family event early?",
  "If {name} wrote a tell-all memoir, what would the title be?",
  "What would {name}'s playa name be at Burning Man?",
  "What does {name} see when they close their eyes on mushrooms?",
  "If {name} founded a cult, what would be the worst sin a follower could commit?",
  "If {name} were a strain of cannabis, what would they be called?",
  "What prompt does {name} secretly type into ChatGPT at 3 AM?",
  "If {name} could replace one of the Ten Commandments, what would the new rule be?",
  "What's {name}'s most embarrassing guilty pleasure?",
  "If {name} was arrested, what would it probably be for?",
  "What would {name}'s autobiography be titled?",
  "Describe {name}'s secret dance move in three words",
  "What's the warning label {name} should come with?",
  "What's {name}'s villain origin story?",
  "What hill would {name} die on that makes no sense?",
  "What's {name}'s most unhinged 3am thought?",
  "If {name} had a hidden talent, what would it be?",
  "What's {name}'s dating profile written by their ex?",
  "What would {name} do with 24 hours of invisibility?",
  "What's the thing {name} pretends to understand but doesn't?",

  // Generic absurd
  "The worst thing to say on a first date",
  "A terrible name for a band",
  "What your dog is actually thinking",
  "The real reason dinosaurs went extinct",
  "A rejected slogan for McDonald's",
  "The worst superpower to have",
  "What your browser history would reveal about you",
  "A bad excuse for being late to work",
  "What cats are secretly plotting",
  "The worst advice you could give a tourist",
  "If aliens landed, what human activity would confuse them most",
  "The worst name for a children's book",
  "What your Uber driver is thinking but won't say",
  "A secret you'd only tell your houseplant",
  "The fortune cookie message you need to hear",
  "The crime you'd commit if it was legal for a day",
];

async function generatePrompts(theme: string, playerNames: string[], apiKey: string): Promise<string[]> {
  try {
    const namesForPrompt = playerNames.length > 0
      ? playerNames.join(", ")
      : "Alex, Jordan, Sam, Riley";

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4-fast-non-reasoning",
        messages: [
          {
            role: "system",
            content: `You are a witty party game prompt generator for a Psych!-style game, where players craft hilarious fake answers to fool their friends, then vote on favorites.

Given a theme and player names, generate 10 short prompts (under 12 words each) that are funny, edgy, and absurdly clever—slightly inappropriate but never offensive or mean-spirited. Avoid sensitive topics like politics, religion, or trauma.

Key rules:
- Make prompts open-ended for creative, deceptive answers, but specific enough to inspire ideas
- Use actual player names from the game to personalize prompts (rotate through them)
- Balance clever wordplay with absurd hypotheticals
- Tie prompts loosely to the theme for cohesion, but keep them fun and group-friendly
- Vary structures: Use hypotheticals ("If Alex..."), descriptions ("Describe Jordan as..."), titles ("What would Sam's... be called?"), guilty pleasures, secrets, or one-word challenges

Examples:
- "What is Alex's most embarrassing guilty pleasure?"
- "If Jordan was arrested, what would it probably be for?"
- "Describe Sam's secret dance move in three words"
- "What would Riley's autobiography be titled?"`,
          },
          {
            role: "user",
            content: `Theme: "${theme}"
Player names: ${namesForPrompt}

Generate 10 unique prompts using these player names. Return ONLY a JSON array of strings, no other text.`,
          },
        ],
        temperature: 1.0,
      }),
    });

    if (!response.ok) {
      console.error("xAI API error:", response.status);
      const hardcodedWithNames = replaceNamesInPrompts(HARDCODED_PROMPTS, playerNames);
      return shuffleArray(hardcodedWithNames).slice(0, 10);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const aiPrompts = JSON.parse(jsonMatch[0]);
      if (Array.isArray(aiPrompts) && aiPrompts.length >= 3) {
        // Mix AI prompts with hardcoded ones: 6 AI + 4 hardcoded
        const hardcodedWithNames = replaceNamesInPrompts(HARDCODED_PROMPTS, playerNames);
        const shuffledHardcoded = shuffleArray(hardcodedWithNames);
        const mixed = [
          ...aiPrompts.slice(0, 6),
          ...shuffledHardcoded.slice(0, 4),
        ];
        return shuffleArray(mixed);
      }
    }

    const hardcodedWithNames = replaceNamesInPrompts(HARDCODED_PROMPTS, playerNames);
    return shuffleArray(hardcodedWithNames).slice(0, 10);
  } catch (error) {
    console.error("Error generating prompts:", error);
    const hardcodedWithNames = replaceNamesInPrompts(HARDCODED_PROMPTS, playerNames);
    return shuffleArray(hardcodedWithNames).slice(0, 10);
  }
}

function replaceNamesInPrompts(prompts: string[], playerNames: string[]): string[] {
  const names = playerNames.length > 0 ? playerNames : ["someone"];
  return prompts.map(prompt => {
    if (prompt.includes("{name}")) {
      const randomName = names[Math.floor(Math.random() * names.length)];
      return prompt.replace(/\{name\}/g, randomName);
    }
    return prompt;
  });
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

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
  prompts: string[];
  theme: string;
  answers: Record<string, string>;
  votes: Record<string, string>;
  isGenerating: boolean;
}

export default class PsychServer implements Party.Server {
  state: GameState;

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
      prompts: [],
      theme: "",
      answers: {},
      votes: {},
      isGenerating: false,
    };
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
      theme: this.state.theme,
      isGenerating: this.state.isGenerating,
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
      submittedPlayerIds: Object.keys(this.state.answers),
      votedPlayerIds: Object.keys(this.state.votes),
    };
    this.broadcast(publicState);
  }

  
  startRound() {
    if (this.state.round >= 5 || this.state.round >= this.state.prompts.length) {
      this.state.phase = PHASES.FINAL;
      this.sendState();
      return;
    }

    this.state.round++;
    this.state.answers = {};
    this.state.votes = {};
    this.state.phase = PHASES.WRITING;
    this.state.currentPrompt = this.state.prompts[this.state.round - 1];
    this.sendState();
  }

  endWriting() {
    this.state.phase = PHASES.VOTING;
    this.sendState();
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
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    conn.send(JSON.stringify({ type: "connected", roomId: this.room.id }));
    this.sendState();
  }

  onClose(conn: Party.Connection) {
    if (this.state.players[conn.id]) {
      const wasHost = this.state.hostId === conn.id;
      delete this.state.players[conn.id];

      // Transfer host to another player if the host left
      if (wasHost) {
        const remainingPlayerIds = Object.keys(this.state.players);
        this.state.hostId = remainingPlayerIds.length > 0 ? remainingPlayerIds[0] : null;
      }

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
          // Become host if no host, or if current hostId points to non-existent player
          if (!this.state.hostId || !this.state.players[this.state.hostId]) {
            this.state.hostId = sender.id;
          }
          this.sendState();
          break;
        }

        case "start": {
          if (
            sender.id === this.state.hostId &&
            this.state.phase === PHASES.LOBBY &&
            Object.keys(this.state.players).length >= 2 &&
            !this.state.isGenerating
          ) {
            const theme = (data.theme || "random funny questions").slice(0, 100);
            this.state.theme = theme;
            this.state.isGenerating = true;
            this.sendState();

            // Generate prompts asynchronously
            const apiKey = process.env.XAI_API_KEY || "";
            const playerNames = Object.values(this.state.players).map(p => p.name);
            generatePrompts(theme, playerNames, apiKey).then((prompts) => {
              this.state.prompts = shuffleArray(prompts).slice(0, 5);
              this.state.isGenerating = false;
              this.startRound();
            });
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

        case "end-writing": {
          if (sender.id === this.state.hostId && this.state.phase === PHASES.WRITING) {
            this.endWriting();
          }
          break;
        }

        case "end-voting": {
          if (sender.id === this.state.hostId && this.state.phase === PHASES.VOTING) {
            this.endVoting();
          }
          break;
        }

        case "next-round": {
          if (sender.id === this.state.hostId && this.state.phase === PHASES.REVEAL) {
            this.startRound();
          }
          break;
        }

        case "restart": {
          if (
            sender.id === this.state.hostId &&
            this.state.phase === PHASES.FINAL
          ) {
            // Keep players but reset scores
            Object.values(this.state.players).forEach((p) => (p.score = 0));
            this.state.round = 0;
            this.state.phase = PHASES.LOBBY;
            this.state.prompts = [];
            this.state.theme = "";
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
