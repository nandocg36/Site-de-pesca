import { type FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getOrCreateDeviceId } from '../lib/deviceId';
import { saveSession } from '../lib/session';
import { supabase, supabaseConfigured } from '../lib/supabase';

type RedeemOk = {
  ok: true;
  profile_id: string;
  organization_id: string;
  role_id: string;
  display_name: string | null;
};

type RedeemErr = { ok: false; error: string };

export function InvitePage() {
  const [params] = useSearchParams();
  const tokenFromUrl = params.get('token') ?? '';
  const [token, setToken] = useState(tokenFromUrl);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemOk | null>(null);

  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setResult(null);
    if (!supabaseConfigured) {
      setStatus('error');
      setMessage('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ficheiro .env (ver .env.example).');
      return;
    }
    const trimmed = token.trim();
    if (trimmed.length < 8) {
      setMessage('Cole o token completo do convite.');
      return;
    }
    setStatus('loading');
    const { data, error } = await supabase.rpc('redeem_invite_token', {
      p_token: trimmed,
      p_device_id: deviceId,
    });
    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }
    const row = data as RedeemOk | RedeemErr;
    if (!row || typeof row !== 'object' || !('ok' in row)) {
      setStatus('error');
      setMessage('Resposta inesperada do servidor.');
      return;
    }
    if (!row.ok) {
      setStatus('error');
      setMessage(`Convite inválido: ${(row as RedeemErr).error}`);
      return;
    }
    setStatus('done');
    const ok = row as RedeemOk;
    setResult(ok);
    saveSession({
      profile_id: ok.profile_id,
      organization_id: ok.organization_id,
      role_id: ok.role_id,
      display_name: ok.display_name,
      device_id: deviceId,
    });
  }

  return (
    <main>
      <h1>Entrar com convite</h1>
      <p className="muted">
        Cole o token do link enviado pela entidade. O dispositivo fica vinculado após o primeiro resgate bem-sucedido
        (Marco 1 — sem JWT de sessão próprio ainda).
      </p>
      <div className="card">
        <form onSubmit={(e) => void onSubmit(e)}>
          <label htmlFor="token">Token</label>
          <div>
            <input
              id="token"
              name="token"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.35rem' }}
            />
          </div>
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            Dev local (após <code>supabase db reset</code>): sócio <code>marco1-dev-token</code>; staff{' '}
            <code>marco3-collab-dev-token</code>
          </p>
          <p style={{ marginTop: '1rem' }}>
            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'A validar…' : 'Validar convite'}
            </button>
          </p>
        </form>
        {message ? <p className={status === 'error' ? 'err' : 'muted'}>{message}</p> : null}
        {result ? (
          <div className="ok" style={{ marginTop: '1rem' }}>
            <p>
              <strong>Sessão local preparada.</strong> Perfil: {result.display_name ?? result.profile_id} (
              {result.role_id})
            </p>
            <p className="muted">IDs: org {result.organization_id}</p>
            <p style={{ marginTop: '0.75rem' }}>
              {result.role_id === 'collaborator' || result.role_id === 'owner' ? (
                <>
                  <Link to="/admin">Abrir staff (Marco 3) →</Link>
                  {' · '}
                </>
              ) : null}
              <Link to="/feed">Abrir feed →</Link>
            </p>
          </div>
        ) : null}
      </div>
      <p>
        <Link to="/instalar-pwa">← Instalar PWA</Link> · <Link to="/">Início</Link> ·{' '}
        <Link to="/feed">Feed</Link>
      </p>
    </main>
  );
}
