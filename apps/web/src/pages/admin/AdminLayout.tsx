import { Link, Outlet } from 'react-router-dom';

export function AdminLayout() {
  return (
    <main className="feed-main">
      <header className="feed-top">
        <h1>Staff</h1>
        <p className="muted">Marco 3 — painel colaborador / proprietário (esqueleto)</p>
        <nav className="admin-nav">
          <Link to="/admin">Início</Link>
          {' · '}
          <Link to="/admin/presenca">Presença</Link>
          {' · '}
          <Link to="/feed">← Feed sócio</Link>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
