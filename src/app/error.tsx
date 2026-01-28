"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console in development
    console.error("Application error:", error);
  }, [error]);

  return (
    <main id="main" className="min-h-screen bg-gradient-to-br from-gradient-from via-gradient-via to-gradient-to flex items-center justify-center p-4">
      <div className="bg-card-bg backdrop-blur rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
        <h1 className="text-4xl font-black bg-gradient-to-r from-purple-800 to-pink-700 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-4">
          Something went wrong!
        </h1>
        <p className="text-card-muted mb-6">
          We encountered an unexpected error. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-card-muted mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl hover:scale-105 transition-transform"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="w-full py-3 bg-btn-secondary text-white font-bold rounded-xl hover:bg-btn-secondary-hover transition-colors inline-block text-center"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
