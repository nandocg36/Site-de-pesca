import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { isMemberSession, loadSession, type PescaSession } from '../lib/session';
import { supabase, supabaseConfigured } from '../lib/supabase';

export function MemberCheckinCodePage() {
  const [session, setSession] = useState<PescaSession | null>(() => loadSession());
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    setSession(s);
    if (!s || !isMemberSession(s) || !supabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc('marco3_member_ensure_checkin_code', {
        p_profile_id: s.profile_id,
        p_device_id: s.device_id,
      });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setErr(error.message);
        return;
      }
      const o = data as { ok?: boolean; checkin_code?: string; error?: string };
      if (!o.ok) {
        const map: Record<string, string> = {
          module_disabled: 'A entidade ainda não ativou o código de presença.',
          only_members: 'Apenas perfil de sócio.',
          unauthorized: 'Sessão inválida.',
        };
        setErr(map[String(o.error)] ?? String(o.error));
        return;
      }
      setCode(o.checkin_code ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!code) {
      setQrDataUrl(null);
      setQrErr(null);
      return;
    }
    let cancelled = false;
    setQrErr(null);
    void QRCode.toDataURL(code, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrErr('Não foi possível gerar o QR. Usa o código em texto.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!session) {
    return (
      <main className="feed-main">
        <p className="muted">Inicia sessão com o convite.</p>
        <Link to="/convite">Convite</Link>
      </main>
    );
  }

  if (!isMemberSession(session)) {
    return <Navigate to="/feed" replace />;
  }

  return (
    <main className="feed-main">
      <h1>Código de presença</h1>
      <p className="muted">Mostra na portaria para registar entrada ou saída (Marco 3).</p>
      {!supabaseConfigured ? <p className="err">Configure Supabase no .env.</p> : null}
      {loading ? <p className="muted">A carregar…</p> : null}
      {err ? <p className="err">{err}</p> : null}
      {code && !err ? (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Mostra na portaria — o QR tem o mesmo código que o texto (para leitores).
          </p>
          {qrDataUrl ? (
            <div className="member-checkin-qr">
              <img src={qrDataUrl} width={240} height={240} alt="" decoding="async" />
            </div>
          ) : qrErr ? (
            <p className="err" style={{ margin: '0.5rem 0' }}>
              {qrErr}
            </p>
          ) : (
            <p className="muted" style={{ margin: '0.75rem 0' }}>
              A gerar QR…
            </p>
          )}
          <p className="muted" style={{ marginBottom: '0.35rem' }}>
            Código em texto
          </p>
          <p
            style={{
              fontSize: '2rem',
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              fontWeight: 800,
              margin: '0.5rem 0',
              wordBreak: 'break-all',
            }}
          >
            {code}
          </p>
          <button type="button" onClick={() => void navigator.clipboard.writeText(code)}>
            Copiar código
          </button>
        </div>
      ) : null}
      <p style={{ marginTop: '1rem' }}>
        <Link to="/feed">← Voltar ao feed</Link>
      </p>
    </main>
  );
}
