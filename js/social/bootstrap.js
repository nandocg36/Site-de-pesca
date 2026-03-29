/**
 * Entrada da camada social. Por defeito usa backend em memória + localStorage.
 * Quando Firebase ou Supabase estiver pronto, altere SOCIAL_BACKEND e implemente o adaptador.
 */
import { createMockBackend } from './adapters/mockBackend.js';
import { createFirebaseAdapter } from './adapters/firebaseAdapter.js';
import { createSupabaseAdapter } from './adapters/supabaseAdapter.js';
import { mountSocialApp } from './socialShell.js';

/** @typedef {'mock' | 'firebase' | 'supabase'} SocialBackendKind */

/** @type {SocialBackendKind} */
const SOCIAL_BACKEND = 'mock';

function pickBackend() {
  if (SOCIAL_BACKEND === 'firebase') return createFirebaseAdapter();
  if (SOCIAL_BACKEND === 'supabase') return createSupabaseAdapter();
  return createMockBackend();
}

export function initSocialApp() {
  const root = document.getElementById('socialAppRoot');
  if (!root) return;
  const backend = pickBackend();
  mountSocialApp(root, { backend });
}
