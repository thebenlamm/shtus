"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Global error boundary catches errors in the root layout.
// Note: Cannot use Next.js components (Link, etc.) here as this renders outside the app context.
/* eslint-disable @next/next/no-html-link-for-pages */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "linear-gradient(135deg, #9333ea, #ec4899, #f97316)",
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              borderRadius: "1.5rem",
              padding: "2rem",
              maxWidth: "28rem",
              width: "100%",
              textAlign: "center",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            }}
          >
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: 900,
                marginBottom: "1rem",
                background: "linear-gradient(to right, #9333ea, #ec4899)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Something went wrong!
            </h1>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              A critical error occurred. Please try refreshing the page.
            </p>
            {error.digest && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#9ca3af",
                  marginBottom: "1rem",
                  fontFamily: "monospace",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                onClick={reset}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "linear-gradient(to right, #9333ea, #ec4899)",
                  color: "white",
                  fontWeight: "bold",
                  borderRadius: "0.75rem",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "#1f2937",
                  color: "white",
                  fontWeight: "bold",
                  borderRadius: "0.75rem",
                  textDecoration: "none",
                  display: "block",
                  boxSizing: "border-box",
                  fontSize: "1rem",
                }}
              >
                Go to Home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
