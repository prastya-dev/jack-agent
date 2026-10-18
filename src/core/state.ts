import { JackConfig } from './config';

// ── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  commandToExecute?: string;
}

export interface JackState {
  currentDir: string;
  activeMode: 'chat' | 'exec' | 'quiz';
  selectedModel: string;
  history: ChatMessage[];
  isStreaming: boolean;
  config: JackConfig | null;
}

type StateListener = (state: Readonly<JackState>) => void;

// ── State Manager ──────────────────────────────────────────

class StateManager {
  private state: JackState = {
    currentDir: process.cwd(),
    activeMode: 'chat',
    selectedModel: 'antigravity-gemini-3-pro',
    history: [],
    isStreaming: false,
    config: null,
  };

  private listeners: StateListener[] = [];

  /** Return a shallow copy of the current state */
  get(): Readonly<JackState> {
    return { ...this.state, history: [...this.state.history] };
  }

  /** Merge a partial update into state and notify listeners */
  update(partial: Partial<JackState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /** Append a chat message to history, respecting max_history_length */
  addMessage(message: ChatMessage): void {
    const maxLen = this.state.config?.settings.max_history_length ?? 50;
    const history = [...this.state.history, message];
    this.state.history = history.length > maxLen
      ? history.slice(history.length - maxLen)
      : history;
    this.notify();
  }

  /** Clear the chat history (reset session) */
  clearHistory(): void {
    this.state.history = [];
    this.notify();
  }

  /** Toggle between chat and exec modes */
  toggleMode(): void {
    this.state.activeMode = this.state.activeMode === 'chat' ? 'exec' : 'chat';
    this.notify();
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

// Singleton instance shared across the application
export const stateManager = new StateManager();
