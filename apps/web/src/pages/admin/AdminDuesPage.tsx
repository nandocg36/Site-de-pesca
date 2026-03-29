import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCentsBrl, parseReaisToCents } from '../../lib/formatBrl';
import { loadSession, type PescaSession } from '../../lib/session';
import { supabase, supabaseConfigured } from '../../lib/supabase';

type MonthState = {
  configured?: boolean;
  error?: string;
  amount_cents?: number;
  due_day?: number;
  due_date?: string;
  paid?: boolean;
  overdue?: boolean;
  pending?: boolean;
  paid_amount_cents?: number;
};

type MemberRow = {
  profile_id: string;
  display_name: string | null;
  holder_profile_id: string | null;
  is_billing_holder: boolean;
  billing_profile_id: string | null;
  dues_monthly_amount_cents: number | null;
  dues_due_day: number | null;
  month_state: MonthState;
};

function monthStateLabel(st: MonthState): string {
  if (st.error) return st.error;
  if (!st.configured) return 'Sem plano';
  if (st.paid) return 'Pago (mês)';
  if (st.overdue) return 'Em atraso';
  if (st.pending) return 'A vencer';
  return '—';
}

export function AdminDuesPage() {
  const [session] = useState<PescaSession | null>(() => loadSession());
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [planProfileId, setPlanProfileId] = useState('');
  const [planReais, setPlanReais] = useState('');
  const [planDay, setPlanDay] = useState('10');
  const [payProfileId, setPayProfileId] = useState('');
  const [payReais, setPayReais] = useState('');
  const [payYear, setPayYear] = useState(String(new Date().getFullYear()));
  const [payMonth, setPayMonth] = useState(String(new Date().getMonth() + 1));
  const [payNote, setPayNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = loadSession();
    if (!s || !supabaseConfigured) return;
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.rpc('marco3b_staff_dues_members_list', {
      p_staff_profile_id: s.profile_id,
      p_staff_device_id: s.device_id,
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    const o = data as { ok?: boolean; members?: unknown; error?: string };
    if (!o.ok) {
      setErr(o.error ?? 'Lista indisponível');
      setRows([]);
      return;
    }
    const raw = Array.isArray(o.members) ? o.members : [];
    setRows(
      raw.map((r) => {
        const x = r as Record<string, unknown>;
        return {
          profile_id: String(x.profile_id),
          display_name: x.display_name == null ? null : String(x.display_name),
          holder_profile_id: x.holder_profile_id == null ? null : String(x.holder_profile_id),
          is_billing_holder: Boolean(x.is_billing_holder),
          billing_profile_id: x.billing_profile_id == null ? null : String(x.billing_profile_id),
          dues_monthly_amount_cents:
            x.dues_monthly_amount_cents == null ? null : Number(x.dues_monthly_amount_cents),
          dues_due_day: x.dues_due_day == null ? null : Number(x.dues_due_day),
          month_state: (x.month_state ?? {}) as MonthState,
        };
      }),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const holders = rows.filter((r) => r.is_billing_holder);

  async function onSavePlan(e: FormEvent) {
    e.preventDefault();
    const s = loadSession();
    if (!s || !supabaseConfigured || !planProfileId) return;
    const cents = parseReaisToCents(planReais);
    const day = Number(planDay);
    if (cents == null || cents < 0) {
      setErr('Valor em reais inválido.');
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      setErr('Dia de vencimento deve ser entre 1 e 28.');
      return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('marco3b_staff_set_member_dues', {
      p_staff_profile_id: s.profile_id,
      p_staff_device_id: s.device_id,
      p_member_profile_id: planProfileId,
      p_amount_cents: cents,
      p_due_day: day,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; error?: string };
    if (!o.ok) {
      setErr(o.error ?? 'Não foi possível guardar.');
      return;
    }
    await refresh();
  }

  async function onRecordPayment(e: FormEvent) {
    e.preventDefault();
    const s = loadSession();
    if (!s || !supabaseConfigured || !payProfileId) return;
    const cents = parseReaisToCents(payReais);
    const y = Number(payYear);
    const m = Number(payMonth);
    if (cents == null || cents < 1) {
      setErr('Valor pago inválido.');
      return;
    }
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      setErr('Ano/mês inválidos.');
      return;
    }
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc('marco3b_staff_record_dues_payment', {
      p_staff_profile_id: s.profile_id,
      p_staff_device_id: s.device_id,
      p_billed_profile_id: payProfileId,
      p_amount_cents: cents,
      p_covers_year: y,
      p_covers_month: m,
      p_note: payNote.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; error?: string };
    if (!o.ok) {
      setErr(o.error ?? 'Não foi possível registar.');
      return;
    }
    await refresh();
  }

  if (!session) {
    return (
      <div className="card">
        <p>Sessão em falta.</p>
        <Link to="/convite">Convite</Link>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Mensalidade (Marco 3b)</h2>
      <p className="muted">
        Módulo ativo com <code>feature_flags.dues</code> na organização. Pagamentos são manuais até integração PSP.
      </p>

      {!supabaseConfigured ? <p className="err">Supabase não configurado.</p> : null}
      {err ? <p className="err">{err}</p> : null}
      {loading ? <p className="muted">A carregar…</p> : null}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Definir plano (titular)</h3>
        <form onSubmit={(e) => void onSavePlan(e)}>
          <p>
            <label>
              Titular{' '}
              <select
                value={planProfileId}
                onChange={(e) => setPlanProfileId(e.target.value)}
                required
                style={{ minWidth: '12rem' }}
              >
                <option value="">—</option>
                {holders.map((h) => (
                  <option key={h.profile_id} value={h.profile_id}>
                    {h.display_name ?? h.profile_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <p>
            <label>
              Valor mensal (R$){' '}
              <input
                value={planReais}
                onChange={(e) => setPlanReais(e.target.value)}
                placeholder="150,00"
                inputMode="decimal"
                style={{ maxWidth: '8rem' }}
              />
            </label>{' '}
            <label>
              Vencimento (dia 1–28){' '}
              <input
                value={planDay}
                onChange={(e) => setPlanDay(e.target.value)}
                style={{ width: '3rem' }}
              />
            </label>
          </p>
          <p>
            <button type="submit" disabled={busy}>
              Guardar plano
            </button>
          </p>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Registar pagamento manual</h3>
        <form onSubmit={(e) => void onRecordPayment(e)}>
          <p>
            <label>
              Cobrança (titular){' '}
              <select
                value={payProfileId}
                onChange={(e) => setPayProfileId(e.target.value)}
                required
                style={{ minWidth: '12rem' }}
              >
                <option value="">—</option>
                {holders.map((h) => (
                  <option key={h.profile_id} value={h.profile_id}>
                    {h.display_name ?? h.profile_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <p>
            <label>
              Valor (R$){' '}
              <input
                value={payReais}
                onChange={(e) => setPayReais(e.target.value)}
                placeholder="150,00"
                inputMode="decimal"
                style={{ maxWidth: '8rem' }}
              />
            </label>{' '}
            <label>
              Ano{' '}
              <input value={payYear} onChange={(e) => setPayYear(e.target.value)} style={{ width: '4.5rem' }} />
            </label>{' '}
            <label>
              Mês{' '}
              <input value={payMonth} onChange={(e) => setPayMonth(e.target.value)} style={{ width: '3rem' }} />
            </label>
          </p>
          <p>
            <label>
              Nota (opcional){' '}
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                style={{ width: '100%', maxWidth: '24rem' }}
              />
            </label>
          </p>
          <p>
            <button type="submit" disabled={busy}>
              Registar / atualizar mês
            </button>
          </p>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sócios</h3>
        <table className="dues-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Titular cobrança</th>
              <th>Valor / dia</th>
              <th>Mês (SP)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.profile_id}>
                <td>{r.display_name ?? r.profile_id.slice(0, 8)}</td>
                <td>{r.is_billing_holder ? '—' : (r.billing_profile_id ?? '—').slice(0, 8)}</td>
                <td>
                  {r.dues_monthly_amount_cents != null ? formatCentsBrl(r.dues_monthly_amount_cents) : '—'} /{' '}
                  {r.dues_due_day ?? '—'}
                </td>
                <td>{monthStateLabel(r.month_state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading ? <p className="muted">Sem linhas.</p> : null}
      </div>

      <p className="muted">
        <button type="button" className="linkish" onClick={() => void refresh()}>
          Atualizar lista
        </button>
      </p>
    </div>
  );
}
