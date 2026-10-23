import type { ProviderConfig } from '../core/config';
import { createAntigravityProvider } from './antigravity';
import { createOpenAiProvider, testOpenAi, type ProviderTest } from './openai';
import { ProviderError } from './types';
import type { Provider, ProviderKind } from './types';
import { DEFAULT_MODEL } from '../core/constants';

// ============================================================
// JACK-AGENT — Registry provider (PRD § 3.4)
// Satu-satunya tempat yang tahu perbedaan antar-adapter.
// ============================================================

export const PROVIDER_KINDS: ProviderKind[] = ['antigravity', 'openai'];

export function createProvider(config: ProviderConfig): Provider {
  if (config.kind === 'openai') return createOpenAiProvider(config);
  if (config.kind === 'antigravity') return createAntigravityProvider(config);
  throw new ProviderError(`kind provider "${config.kind}" tidak dikenal`, 400);
}

/**
 * Model untuk provider ini: pilihan sesi → default provider → model pertama.
 * Model di luar daftar provider aktif tidak dipakai (I-5).
 */
export function resolveModel(config: ProviderConfig, sessionModel?: string): string {
  const list = config.models ?? [];
  if (sessionModel && (list.length === 0 || list.includes(sessionModel))) return sessionModel;
  if (config.default_model && (list.length === 0 || list.includes(config.default_model))) return config.default_model;
  if (list.length) return list[0];
  return config.kind === 'antigravity' ? DEFAULT_MODEL : '';
}

export async function testProvider(config: ProviderConfig): Promise<ProviderTest> {
  if (config.kind === 'openai') return testOpenAi(config);
  try {
    const models = await createAntigravityProvider(config).listModels();
    return { ok: true, message: `terhubung — ${models.length} model tersedia`, models };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), models: [] };
  }
}

export function providerLabel(config: ProviderConfig): string {
  if (config.kind === 'openai') return `openai-compatible (${config.base_url || 'base_url belum diisi'})`;
  return 'antigravity (login Google)';
}

export function isValidProviderName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

export type { ProviderTest };
