import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCentsBrl } from '../lib/formatBrl';
import { isMemberSession, loadSession, type PescaSession } from '../lib/session';
import { supabase, supabaseConfigured } from '../lib/supabase';

type MonthState = {
  configured?: boolean;
  error?: string;
  amount_cents?: number;
  due_day?: number;
  due_date?: string;
  month_start?: string;
  paid?: boolean;
  overdue?: boolean;
  pending?: boolean;
  paid_amount_cents?: number;
};

type DuesPrefs = {
  holder_allows_share?: boolean;
  dependent_accepts?: boolean;
};

type DuesPayload = {
  ok?: boolean;
  visible?: boolean;
  reason?: string;
  is_dependent?: boolean;
  state?: MonthState;
  prefs?: DuesPrefs;
  error?: string;
};

function describeStatus(st: MonthState | undefined): string {
  if (!st || st.error) return 'Indisponível.';
  if (!st.configured) return 'Sem plano de mensalidade definido pelo clube.';
  if (st.paid) return 'Em dia para o mês corrente.';
  if (st.overdue) return 'Em atraso — regularize com o clube.';
  if (st.pending) return 'Ainda não venceu neste mês.';
  return 'Situação em análise.';
}

export function MemberDuesPage() {
  const [session, setSession] = useState<PescaSession | null>(() => loadSession());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<DuesPayload | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const refresh = useCallback(async (s: PescaSession) => {
    if (!supabaseConfigured) {
      setErr('Supabase não configurado (.env).');
      return;
    }
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.rpc('marco3b_member_dues_status', {
      p_profile_id: s.profile_id,
      p_device_id: s.device_id,
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      setPayload(null);
      return;
    }
    setPayload(data as DuesPayload);
  }, []);

  useEffect(() => {
    const s = loadSession();
    setSession(s);
    if (s && isMemberSession(s)) void refresh(s);
  }, [refresh]);

  async function onHolderShare(allow: boolean) {
    const s = loadSession();
    if (!s || !supabaseConfigured) return;
    setToggleBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('marco3b_member_holder_share_dues', {
      p_profile_id: s.profile_id,
      p_device_id: s.device_id,
      p_allow: allow,
    });
    setToggleBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; error?: string };
    if (!o.ok) {
      setErr(o.error ?? 'Não foi possível atualizar.');
      return;
    }
    await refresh(s);
  }

  async function onDependentAccept(accept: boolean) {
    const s = loadSession();
    if (!s || !supabaseConfigured) return;
    setToggleBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('marco3b_member_dependent_accept_dues', {
      p_profile_id: s.profile_id,
      p_device_id: s.device_id,
      p_accept: accept,
    });
    setToggleBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; error?: string };
    if (!o.ok) {
      setErr(o.error ?? 'Não foi possível atualizar.');
      return;
    }
    await refresh(s);
  }

  if (!session || !isMemberSession(session)) {
    return (
      <main className="feed-main">
        <h1>Mensalidade</h1>
        <p className="muted">Área só para sócios com sessão ativa.</p>
        <p>
          <Link to="/convite">Ir para convite</Link> · <Link to="/feed">Feed</Link>
        </p>
      </main>
    );
  }

  const st = payload?.state;
  const visible = payload?.visible === true;
  const prefs = payload?.prefs;
  const holderShare = prefs?.holder_allows_share === true;
  const depAccept = prefs?.dependent_accepts === true;

  return (
    <main className="feed-main">
      <header className="feed-top">
        <h1>Mensalidade</h1>
        <p className="muted">
          {session.display_name ?? session.profile_id.slice(0, 8)} ·{' '}
          <Link to="/feed">← Feed</Link>
        </p>
      </header>

      {!supabaseConfigured ? <p className="err">Configure Supabase no .env.</p> : null}
      {err ? <p className="err">{err}</p> : null}
      {loading ? <p className="muted">A carregar…</p> : null}

      {payload?.ok === true && payload.visible === false && payload.reason === 'module_disabled' ? (
        <div className="card">
          <p>O módulo de mensalidade não está ativo para a tua entidade.</p>
        </div>
      ) : null}

      {payload?.ok === true && payload.visible === false && payload.reason === 'dependent_visibility_denied' ? (
        <div className="card">
          <p className="muted">
            Como dependente, só vês a mensalidade do titular quando ele autoriza e tu aceitas aqui.
          </p>
          {!holderShare ? (
            <p className="muted">O titular ainda não ativou a partilha com dependentes.</p>
          ) : null}
          <p>
            <label>
              <input
                type="checkbox"
                checked={depAccept}
                disabled={toggleBusy || !holderShare}
                onChange={(e) => void onDependentAccept(e.target.checked)}
              />{' '}
              Aceito ver a situação de mensalidade do meu titular
            </label>
          </p>
        </div>
      ) : null}

      {payload?.ok === true && visible && payload.is_dependent !== true ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Se tiveres dependentes no cadastro, podes autorizar que vejam o mesmo resumo de mensalidade (eles
            também têm de aceitar no perfil deles).
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={holderShare}
                disabled={toggleBusy}
                onChange={(e) => void onHolderShare(e.target.checked)}
              />{' '}
              Permitir que os meus dependentes vejam a situação de mensalidade
            </label>
          </p>
        </div>
      ) : null}

      {payload?.ok === true && visible && st ? (
        <div className="card">
          <p>
            <strong>Estado:</strong> {describeStatus(st)}
          </p>
          {st.configured && st.amount_cents != null ? (
            <>
              <p>
                <strong>Valor:</strong> {formatCentsBrl(st.amount_cents)} · <strong>Vencimento (dia):</strong>{' '}
                {st.due_day ?? '—'}
              </p>
              {st.due_date ? (
                <p className="muted">
                  Data de vencimento deste mês:{' '}
                  {new Date(st.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </p>
              ) : null}
              {st.paid_amount_cents != null && st.paid_amount_cents > 0 ? (
                <p className="muted">
                  Valor registado para o mês: {formatCentsBrl(st.paid_amount_cents)}
                </p>
              ) : null}
            </>
          ) : null}
          <p className="muted smallprint">
            Pagamentos online (PSP) e links automáticos vêm numa fase seguinte do Marco 3b. A baixa continua
            possível manualmente no painel staff.
          </p>
        </div>
      ) : null}

      {payload?.ok === false ? <p className="err">{String(payload.error ?? 'Erro')}</p> : null}

      <p className="muted">
        <Link to="/">Início</Link>
      </p>
    </main>
  );
}
