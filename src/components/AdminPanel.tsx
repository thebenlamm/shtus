"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface AdminPanelProps {
  exactQuestion: string | null;
  promptGuidance: string | null;
  onSetOverride: (data: {
    exactQuestion?: string | null;
    promptGuidance?: string | null;
  }) => void;
}

// Throttle duration in ms
const THROTTLE_MS = 1000;
// Confirmation timeout in ms
const CONFIRM_TIMEOUT_MS = 3000;

export default function AdminPanel({
  exactQuestion,
  promptGuidance,
  onSetOverride,
}: AdminPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Local input values - these are the values being typed
  const [inputExactQuestion, setInputExactQuestion] = useState("");
  const [inputPromptGuidance, setInputPromptGuidance] = useState("");

  // Confirmation state for destructive actions
  const [confirmingClearQuestion, setConfirmingClearQuestion] = useState(false);
  const [confirmingClearGuidance, setConfirmingClearGuidance] = useState(false);

  // Throttle tracking
  const lastActionTime = useRef<number>(0);
  const [isThrottled, setIsThrottled] = useState(false);

  // Timer refs for cleanup
  const confirmQuestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmGuidanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (confirmQuestionTimerRef.current) clearTimeout(confirmQuestionTimerRef.current);
      if (confirmGuidanceTimerRef.current) clearTimeout(confirmGuidanceTimerRef.current);
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, []);

  // Throttled action wrapper
  const throttledAction = useCallback((action: () => void) => {
    const now = Date.now();
    if (now - lastActionTime.current < THROTTLE_MS) {
      setIsThrottled(true);
      // Clear any existing throttle timer
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = setTimeout(() => {
        setIsThrottled(false);
        throttleTimerRef.current = null;
      }, THROTTLE_MS - (now - lastActionTime.current));
      return;
    }
    lastActionTime.current = now;
    action();
  }, []);

  const handleQueueQuestion = () => {
    throttledAction(() => {
      const trimmed = inputExactQuestion.trim();
      if (trimmed.length > 0 && trimmed.length <= 500) {
        onSetOverride({ exactQuestion: trimmed });
        setInputExactQuestion(""); // Clear input after submitting
      }
    });
  };

  const handleClearQuestion = () => {
    if (!confirmingClearQuestion) {
      setConfirmingClearQuestion(true);
      // Clear any existing timer
      if (confirmQuestionTimerRef.current) clearTimeout(confirmQuestionTimerRef.current);
      // Auto-reset confirmation after timeout
      confirmQuestionTimerRef.current = setTimeout(() => {
        setConfirmingClearQuestion(false);
        confirmQuestionTimerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    // Confirmed - execute clear
    throttledAction(() => {
      setInputExactQuestion("");
      onSetOverride({ exactQuestion: null });
      setConfirmingClearQuestion(false);
      // Clear timer since we're done
      if (confirmQuestionTimerRef.current) {
        clearTimeout(confirmQuestionTimerRef.current);
        confirmQuestionTimerRef.current = null;
      }
    });
  };

  const handleApplyGuidance = () => {
    throttledAction(() => {
      const trimmed = inputPromptGuidance.trim();
      if (trimmed.length > 0) {
        onSetOverride({ promptGuidance: trimmed });
        setInputPromptGuidance(""); // Clear input after submitting
      }
    });
  };

  const handleClearGuidance = () => {
    if (!confirmingClearGuidance) {
      setConfirmingClearGuidance(true);
      // Clear any existing timer
      if (confirmGuidanceTimerRef.current) clearTimeout(confirmGuidanceTimerRef.current);
      // Auto-reset confirmation after timeout
      confirmGuidanceTimerRef.current = setTimeout(() => {
        setConfirmingClearGuidance(false);
        confirmGuidanceTimerRef.current = null;
      }, CONFIRM_TIMEOUT_MS);
      return;
    }
    // Confirmed - execute clear
    throttledAction(() => {
      setInputPromptGuidance("");
      onSetOverride({ promptGuidance: null });
      setConfirmingClearGuidance(false);
      // Clear timer since we're done
      if (confirmGuidanceTimerRef.current) {
        clearTimeout(confirmGuidanceTimerRef.current);
        confirmGuidanceTimerRef.current = null;
      }
    });
  };

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed left-4 top-4 z-50 bg-purple-600 text-white px-4 py-2 rounded-full font-bold shadow-lg hover:bg-purple-700 transition-colors"
        aria-label="Expand admin controls"
      >
        Admin
      </button>
    );
  }

  return (
    <div className="bg-card-bg backdrop-blur rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-card-border flex justify-between items-center">
        <h3 className="font-bold text-card-text">Admin Controls</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-card-muted hover:text-card-text transition-colors"
          aria-label="Collapse admin panel"
        >
          -
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Throttle warning */}
        {isThrottled && (
          <p className="text-yellow-600 text-xs text-center">Please wait before trying again...</p>
        )}

        {/* Next Question Section */}
        <div>
          <label htmlFor="exact-question" className="block text-sm font-medium text-label-text mb-2">
            NEXT QUESTION
          </label>
          <textarea
            id="exact-question"
            value={inputExactQuestion}
            onChange={(e) => setInputExactQuestion(e.target.value.slice(0, 500))}
            placeholder="Type exact question to use next round..."
            className="w-full p-3 rounded-lg border border-input-border bg-input-bg text-card-text text-sm resize-none h-20 focus:border-purple-500 focus:outline-none"
            maxLength={500}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-card-muted">{inputExactQuestion.length}/500</span>
            <div className="flex gap-2">
              <button
                onClick={handleClearQuestion}
                disabled={(!exactQuestion && !inputExactQuestion) || isThrottled}
                className={`px-3 py-1 text-sm rounded-lg disabled:opacity-50 transition-colors ${
                  confirmingClearQuestion
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-card-border text-card-muted hover:bg-btn-inactive-hover"
                }`}
              >
                {confirmingClearQuestion ? "Confirm Clear" : "Clear"}
              </button>
              <button
                onClick={handleQueueQuestion}
                disabled={!inputExactQuestion.trim() || isThrottled}
                className="px-3 py-1 text-sm bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors"
              >
                Queue
              </button>
            </div>
          </div>
        </div>

        {/* AI Guidance Section */}
        <div>
          <label htmlFor="prompt-guidance" className="block text-sm font-medium text-label-text mb-2">
            AI GUIDANCE
          </label>
          <textarea
            id="prompt-guidance"
            value={inputPromptGuidance}
            onChange={(e) => setInputPromptGuidance(e.target.value.slice(0, 500))}
            placeholder='Guide the AI... e.g. "roast Dave about his terrible dancing"'
            className="w-full p-3 rounded-lg border border-input-border bg-input-bg text-card-text text-sm resize-none h-20 focus:border-purple-500 focus:outline-none"
            maxLength={500}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-card-muted">{inputPromptGuidance.length}/500</span>
            <div className="flex gap-2">
              <button
                onClick={handleClearGuidance}
                disabled={(!promptGuidance && !inputPromptGuidance) || isThrottled}
                className={`px-3 py-1 text-sm rounded-lg disabled:opacity-50 transition-colors ${
                  confirmingClearGuidance
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-card-border text-card-muted hover:bg-btn-inactive-hover"
                }`}
              >
                {confirmingClearGuidance ? "Confirm Clear" : "Clear"}
              </button>
              <button
                onClick={handleApplyGuidance}
                disabled={!inputPromptGuidance.trim() || isThrottled}
                className="px-3 py-1 text-sm bg-purple-600 text-white rounded-lg disabled:opacity-50 hover:bg-purple-700 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Status Section */}
        <div className="border-t border-card-border pt-4">
          <p className="text-sm font-medium text-label-text mb-2">STATUS</p>
          <div className="space-y-1 text-sm">
            {exactQuestion ? (
              <p className="text-green-600">
                Question queued: &quot;{exactQuestion.slice(0, 40)}{exactQuestion.length > 40 ? "..." : ""}&quot;
              </p>
            ) : (
              <p className="text-card-muted">No question queued</p>
            )}
            {promptGuidance ? (
              <p className="text-green-600">
                Guidance active: &quot;{promptGuidance.slice(0, 40)}{promptGuidance.length > 40 ? "..." : ""}&quot;
              </p>
            ) : (
              <p className="text-card-muted">No guidance active</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
