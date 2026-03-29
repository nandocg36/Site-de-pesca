import { Link } from 'react-router-dom';
import { loadSession } from '../../lib/session';

export function AdminDashboard() {
  const s = loadSession();
  return (
    <div className="card">
      <p>
        Sessão: <strong>{s?.display_name ?? s?.profile_id}</strong> ({s?.role_id})
      </p>
      <p className="muted">
        Neste marco: módulo de <strong>presença por código</strong> (batida portaria), ativado por{' '}
        <code>feature_flags.presence_qr</code> na organização.
      </p>
      <p>
        <Link to="/admin/presenca">Abrir presença →</Link>
      </p>
    </div>
  );
}
