import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallPwaPage() {
  const [standalone, setStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(mq.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  async function onInstallClick() {
    if (!deferred) {
      setHint('Use o menu do browser: “Adicionar à tela inicial” / “Instalar app”.');
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  if (standalone) {
    return (
      <main>
        <h1>PWA instalada</h1>
        <p className="ok">Está a usar a app em modo standalone.</p>
        <p>
          <Link to="/convite">Continuar para o convite</Link> ou <Link to="/">voltar ao início</Link>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Instalar a aplicação</h1>
      <p className="muted">
        No primeiro acesso, instale a PWA para sessão estável e melhor experiência (Marco 1 — sem feed completo).
      </p>
      <div className="card">
        <ol>
          <li>Android / Chrome: menu ⋮ → <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
          <li>iOS / Safari: partilhar → <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Desktop Chrome: ícone de instalação na barra de endereço.</li>
        </ol>
        <p>
          <button type="button" onClick={() => void onInstallClick()}>
            Tentar instalar agora
          </button>
        </p>
        {hint ? <p className="muted">{hint}</p> : null}
      </div>
      <p>
        <Link to="/">← Início</Link>
      </p>
    </main>
  );
}
