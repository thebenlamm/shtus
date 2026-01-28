import { vi } from "vitest";

interface MockXaiOptions {
  response?: string;
  delay?: number;
  error?: boolean;
  statusCode?: number;
}

// Setup mock for xAI API calls
export function setupXaiMock(options: MockXaiOptions = {}): void {
  const {
    response = "Mock AI generated prompt about {name}",
    delay = 0,
    error = false,
    statusCode = 200,
  } = options;

  vi.spyOn(global, "fetch").mockImplementation(async (url) => {
    // Only mock xAI API calls
    if (typeof url === "string" && url.includes("api.x.ai")) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (error) {
        throw new Error("Network error");
      }

      if (statusCode !== 200) {
        return new Response("API Error", { status: statusCode });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: response,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pass through other requests
    return fetch(url);
  });
}

// Setup mock that simulates API failure (falls back to hardcoded prompts)
export function setupXaiFailure(): void {
  setupXaiMock({ error: true });
}

// Setup mock that returns specific response after delay
export function setupXaiDelayed(response: string, delayMs: number): void {
  setupXaiMock({ response, delay: delayMs });
}

// Clear all mocks
export function clearXaiMocks(): void {
  vi.restoreAllMocks();
}
