"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

// Validate stored theme value
function isValidTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem("theme");
    // Validate stored value to prevent invalid state
    return isValidTheme(stored) ? stored : null;
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
  // Then check localStorage with validation
  const stored = getStoredTheme();
  if (stored) return stored;
  // Fall back to system preference
  return getSystemPreference();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  // Apply theme to DOM
  const applyTheme = useCallback((newTheme: Theme) => {
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Update DOM and localStorage
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme, mounted, applyTheme]);

  // Listen for system preference changes
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't explicitly set a theme
      const stored = getStoredTheme();
      if (!stored) {
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mounted]);

  // Listen for storage changes from other tabs
  useEffect(() => {
    if (!mounted) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "theme" && isValidTheme(e.newValue)) {
        setTheme(e.newValue);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return { theme, toggleTheme, mounted };
}
