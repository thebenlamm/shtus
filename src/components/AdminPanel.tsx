"use client";

import { useState } from "react";

interface AdminPanelProps {
  exactQuestion: string | null;
  promptGuidance: string | null;
  onSetOverride: (data: {
    exactQuestion?: string | null;
    promptGuidance?: string | null;
  }) => void;
}

export default function AdminPanel({
  exactQuestion,
  promptGuidance,
  onSetOverride,
}: AdminPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Local input values - these are the values being typed
  const [inputExactQuestion, setInputExactQuestion] = useState("");
  const [inputPromptGuidance, setInputPromptGuidance] = useState("");

  // Display server values or local input if actively editing
  // User types in input fields, clicks Queue/Apply to send to server
  // Server values are shown in the status section

  const handleQueueQuestion = () => {
    const trimmed = inputExactQuestion.trim();
    if (trimmed.length > 0 && trimmed.length <= 500) {
      onSetOverride({ exactQuestion: trimmed });
      setInputExactQuestion(""); // Clear input after submitting
    }
  };

  const handleClearQuestion = () => {
    setInputExactQuestion("");
    onSetOverride({ exactQuestion: null });
  };

  const handleApplyGuidance = () => {
    const trimmed = inputPromptGuidance.trim();
    if (trimmed.length > 0) {
      onSetOverride({ promptGuidance: trimmed });
      setInputPromptGuidance(""); // Clear input after submitting
    }
  };

  const handleClearGuidance = () => {
    setInputPromptGuidance("");
    onSetOverride({ promptGuidance: null });
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
                disabled={!exactQuestion && !inputExactQuestion}
                className="px-3 py-1 text-sm bg-card-border text-card-muted rounded-lg disabled:opacity-50 hover:bg-btn-inactive-hover transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleQueueQuestion}
                disabled={!inputExactQuestion.trim()}
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
                disabled={!promptGuidance && !inputPromptGuidance}
                className="px-3 py-1 text-sm bg-card-border text-card-muted rounded-lg disabled:opacity-50 hover:bg-btn-inactive-hover transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleApplyGuidance}
                disabled={!inputPromptGuidance.trim()}
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
