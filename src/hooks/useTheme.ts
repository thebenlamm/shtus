"use client";

import { useState, useEffect } from "react";

type Theme = "light" | "dark";

function getStoredTheme(): Theme | null {
  try {
    return localStorage.getItem("theme") as Theme | null;
  } catch {
    // localStorage unavailable (private browsing, storage blocked)
    return null;
  }
}

function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // localStorage unavailable - silently ignore
  }
}

function getSystemPreference(): Theme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function getInitialTheme(): Theme {
  // First check if inline script already set the class (avoids mismatch)
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  // Then check localStorage
  const stored = getStoredTheme();
  if (stored) return stored;
  // Fall back to system preference
  return getSystemPreference();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Update DOM and localStorage
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    setStoredTheme(theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return { theme, toggleTheme, mounted };
}
