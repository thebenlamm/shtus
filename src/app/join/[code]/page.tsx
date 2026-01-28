import type { Metadata } from "next";
import Link from "next/link";
import JoinForm from "./JoinForm";

// Room code validation regex
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

// Generate SEO metadata for join links
export async function generateMetadata({ params }: JoinPageProps): Promise<Metadata> {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  return {
    title: `Join Game ${upperCode} - Shtus`,
    description: `Join the Shtus party game! Room code: ${upperCode}`,
    openGraph: {
      title: `Join Shtus Game - ${upperCode}`,
      description: "You've been invited to play Shtus! Enter your name to join the fun.",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `Join Shtus Game - ${upperCode}`,
      description: "You've been invited to play Shtus! Enter your name to join the fun.",
    },
  };
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  // Validate code format
  const isValidCode = ROOM_CODE_REGEX.test(upperCode);

  if (!isValidCode) {
    return (
      <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center p-4">
        <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
          <h1 className="text-4xl font-black bg-gradient-to-r from-purple-800 to-pink-700 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-4">
            Invalid Room Code
          </h1>
          <p className="text-card-muted mb-6">
            The room code <span className="font-mono font-bold text-card-text">{upperCode}</span> is not valid.
            Room codes must be 6 letters or numbers.
          </p>
          <Link
            href="/"
            className="inline-block py-3 px-6 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl hover:scale-105 transition-transform"
          >
            Go to Home
          </Link>
        </div>
      </main>
    );
  }

  return <JoinForm code={upperCode} />;
}
