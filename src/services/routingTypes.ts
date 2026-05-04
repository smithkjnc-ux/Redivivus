// [SCOPE] Routing service types — AIResponse interface
// Shared by routingService and all routing submodules. No logic here.

export interface AIResponse {
  text: string;
  model: string;
  success: boolean;
  error?: string;
}
