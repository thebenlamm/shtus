"use client";

import { useState, useEffect, useRef } from "react";

export const MOBILE_BREAKPOINT = 1024; // matches Tailwind's lg breakpoint

// Get initial value safely - default to false during SSR to avoid hydration mismatch
// The actual value is corrected on mount
export const getInitialIsMobile = () => {
  if (typeof window === "undefined") return false; // Safe SSR default
  return window.innerWidth < MOBILE_BREAKPOINT;
};

export function useIsMobile() {
  // Start with false to match SSR; will correct after mount
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    // Sync on mount to get actual value
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync with actual window size on mount
    setMounted(true);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    // Throttled resize handler using requestAnimationFrame
    const handleResize = () => {
      // Cancel any pending frame
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }

      // Schedule update for next frame
      rafId.current = requestAnimationFrame(() => {
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
        rafId.current = null;
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      // Cleanup any pending animation frame
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  // Return false until mounted to avoid hydration mismatch
  return mounted ? isMobile : false;
}
