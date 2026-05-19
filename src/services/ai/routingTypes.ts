// [SCOPE] Routing service types — AIResponse interface
// Shared by routingService and all routing submodules. No logic here.

export interface AIResponse {
  text: string;
  model: string;
  success: boolean;
  error?: string;
  /** Actual tokens sent to the AI (prompt/input) — parsed from API response, not estimated */
  inputTokens?: number;
  /** Actual tokens received from the AI (completion/output) — parsed from API response, not estimated */
  outputTokens?: number;
}
