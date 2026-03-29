import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { normalizeMemberCheckinCodeInput } from '../../lib/memberCheckinCode';
import { loadSession, type PescaSession } from '../../lib/session';
import { supabase, supabaseConfigured } from '../../lib/supabase';

type PresentRow = {
  member_profile_id: string;
  display_name: string | null;
  checkin_code: string | null;
  since: string;
};

export function AdminPresencePage() {
  const [session] = useState<PescaSession | null>(() => loadSession());
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [present, setPresent] = useState<PresentRow[]>([]);

  const refreshList = useCallback(async (s: PescaSession) => {
    if (!supabaseConfigured) return;
    const { data, error } = await supabase.rpc('marco3_staff_presence_list', {
      p_staff_profile_id: s.profile_id,
      p_staff_device_id: s.device_id,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; present?: unknown; error?: string };
    if (!o.ok) {
      setErr(o.error === 'module_disabled' ? 'Módulo presença desligado para esta organização.' : String(o.error));
      setPresent([]);
      return;
    }
    const raw = Array.isArray(o.present) ? o.present : [];
    setPresent(
      raw.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          member_profile_id: String(r.member_profile_id),
          display_name: r.display_name == null ? null : String(r.display_name),
          checkin_code: r.checkin_code == null ? null : String(r.checkin_code),
          since: String(r.since),
        };
      }),
    );
    setErr(null);
  }, []);

  useEffect(() => {
    if (session) void refreshList(session);
  }, [session, refreshList]);

  async function register(ev: 'in' | 'out') {
    if (!session || !supabaseConfigured) return;
    setMsg(null);
    setErr(null);
    setLoading(true);
    const normalized = normalizeMemberCheckinCodeInput(code);
    const { data, error } = await supabase.rpc('marco3_staff_register_presence', {
      p_staff_profile_id: session.profile_id,
      p_staff_device_id: session.device_id,
      p_member_code: normalized,
      p_event: ev,
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; error?: string };
    if (!o.ok) {
      const map: Record<string, string> = {
        member_not_found: 'Código não encontrado ou não é sócio.',
        invalid_code: 'Indique o código do sócio.',
        module_disabled: 'Módulo presença desligado.',
        forbidden: 'Sem permissão de staff.',
      };
      setErr(map[String(o.error)] ?? String(o.error));
      return;
    }
    setMsg(ev === 'in' ? 'Entrada registada.' : 'Saída registada.');
    setCode('');
    await refreshList(session);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  if (!session) return null;

  return (
    <div>
      <h2 className="muted" style={{ fontSize: '1.1rem', marginTop: 0 }}>
        Batida portaria (código da carteirinha)
      </h2>
      {!supabaseConfigured ? <p className="err">Configure Supabase no .env.</p> : null}
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="member-code">Código do sócio</label>
        <input
          id="member-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="off"
          style={{ width: '100%', padding: '0.5rem', marginTop: '0.35rem', fontFamily: 'monospace', letterSpacing: '0.08em' }}
          placeholder="Ex.: A1B2C3"
        />
        <p style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" disabled={loading} onClick={() => void register('in')}>
            Entrada
          </button>
          <button type="button" disabled={loading} onClick={() => void register('out')}>
            Saída
          </button>
        </p>
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Presentes agora</h3>
        {present.length === 0 ? (
          <p className="muted">Ninguém com última batida = entrada.</p>
        ) : (
          <ul className="comment-list">
            {present.map((p) => (
              <li key={p.member_profile_id}>
                <strong>{p.display_name ?? p.member_profile_id.slice(0, 8)}</strong>
                {p.checkin_code ? (
                  <span className="muted">
                    {' '}
                    · código {p.checkin_code}
                  </span>
                ) : null}
                <span className="muted"> · desde {new Date(p.since).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
