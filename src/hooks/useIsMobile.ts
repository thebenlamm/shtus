"use client";

import { useState, useEffect } from "react";

export const MOBILE_BREAKPOINT = 1024; // matches Tailwind's lg breakpoint

// Get initial value safely (works during SSR)
export const getInitialIsMobile = () => {
  if (typeof window === "undefined") return true; // Default to mobile during SSR to avoid flash
  return window.innerWidth < MOBILE_BREAKPOINT;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getInitialIsMobile);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    // Sync on mount in case SSR guess was wrong
    checkMobile();

    // Listen for resize
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}
