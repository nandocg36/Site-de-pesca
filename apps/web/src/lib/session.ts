const KEY = 'pesca_session_v1';

export type PescaSession = {
  profile_id: string;
  organization_id: string;
  role_id: string;
  display_name: string | null;
  device_id: string;
};

export function saveSession(s: PescaSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export function loadSession(): PescaSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const p = o as Record<string, unknown>;
    const profile_id = typeof p.profile_id === 'string' ? p.profile_id : '';
    const device_id = typeof p.device_id === 'string' ? p.device_id : '';
    if (!profile_id || !device_id) return null;
    return {
      profile_id,
      device_id,
      organization_id: typeof p.organization_id === 'string' ? p.organization_id : '',
      role_id: typeof p.role_id === 'string' ? p.role_id : '',
      display_name: typeof p.display_name === 'string' ? p.display_name : null,
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isStaffSession(s: PescaSession | null): boolean {
  return s != null && (s.role_id === 'owner' || s.role_id === 'collaborator');
}

export function isMemberSession(s: PescaSession | null): boolean {
  return s != null && s.role_id === 'member';
}
