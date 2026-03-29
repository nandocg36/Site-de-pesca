# Site-de-pesca — Plataforma Norte

Monorepo com **duas frentes**:

1. **PWA legada (vanilla)** — `index.html`, `app.js`, maré EPAGRI, índice heurístico, comunidade mock em `js/social/`.
2. **Greenfield Marco 1** — `apps/web` (React + Vite + TypeScript), `packages/fishing-core` (lógica EPAGRI em TS), `supabase/migrations` (schema fundacional).

## Greenfield — desenvolvimento (Marco 1)

```bash
npm install
npm run dev
```

Abre Vite em `http://127.0.0.1:5173` (app `@pesca/web`). Variáveis: copie `apps/web/.env.example` → `apps/web/.env` com URL e anon key do Supabase.

**Supabase:** aplicar as migrações em `supabase/migrations/` por ordem de timestamp (Marco 1 → 2 → 3 → **3b** `20260329300000_marco3b_dues.sql`), ou `supabase db reset` em local com CLI. Seed opcional: `supabase/seed.sql` — tokens de dev `marco1-dev-token`, `marco3-collab-dev-token`; org demo com `presence_qr` e **`dues`**. Ver `supabase/README.md`.

**Fluxos na app:** `/` (hub), `/instalar-pwa`, `/convite?token=…`, `/feed`, `/carteirinha`, **`/mensalidade`** (sócio), **`/admin/mensalidade`** (staff).

```bash
npm run build    # produção → apps/web/dist
```

## PWA legada (vanilla)

```bash
npm run dev:legacy
```

(Vite na raiz, porta **5174**, `vite.legacy.config.js`.)

Ou servidor estático:

```bash
npx serve .
```

ou (Python no Windows):

```powershell
Set-Location caminho\para\Site-de-pesca; py -3 -m http.server 8080 --bind 127.0.0.1
```

Abra a URL indicada pelo comando. Para logs extra na consola do browser na legada: `?debug=1`.

**Arquivo Git:** existe o branch `archive/legacy-pwa` apontando ao estado antes do greenfield no histórico (criado na execução do Marco 1).

## Testes

```bash
npm test           # legado: tests/*.test.js (maré + social)
npm run test:core  # packages/fishing-core (maré TS)
npm run test:web   # apps/web (Vitest: ex. normalização código presença)
npm run test:all   # os três
npx playwright install chromium   # primeira vez: browsers E2E
npm run test:e2e   # Playwright: smoke em preview (build + /, /convite, PWA, carteirinha)
```

## Documentação do projeto

[`docs/PROJETO-STATUS.md`](docs/PROJETO-STATUS.md) — estado, marcos e decisões.

## Dados externos (PWA legada / futuro fishing-core)

- [Open-Meteo](https://open-meteo.com/) — previsão e marine  
- [MET Norway](https://api.met.no/) — nascer/pôr e lua  
- Tábua local EPAGRI em `data/epagri-tides-2026.json` (`scripts/extract_epagri_tides.py`)

Maré oficial para navegação: [CHM / Marinha](https://www.marinha.mil.br/chm/tabuas-de-mare).
