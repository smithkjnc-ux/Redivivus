// [SCOPE] Build Events — typed event emitter for the build lifecycle.
// Replaces mutable static callbacks on ChatPanel (ChatPanel.onBuildFinished = fn)
// with a proper pub/sub system where each listener registers independently.
//
// Why this matters:
//   Old pattern:  ChatPanel.onBuildFinished = fn   → one file overwrites another's callback.
//                 extensionInlineCommands.ts chains it manually with _prevOnBuildFinished.
//                 If any chaining file runs AFTER session.ts, the session listener is lost.
//   New pattern:  buildEvents.on('build:finished', fn) → each listener is independent.
//                 Adding a new listener never affects existing ones.
//                 Removing one never affects others.

type BuildFinishedListener = (task: string, files: string[], buildRoot?: string) => Promise<void> | void;
type BuildStartedListener  = (task: string, buildRoot: string) => void;

interface BuildEventMap {
  'build:finished': BuildFinishedListener;
  'build:started':  BuildStartedListener;
}

class BuildEventEmitter {
  private readonly listeners: { [K in keyof BuildEventMap]?: BuildEventMap[K][] } = {};

  on<K extends keyof BuildEventMap>(event: K, listener: BuildEventMap[K]): () => void {
    if (!this.listeners[event]) { this.listeners[event] = []; }
    (this.listeners[event] as BuildEventMap[K][]).push(listener);
    // Returns an unsubscribe function
    return () => this.off(event, listener);
  }

  off<K extends keyof BuildEventMap>(event: K, listener: BuildEventMap[K]): void {
    const arr = this.listeners[event] as BuildEventMap[K][] | undefined;
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  }

  async emit(event: 'build:finished', task: string, files: string[], buildRoot?: string): Promise<void>;
  emit(event: 'build:started', task: string, buildRoot: string): void;
  async emit(event: keyof BuildEventMap, ...args: unknown[]): Promise<void> {
    const arr = this.listeners[event] as ((...a: unknown[]) => unknown)[] | undefined;
    if (!arr || arr.length === 0) return;
    for (const fn of [...arr]) {
      try { await fn(...args); } catch (e) { console.error(`[buildEvents] ${event} listener threw:`, e); }
    }
  }
}

// Singleton — import this everywhere instead of ChatPanel.onBuildFinished
export const buildEvents = new BuildEventEmitter();
