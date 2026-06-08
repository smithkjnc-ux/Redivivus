// [SCOPE] Worker AI token limits — documented maximums per provider for reference.
// These are the max_tokens/maxOutputTokens values used in provider API calls.
// Worker role uses these to generate complete output for large files.
// Note: These are provider-level limits, not role-level. Supervisor/Guardian use same providers.

export const WORKER_TOKEN_LIMITS = {
  // Anthropic Claude
  // - Sonnet 4.6: 64000 output tokens (current model for ultra/pro)
  // - Haiku 4.5: 8000 output tokens (current model for flash/Worker)
  // - Opus 4.8: 32000 output tokens
  claude: 64000,

  // Google Gemini
  // - 2.5 Flash: 65536 output tokens (64K)
  // - 2.5 Pro: 65536 output tokens (64K)
  gemini: 65536,

  // OpenAI
  // - GPT-4o: 16384 output tokens (16K)
  // - GPT-4o-mini: 16384 output tokens (16K)
  // - o3: 100000 output tokens (100K) — if used
  // - o4-mini: 100000 output tokens (100K) — if used
  openai: 16384,

  // Groq (Llama)
  // - llama-3.3-70b: 8192 output tokens (8K)
  // - llama-3.1-8b: 8192 output tokens (8K)
  // Groq API hard-limits to 8000 for consistency
  groq: 8000,

  // xAI (Grok)
  // - Grok-3: 32768 output tokens (32K)
  // - Grok-3-mini: 32768 output tokens (32K)
  xai: 32000,

  // Kimi (Moonshot)
  // - moonshot-v1-128k: 16384 output tokens (16K)
  // - moonshot-v1-32k: 8192 output tokens (8K)
  kimi: 16000,
} as const;

// Provider-specific streaming limits (mirror of above for streamingProviders.ts)
export const STREAMING_TOKEN_LIMITS = WORKER_TOKEN_LIMITS;

// Context window sizes (in thousands of tokens) for reference
// Used to estimate if a file + prompt will fit in context
export const CONTEXT_WINDOW_SIZES = {
  claude: 200,    // 200K context
  gemini: 1000,   // 1M context
  openai: 128,    // 128K context (GPT-4o), 200K for o3/o4
  groq: 128,      // 128K for 8B, 32K for 70B
  xai: 131,       // 131K context
  kimi: 128,      // 128K for v1-128k, 32K for v1-32k
} as const;
