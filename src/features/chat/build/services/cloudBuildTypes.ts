// [SCOPE] Shared type definitions for the cloud build pipeline.
// Extracted from cloudBuildClient.ts (Rule 9 split) to break the circular import between client and processor.

export interface CloudBuildResult {
  success: boolean
  files?: Array<{ path: string; content: string; isNew: boolean }>
  narration?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  error?: string
  captureCount?: number   // vault items saved after this build
  failureSource?: 'cloud' | 'local-fallback'
  // Two-phase attribution — lets the byline/dashboard show the Supervisor (e.g. Claude) truthfully.
  supervisorRan?: boolean
  supervisorModel?: string
  supervisorProvider?: string
  supervisorInputTokens?: number
  supervisorOutputTokens?: number
  supervisorError?: string
  workerProvider?: string
  // Smart model-switching: why this model was chosen (strategy + difficulty + tier).
  modelRationale?: string
  modelStrategy?: string
  modelTier?: string
}
