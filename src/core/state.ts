// ============================================================
// JACK-AGENT — State sesi (in-memory, satu mode: agentik)
// ============================================================

import type { ToolCall } from '../providers/types';

export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** id tool call asal, dipakai adapter yang butuh `tool_call_id` */
  toolCallId?: string;
  /** tool call yang diminta pesan asisten ini */
  toolCalls?: ToolCall[];
}

export interface JackState {
  /** cwd kerja (diubah /cd) */
  currentDir: string;
  /** nama provider aktif (flag CLI menimpa untuk sesi ini) */
  provider: string;
  /** model aktif untuk provider itu */
  model: string;
  history: SessionMessage[];
  /** jumlah tool call di tugas berjalan */
  steps: number;
  /** nama skill yang isinya sudah dimuat di sesi ini */
  skillLoaded: string[];
}

const state: JackState = {
  currentDir: process.cwd(),
  provider: 'antigravity',
  model: '',
  history: [],
  steps: 0,
  skillLoaded: [],
};

export function getState(): JackState {
  return state;
}

export function updateState(partial: Partial<JackState>): void {
  Object.assign(state, partial);
}

export function addMessage(message: SessionMessage, maxHistoryLength = 50): void {
  state.history.push(message);
  while (state.history.length > maxHistoryLength) state.history.shift();
}

export function clearHistory(): void {
  state.history = [];
}

export function replaceHistory(messages: SessionMessage[]): void {
  state.history = messages;
}
