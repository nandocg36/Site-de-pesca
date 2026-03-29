import { Link } from 'react-router-dom';
import { addDaysIso } from '@pesca/fishing-core';

export function HomeMarco1() {
  const probe = addDaysIso('2026-03-29', 1);
  return (
    <main>
      <h1>Marco 1 — fundações</h1>
      <p className="muted">
        Greenfield React + Vite + TypeScript. Pacote <code>@pesca/fishing-core</code> carregado (ex.:{' '}
        <code>{probe}</code>).
      </p>
      <div className="card">
        <p>
          <strong>Próximos passos:</strong> configurar Supabase (<code>.env</code>), aplicar migrações e
          abrir o fluxo de convite.
        </p>
        <ul>
          <li>
            <Link to="/instalar-pwa">Instalar PWA (primeiro acesso)</Link>
          </li>
          <li>
            <Link to="/convite">Entrar com link de convite</Link>
          </li>
          <li>
            <Link to="/feed">Feed (Marco 2 — após convite)</Link>
          </li>
          <li>
            <Link to="/admin">Staff / presença (Marco 3 — convite colaborador)</Link>
          </li>
          <li>
            <Link to="/carteirinha">Código presença sócio (Marco 3)</Link>
          </li>
        </ul>
      </div>
      <p className="muted">
        A PWA vanilla legada continua disponível com <code>npm run dev:legacy</code> na raiz do repositório.
      </p>
    </main>
  );
}
