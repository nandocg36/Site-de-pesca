# 📌 PROJETO — STATUS GERAL

**Repositório:** Site-de-pesca (Pesca — Plataforma Norte)  
**Última atualização do documento:** 2026-03-29 (Bugbot: regra global no perfil; repo sem duplicado)

---

## 🧭 Estado do plano de produto (ler em chats novos)

### Onde estamos agora

| Dimensão | Situação |
|----------|----------|
| **Código no repositório** | **Marcos 1–3 (esqueleto):** `apps/web` com `/`, `/instalar-pwa`, `/convite`, `/feed`, **`/admin`** (staff), **`/admin/presenca`**, **`/carteirinha`** (código sócio); `packages/fishing-core`; `supabase/migrations` inclui **`20260329200000_marco3_staff_presence.sql`**. **Backend:** Supabase **`pesca-plataforma-norte`** (`imyyiugqqioxmaxedkgn`); Marco 3 no remoto aplicado com **`execute_sql`** (DDL + funções) + seed colaborador + `feature_flags.presence_qr`. **PWA legada** na raiz; `npm run dev` → app nova. **ND Fleet** pausado — ver **⏳ Pendências**. |
| **Planeamento** | Plano Cursor: **Marco 3** = staff + presença QR/batida + flags (**MVP:** código alfanumérico, sem painel `apps/admin` separado nem QR SVG na app). **A seguir:** mensalidade/ranking/PSP (**Marco 3b** no doc de produto), `apps/admin` dedicado ou Auth forte. |
| **Plano mestre (detalhe)** | Ficheiro no perfil: `C:\Users\luiz_\.cursor\plans\plataforma_instagram_ux_f6049e26.plan.md` — contém marcos, skills, estrutura de pastas, fluxos. **Pendência opcional:** duplicar esse conteúdo para `docs/PLANO-PRODUTO-FUTURO.md` no repo para quem clona noutro PC sem o mesmo `.cursor/plans`. |

### Decisões já registadas (síntese — manter alinhado com o plano)

- **UI sócio:** estilo **Instagram** (feed vertical, mídia, ações), **não** Telegram. **Post fixado** de métricas/horários **sempre primeiro**; utilizador pode **minimizar** → barra fina com **letreiro** (texto a deslizar, estilo ônibus/jornal; respeitar `prefers-reduced-motion`).
- **Greenfield:** o frontend/base atual **não** evolui até ao produto final; **novo projeto/pastas**; **preservar** antes de apagar: `js/tide-epagri.js`, `tests/tide-epagri.test.js`, `data/epagri-tides-2026.json` (+ script Python se útil); **arquivar** legacy em git (`archive/legacy-pwa` ou tag).
- **Auth:** **sócios** e **colaboradores** só por **link+token** + **vínculo de dispositivo**; sessão persistente; **logout** só explícito; **desvincular celular** no cadastro liberta o mesmo link. **Proprietário:** user/senha criados pelo **provedor**; reset senha ok; **e-mail/username** só o provedor altera.
- **Cadastro:** sócios = **titular** + **dependentes** aninhados; **ativo/inativo/excluir**; fotos. **Mensalidade visível ao dependente** só com **duplo consentimento** (titular + dependente nas configurações).
- **Menores:** menores de **18 anos** bloqueados por defeito; exceção só com **flag explícita do proprietário**.
- **Privacidade sócio↔sócio:** **telefone e morada nunca** entre pares. **Staff** pode mostrar tel/WhatsApp ao sócio **só com opt-in** no perfil staff.
- **Sem mensagens privadas:** só **comentários e curtidas em posts**; **visibilidade** do post (**público** vs **só amigos**) aplica-se ao **pacote** foto + curtidas + comentários.
- **Primeiro acesso:** ecrã **instalar PWA**; depois **onboarding** (comunidade, pesca, iscas, fotos, amigos).
- **Presença / enquetes:** eixo principal **carteirinha QR/código + batida portaria** (entrada/saída); **modo invisível** para outros sócios, staff vê até saída. GPS opcional/complementar.
- **Mensalidade / pagamentos (opcional, proprietário ativa):** cálculo **em dia/débito** + avisos; cartão **recorrente** via PSP; **links gerados**; **URL fixa**; **solicitar link** (in-app + WhatsApp empresa) só se toggle ativo; **baixa manual** mantida.
- **Engajamento (opcional):** ranking amigável “maior peixe”; fila de fotos para **proprietário + colaboradores**; **criar** enquete deste tipo = **só colaborador**; proprietário ativa módulos; top 5 / troféu; aviso de **atraso** fora de horário staff. Painel staff: **filtros** (ex. mais ativos, maior peixe do dia).
- **Skills prioritárias na implementação:** `security-review`, `postgres-patterns`, `database-migrations`, `api-design`, `tdd-workflow`, `e2e-testing`, `coding-standards`, `frontend-patterns` (transponível), `design-system`/`frontend-design`, `deployment-patterns`, `documentation-lookup`.

### Ainda por decidir

- **PSP** (pagamentos no Brasil: ex. Mercado Pago, Stripe+PIX, etc.) — fase posterior (Marco 3b).
- **Firebase** ficou **fora** do Marco 1; **Supabase (Postgres + RLS)** adotado para greenfield até nova decisão explícita.
- **Monorepo Opção A** (`apps/web` + `packages/fishing-core` + `supabase/`) adotado no Marco 1; `apps/admin` pode surgir mais tarde.

### Regra obrigatória de documentação (para agentes e humanos)

1. **Sempre que houver uma decisão nova** (produto, stack, fluxo, prazo): atualizar **esta secção** ou as tabelas em **🔄 Últimas alterações** / **⏳ Pendências** / **⚙️ Decisões técnicas**.  
2. Manter **coerência** com o ficheiro de plano em `.cursor/plans/` **ou** com `docs/PLANO-PRODUTO-FUTURO.md` se for criado.  
3. No **início de uma conversa nova**, o agente deve **ler `docs/PROJETO-STATUS.md` na íntegra** e **esta secção 🧭** para saber **em que pé** o projeto está.

---

## 🧠 Visão geral do projeto

PWA **estática** (HTML + CSS + JavaScript vanilla) focada na **Plataforma Norte, Balneário Rincão, SC**. O **primeiro ecrã** responde em linguagem simples: **BOM / MAIS OU MENOS / FRACO / RUIM**, nota 0–100, dois motivos curtos e uma sugestão de horário — para quem pesca na plataforma sem querer “painel técnico”. Maré (EPAGRI), tempo/mar e lua entram no cálculo; **pormenores** (tempo agora, gráfico, hora a hora, números técnicos) ficam em secções **recolhidas** (`<details>`). Não há backend nem multi-local.

**Camada Comunidade (UI + lógica local; backend remoto ainda desligado):** em `js/social/` há **validação** (`validation.js`), **geofence** (`geofence.js` + `constants.js`), **agregações** (`aggregate.js`), **adaptador mock** com o mesmo contrato que Firebase/Supabase (`adapters/mockBackend.js`), **stubs** `firebaseAdapter.js` / `supabaseAdapter.js`, **shell de UI** (`socialShell.js`) e **`bootstrap.js`** (`SOCIAL_BACKEND = 'mock'`). Dados demo persistem em **localStorage** no browser (chave `pesca_social_mock_v1`). **Ligação ao servidor:** alterar `SOCIAL_BACKEND` e implementar métodos no adaptador escolhido (espelhar o mock).

**Ideia de produto (continuação):** login, fotos com visibilidade, amigos, comentários, micro-inquéritos por GPS, cartões “o que a comunidade disse” — complementar ao índice do modelo; implica **moderação**, **LGPD** e políticas claras quando o backend estiver ativo.

---

## 🏗️ Estrutura atual

| Caminho | Função |
|--------|--------|
| `index.html` | UI: cartão de resposta simples, `<details>` para extras, drawer curto, registo do SW |
| `app.js` | Lógica: APIs, agregação, índice, gráfico (Chart.js), estado, UI; importa `initSocialApp` |
| `js/utils/escapeHtml.js` | Escape HTML partilhado (app + comunidade) |
| `js/social/*` | Comunidade: constantes, validação, geofence, agregados, mock + stubs Firebase/Supabase, UI |
| `js/tide-epagri.js` | Maré EPAGRI: extremos → interpolação linear hora a hora (`buildEffectiveSeaLevels`, etc.) |
| `tests/tide-epagri.test.js` | Testes Vitest da lógica de maré |
| `tests/social-*.test.js` | Testes: validação, geofence, agregados, mockBackend |
| `package.json` / `vitest.config.js` | `npm test` |
| `styles.css` | Visual, design tokens (`:root`), acessibilidade (skip link, `focus-visible`, `prefers-reduced-motion`) |
| `offline.html` | Página fallback quando não há rede e o pedido HTML não está em cache |
| `sw.js` | Cache e comportamento offline (PWA); `pesca-v20` |
| `manifest.json` | Manifesto PWA (`id`, `categories`, `display_override`, cores alinhadas ao tema) |
| `data/epagri-tides-2026.json` | Extremos de maré (tábua EPAGRI); a app interpola hora a hora |
| `scripts/extract_epagri_tides.py` | Script auxiliar para extração/atualização de dados EPAGRI |
| `.cursor/rules/pesca-plataforma-norte.mdc` | Regras de produto e stack do projeto |
| `.cursor/rules/projeto-status-documentacao.mdc` | Obriga leitura/atualização deste `PROJETO-STATUS.md` |
| `docs/PROJETO-STATUS.md` | **Fonte única de verdade** para histórico, problemas e pendências |
| `apps/web/` | React+Vite+TS: `/feed`, **`/admin`**, **`/admin/presenca`**, **`/carteirinha`**, convite/PWA; `vitest.config.ts`; `npm run test -w @pesca/web`; `lib/memberCheckinCode.ts` (normalização batida) |
| `packages/fishing-core/` | Maré EPAGRI + **índice costeiro** (`coastIndex.ts`, espelho da lógica de `app.js`); `npm run test -w @pesca/fishing-core` |
| `supabase/migrations/` | Marco 1–2 como antes. Marco 3: `organizations.feature_flags`, `profiles.checkin_code`, `presence_events`, RPCs `marco3_member_ensure_checkin_code`, `marco3_staff_register_presence`, `marco3_staff_presence_list` |
| `supabase/seed.sql` | Dev: org com `presence_qr`; sócio **`marco1-dev-token`**; colaborador **`marco3-collab-dev-token`**; Marco 2 social demo |
| `vite.legacy.config.js` | Vite na raiz para servir PWA vanilla legada (porta 5174) |
| `playwright.config.ts` / `e2e/` | Smoke E2E da `@pesca/web` via `vite preview` (porta 4173); `npm run test:e2e` |

---

## 📊 Estado do sistema (auditoria — leitura estática do código; sem E2E nesta sessão)

### O que o sistema faz (funcionalmente)

- **Ponto fixo** Plataforma Norte (−28,82718°, −49,21348°): sem escolha de local pelo utilizador.
- **Open-Meteo** (marine + forecast): série horária alinhada; `fetch` com `cache: 'no-store'`; tratamento de `data.error` em `fetchJson`.
- **Maré no índice e gráfico:** curva hora a hora por interpolação linear entre extremos do JSON EPAGRI; fallback para nível do modelo se não houver tábua/dia.
- **MET Norway** (sol/lua): cabeçalhos em `MET_HEADERS`; astro por dia com **`Promise.allSettled`** (falha parcial não bloqueia o resto).
- **Índice 0–100:** combinação ponderada (maré, lua/solunar, pressão, vento, chuva, ondas, SST, CAPE, código WMO, contexto recente, etc.); copy e drawer alinhados com heurística.
- **UI:** hero com boas-vindas em duas linhas + **faixa data/tempo** (`renderHeroStrip`: hoje = `current` Open-Meteo; outros dias = hora representativa do dia); resumo **simples** (`renderSimpleAnswer` + chips de atividade/índice); lista **hora a hora interativa** (`<details>` com “porquê” e atividade dos peixes); **gaveta Métricas** (rail + resumo, ranking de horas, cópia da lista, solunar/maré duplicados para leitura longa); recomendações técnicas, solunar, tábua, gráfico e resumo numérico **só** ao abrir `<details>`; avisos “tempo agora” com disclaimer INMET.
- **Atualização periódica:** `refreshLiveWeatherSnapshot` a cada 10 min (reaproveita `state.bundle`).
- **PWA:** `manifest.json`, `sw.js` com cache de origem (incl. `offline.html`) e APIs em rede direta; navegação offline sem cache tenta `offline.html`.

### O que está coerente e robusto

- Alinhamento marine + forecast só em timestamps comuns (`alignByTime`).
- EPAGRI opcional: falha de rede/JSON não derruba a app (`loadEpagriTideTable` → `null`).
- Avisos explícitos: modelo ≠ alerta oficial; CHM/Marinha no rodapé e drawer.
- Acessibilidade básica: `aria-*`, drawer com Escape, links externos com `rel="noopener"`.

### Riscos e pontos de falha (podem dar problema)

| Área | Risco |
|------|--------|
| **Service Worker** | `install` faz `addAll(CORE_ASSETS)` + ícones **opcionais** com `fetch` individual — **404 nos ícones não bloqueia** instalação (cache `pesca-v20`). |
| **Ícones** | Referências em `index.html` / `manifest` — ausentes no repo só afectam ícone PWA; SW e shell da app instalam na mesma. |
| **Chart.js** | CDN; se falhar, gráfico omite-se sem derrubar o resto (`updateChart`). |
| **Ano / dados EPAGRI** | URL fixa `epagri-tides-2026.json`; novo ano → JSON + `EPAGRI_TIDES_URL` + lista `CORE_ASSETS` no `sw.js`. |
| **Gaps no JSON EPAGRI** | Dias sem chave em `extremesByDate` → fallback modelo nessas horas. |
| **APIs terceiras** | Carga inicial com mensagem explícita; **refresh** falho → aviso sob “Tempo agora” + `console.error`. |
| **MET Norway** | Muitos pedidos no 1.º load; **Log do `serve`:** não lista APIs — só no browser (F12). |
| **`innerHTML`** | Risco XSS baixo com dados actuais. |
| **`app.js` como módulo** | Importa `./js/tide-epagri.js`; SW precache inclui esse ficheiro. |

---

## 📐 Métricas, pontuações e tábua EPAGRI (verificação lógica)

### A tábua que enviou (EPAGRI em JSON) está a ser aplicada?

| Uso | Onde no código | Confirmação |
|-----|----------------|-------------|
| **Curva hora a hora** | `loadEpagriTideTable` → `extremesByDate`; funções em **`js/tide-epagri.js`** (`buildEpagriCurveForDay`, `interpolateAlongPts`, `buildEffectiveSeaLevels`); `app.js` importa `buildEffectiveSeaLevels` | Sim: cada hora da série alinhada usa **altura interpolada** entre extremos do JSON (`t` + `h_m`), com último extremo do dia anterior e primeiro do dia seguinte para fechar o intervalo. |
| **Tabela “Preamar / Baixamar” na UI** | `renderTideTablePanel` com `epagriExtremesByDate[dateKey]` | Sim: horários e alturas vêm **directamente** do JSON; rótulo Preamar/Baixamar usa o campo `hi`. |
| **Gráfico (linha maré)** | `sliceDay` sobre `aligned.sea` já **pós-**`buildEffectiveSeaLevels` | Sim: a linha normalizada reflete a curva EPAGRI quando disponível. |
| **Índice 0–100** | `computeHourlyScoresDetailed` usa `sea` = série efetiva | Sim: **tideTurn** (viragem) e **tideSpeed** (ritmo) derivam desta série — portanto a componente maré do score está ligada à **tábua interpolada**, não ao modelo bruto. |
| **Fallback** | Dia sem `extremesByDate` ou sem curva (`cur.length < 2`) | Usa **Open-Meteo marine** naquela hora. |

**Limitações da integração (não são bugs, são modelação):**

- Interpolação é **linear** entre extremos — não reproduz a curva harmónica real da maré entre vales/picos; para a maioria dos usos de “janela horária” é aceitável, mas **não** é maregrafia.
- `new Date(\`${dk}T${e.t}:00\`)` interpreta data/hora no **fuso do browser**; o JSON declara horários alinhados à previsão (`timezone_note`). Utilizador fora do Brasil pode ver **desvio** entre tábua e eixo horário da API.
- Dias **sem chave** em `extremesByDate` caem no modelo para essas horas.

### As pontuações “fazem sentido”?

- O valor final é **heurístico**: soma ponderada de factores normalizados (muitos entre 0 e 1), pesos `SCORE_W_COAST` normalizados a soma 1, depois ×100 e *clamp* 0–100. **Não** há validação científica contra capturas reais.
- **normalize(tideTurn)** e **normalize** de SST usam **min/max da série carregada** (~11 dias): um “68” num dia é **relativo** a esse período, não um absoluto nacional.
- Coerência interna: drawer “Como funciona” + “Pesos no índice” descrevem os mesmos eixos que entram na fórmula (maré, pressão, vento, lua/solunar, etc.).

### O que faltaria para um site “completo” feito do zero?

| Ideia | Para quê |
|-------|----------|
| **Datum e legenda** | Drawer “Maré e precisão” menciona fuso + EPAGRI vs MSL do modelo; refinamentos futuros possíveis. |
| **Corrente / vazão** | Open-Meteo ou outras fontes para corrente de superfície ou rio próximo (onde aplicável). |
| **Período de onda, direção de swell** | Já há altura; período e direção melhoram “mar de fundo” vs vento local. |
| **Dados observados** | Estação costeira / boia (ex. marinha, institutos) para confrontar modelo vs realidade. |
| **Alertas oficiais** | Integração ou link forte a INMET + Marinha (já referidos; automação é outro passo). |
| **Calibragem** | Ajustar pesos com feedback de pescadores ou histórico local (mesmo simples). |
| **Testes** | Unitários para `buildEffectiveSeaLevels`, `interpolateAlongPts`, e um dia fixo de JSON para regressão. |

---

## ⚙️ Decisões técnicas

- **Greenfield Marco 1 (2026-03-29):** **Supabase** como backend alvo; **npm workspaces** na raiz; **`@pesca/web`** em `apps/web`; **`@pesca/fishing-core`** como pacote partilhado (alias Vite para `src/` sem obrigar `build` do pacote para desenvolver a web).
- **Marco 2 social (2026-03-29):** tabelas com **RLS ativado e sem políticas** (igual ao Marco 1): leitura/escrita **só via RPC `SECURITY DEFINER`**, que validam **`device_bindings`** com `p_profile_id` + `p_device_id`. Regra de visibilidade: **`public`** visível a todos os perfis da mesma org; **`friends`** visível ao autor, ou a quem tem amizade **`accepted`** com o autor. **Não** é ainda RLS “pura” por `auth.uid()` — documentado como passo seguinte quando existir sessão Supabase Auth para sócios.
- **Marco 2 índice:** lógica de `alignByTime` + `computeHourlyScoresDetailed` + veredito simples + etiquetas WMO portadas para **`packages/fishing-core/src/coastIndex.ts`**; `apps/web` usa **`loadPlataformaPinnedSnapshot`** (`lib/plataformaBundle.ts`) com Open-Meteo, MET Norway e EPAGRI estático em `/data/`.
- **Marco 3 staff / presença (2026-03-29):** `organizations.feature_flags` (ex. `presence_qr`); sócio **membro** obtém código único na org (`checkin_code`); staff (**owner** ou **collaborator**) regista **entrada/saída** por código; estado derivado do **último evento** em `presence_events`. UI: **`/admin`**, **`/carteirinha`**. **QR na carteirinha:** `qrcode` gera **data URL** (mesmo payload que o texto) para leitores 2D; batida normaliza **trim + maiúsculas + remove quebras de linha** (pós-scan). Mesmo modelo de confiança que Marco 2 (**device_bindings** + `profile_id` nas RPCs). **Ainda fora:** modo invisível, `apps/admin` separado, integração leitor dedicado (hardware).
- **Legado:** PWA vanilla na raiz **preservada**; não remover até migração de funcionalidades para `apps/web` (Marco 2+).
- **Stack legada:** sem frameworks; `fetch` com `cache: 'no-store'` onde já aplicado para dados em tempo real.
- **Comunidade / futuro backend:** contrato único via adaptadores em `js/social/adapters/`; produção pretende **Firebase ou Supabase** — até lá só `mock`; stubs rejeitam chamadas com mensagem explícita.
- **UI / marca:** estética **“cais costeiro”**; **prioridade de leitura** para público local (linguagem curta, veredito grande). Conteúdo dinâmico em `innerHTML` com **`escapeHtml`** onde há dados de API/JSON.
- **Progressive disclosure:** detalhe técnico só após `<summary>`; gráfico Chart redimensiona ao abrir o `<details>` correspondente (`state._chartDetailsWired`).
- **Coordenadas fixas** em `app.js` (`FIXED_LAT`, `FIXED_LON`, `FIXED_PLACE_LABEL`); alterar só com intenção explícita e revisão de copy.
- **Contexto marinho:** `cell_selection: 'sea'` (Open-Meteo marine); app exclusiva costa — não reintroduzir “interior” sem decisão de produto.
- **APIs:** Open-Meteo (marine + forecast), MET Norway (User-Agent obrigatório via `MET_HEADERS`), tratamento de `data.error` nas respostas.
- **Maré:** tábua local EPAGRI em JSON; distinção clara no copy entre EPAGRI local e tábua oficial CHM/Marinha.
- **Linguagem UI:** português (pt-BR).
- **Índice de pesca:** heurístico; copy deve evitar “garantia de peixe”.
- **Alterações em pesos/fórmula do índice:** alinhar textos do drawer (“Como funciona” / pesos) quando o comportamento visível mudar.

### Skills Cursor — aplicabilidade (matriz)

O agente **não** deve assumir skills de outros stacks (ex.: Flutter, Spring, Laravel) para este repositório. Consultar `SKILL.md` **antes** de implementar quando a tarefa cair na coluna “Quando”.

| Skill (pasta em `~/.cursor/skills/`) | Quando usar neste projeto |
|--------------------------------------|---------------------------|
| `security-review` | Alterações a `fetch`, cabeçalhos, dados de terceiros, possível XSS/HTML, ou qualquer superfície que processe input |
| `coding-standards` | JavaScript vanilla, organização de módulos/ficheiros, estilo geral TS/JS aplicável ao front |
| `frontend-patterns` | UI, performance de front, padrões React/Next **só onde transponíveis** a HTML/CSS/JS estático |
| `e2e-testing` | Se forem adicionados testes Playwright (ou similar) para fluxos críticos da PWA |
| `tdd-workflow` | Se for introduzida base de testes automatizados (unit/E2E) com disciplina TDD |
| `python-patterns` / `python-testing` | Alterações a `scripts/extract_epagri_tides.py` ou novos scripts Python |
| `documentation-lookup` | Dúvidas de API de bibliotecas (ex.: Chart.js) ou serviços externos com docs em mudança |
| `deployment-patterns` | Hospedagem estática, cache, headers de segurança em produção |
| `create-rule` / `create-skill` | Evolução de regras Cursor ou skills **ligadas** a este repo |
| `progressive-web-app` | Revisão de manifest, SW, offline, “add to home screen”, boas práticas PWA |
| **Bugbot (GitHub)** | **Regra global** `%USERPROFILE%\.cursor\rules\global-bugbot-github-workflow.mdc` (`alwaysApply: true`): em PRs, `bugbot run` / `cursor review` + contexto; reconciliar feedback com código local (`gh pr view` ou texto colado). **Modelo Site-de-pesca:** ver secção abaixo *Template comentário Bugbot*. |
| `playwright-skill` | Complemento a `e2e-testing` se forem criados fluxos E2E (setup, padrões) |
| `frontend-design` | Qualidade visual, hierarquia, consistência UI (transponível a CSS/HTML estático) |
| `systematic-debugging` | Depuração estruturada quando falhas são difíceis de reproduzir |
| `modern-javascript-patterns` | JS moderno (módulos, APIs) alinhado a vanilla sem framework |
| `typescript-expert` | Só se o projeto passar a usar TypeScript ou tipagem em `.d.ts` |
| `design-system` | **Auditoria visual:** tokens (CSS variables), hierarquia tipográfica, ritmo de espaçamento, consistência de componentes, acessibilidade; modo “AI slop” para fugir de UI genérica |
| `browser-qa` | Depois de mudanças visuais: smoke (consola/rede), vitals, screenshots responsivos, acessibilidade (quando houver MCP/browser) |
| `click-path-audit` | Mapear botões/drawer/seletor de dia: estado final coerente com o prometido (útil com `app.js` monolítico) |
| `product-lens` | Enquadramento de produto/UX antes de redesenhar fluxos ou copy |

**Prioridade sugerida para “deixar o front muito melhor” (vanilla PWA):** (1) `frontend-design` + `design-system` → direcção visual e auditoria; (2) `progressive-web-app` → manifest, SW, offline/instalação; (3) `modern-javascript-patterns` + `coding-standards` → código DOM/`innerHTML` mais seguro e legível; (4) `documentation-lookup` para Chart.js se o gráfico evoluir; (5) `browser-qa` / `e2e-testing` para validar. `frontend-patterns` é sobretudo React/Next — usar só secções transponíveis (performance, acessibilidade, forms).

**Após greenfield (quando houver Supabase/Postgres):** passam a **aplicáveis** `postgres-patterns`, `database-migrations` (e `security-review` em RLS, webhooks, auth).

**Normalmente não aplicáveis** ao PWA vanilla **atual**: `flutter-dart-code-review`, `springboot-*`, `django-*`, `laravel-*`, `kotlin-*`, `rust-*`, etc.

**Nota:** Regras ou skills de **outros produtos** no perfil do utilizador não substituem este documento nem `.cursor/rules/pesca-plataforma-norte.mdc`.

#### Template comentário Bugbot (colar no PR deste repo)

Regra global: `%USERPROFILE%\.cursor\rules\global-bugbot-github-workflow.mdc`.

```text
bugbot run

Repo: Site-de-pesca — monorepo: apps/web (React/Vite/TS), packages/fishing-core, supabase/migrations, PWA legada na raiz.
Validar: erros lógicos, segurança (XSS, dados sensíveis, RPC/Supabase), TypeScript/React, testes (Vitest + Playwright smoke).
Alterações deste PR: <resumo em uma frase>.
```

---

## 🔄 Últimas alterações

| Data | Solicitação | O que foi feito | Arquivos |
|------|-------------|-----------------|----------|
| 2026-03-29 | Bugbot: regra **global** (perfil) | Criado **`%USERPROFILE%\.cursor\rules\global-bugbot-github-workflow.mdc`** (`alwaysApply: true`). Removido duplicado `.cursor/rules/bugbot-github-workflow.mdc` do repo. Referências e **template PR** em `PROJETO-STATUS`; `projeto-status-documentacao.mdc` e `pesca-plataforma-norte.mdc` apontam para a regra global. | Regra global fora do git; removido `bugbot-github-workflow.mdc`; `.cursor/rules/projeto-status-documentacao.mdc`, `.cursor/rules/pesca-plataforma-norte.mdc`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Remoto GitHub alinhado ao local + E2E | **`origin/main`:** monorepo greenfield (ver `git log`). **`.gitignore`:** `meu-projeto/`, `cpf.json` (pastas experimentais). **Playwright:** `playwright.config.ts`, `e2e/web-smoke.spec.ts`, `npm run test:e2e` (sobe `vite preview` em 4173); `npx playwright install chromium` na primeira máquina. | `.gitignore`, `package.json`, `package-lock.json`, `playwright.config.ts`, `e2e/web-smoke.spec.ts`, `README.md`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Continuar (prioridade: testes sem Supabase) | **`normalizeMemberCheckinCodeInput`** em `lib/memberCheckinCode.ts` (reutilizado em `AdminPresencePage`); **Vitest** em `apps/web` (`vitest.config.ts`, `src/lib/memberCheckinCode.test.ts`); scripts raiz **`test:web`** e **`test:all`** inclui web; README testes. | `apps/web/package.json`, `apps/web/vitest.config.ts`, `apps/web/src/lib/memberCheckinCode.ts`, `apps/web/src/lib/memberCheckinCode.test.ts`, `apps/web/src/pages/admin/AdminPresencePage.tsx`, `package.json`, `package-lock.json`, `README.md`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Continuar Marco 3 (prioridade agente) | **QR na `/carteirinha`:** dependência **`qrcode`**, geração client-side (`toDataURL`), fundo claro para scan; fallback em texto se falhar. **Batida staff:** `trim`, remove `\r`/`\n`, **maiúsculas** antes do RPC (compatível com colar resultado do leitor). | `apps/web/package.json`, `package-lock.json`, `apps/web/src/pages/MemberCheckinCodePage.tsx`, `apps/web/src/pages/admin/AdminPresencePage.tsx`, `apps/web/src/index.css`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Marco 3 (plano: staff + presença) | **Flags** `organizations.feature_flags`; tabela **`presence_events`**; colunas **`profiles.checkin_code`**; RPCs **`marco3_*`** (código sócio, batida staff, lista “presentes”). **UI:** rotas aninhadas `/admin` + `StaffRoute`, `AdminLayout`, `AdminPresencePage`, `MemberCheckinCodePage`; links no feed; convite dev **`marco3-collab-dev-token`**. **Remoto:** MCP **`execute_sql`** (blocos DDL + funções) + atualização org + perfil colaborador + convite. **Repo:** `supabase/migrations/20260329200000_marco3_staff_presence.sql`, `seed.sql`, `session.ts` (`isStaffSession` / `isMemberSession`), `package.json` descrição. | `supabase/migrations/20260329200000_marco3_staff_presence.sql`, `supabase/seed.sql`, `apps/web/src/App.tsx`, `apps/web/src/routes/StaffRoute.tsx`, `apps/web/src/pages/admin/*`, `apps/web/src/pages/MemberCheckinCodePage.tsx`, `apps/web/src/pages/FeedPage.tsx`, `apps/web/src/pages/InvitePage.tsx`, `apps/web/src/pages/HomeMarco1.tsx`, `apps/web/src/lib/session.ts`, `apps/web/src/index.css`, `package.json`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Marco 2 (plano greenfield) | **Feed** `/feed` com sessão em `localStorage` após convite (`pesca_session_v1`). **Post fixado:** métricas do índice via `@pesca/fishing-core` + fetch APIs (bundle em `plataformaBundle.ts`); minimizar com letreiro leve (respeita `prefers-reduced-motion`). **SQL:** `friendships`, `posts`, `post_likes`, `post_comments`; RPCs `marco2_feed_list`, `marco2_post_create`, `marco2_like_toggle`, `marco2_comment_add`, `marco2_comments_list`. **Remoto:** MCP `apply_migration` `marco2_social` + `marco2_social_rpcs` + `execute_sql` seed demo. **Core:** `coastIndex.ts` + testes. **Migrações repo:** ficheiros `20260329180000_marco2_social.sql` (tabelas/helpers) e `20260329180100_marco2_social_rpcs.sql` (RPCs). | `packages/fishing-core/src/coastIndex.ts`, `packages/fishing-core/tests/coastIndex.test.ts`, `packages/fishing-core/src/index.ts`, `apps/web/src/pages/FeedPage.tsx`, `apps/web/src/lib/plataformaBundle.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/App.tsx`, `apps/web/src/pages/InvitePage.tsx`, `apps/web/src/pages/HomeMarco1.tsx`, `apps/web/src/index.css`, `apps/web/package.json`, `apps/web/public/data/epagri-tides-2026.json`, `supabase/migrations/20260329180000_marco2_social.sql`, `supabase/migrations/20260329180100_marco2_social_rpcs.sql`, `supabase/seed.sql`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Projeto Supabase dedicado `pesca-plataforma-norte` + Marco 1 em `public` | **Limite free:** pausado `ikidptdajtzsqurcnlcp` (ND Fleet) para criar **`imyyiugqqioxmaxedkgn`** (`pesca-plataforma-norte`, `sa-east-1`). Migrações MCP: `marco1_foundation_tables` + `marco1_foundation_rpc`; seed dev; `apps/web/.env` atualizado. Ficheiros repo: `supabase/migrations/20260329120000_marco1_foundation.sql` e `seed.sql` alinhados (digest cast). **Restore Fleet:** MCP `restore_project` recusado (limite 2 ativos) — ação manual necessária | `supabase/migrations/20260329120000_marco1_foundation.sql`, `supabase/seed.sql`, `apps/web/.env`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Tentativa criar projeto Supabase “Pesca Plataforma Norte” (sa-east-1) | **Bloqueado inicialmente:** limite 2 projetos free; resolvido ao pausar projeto Fleet (ver linha acima) | — |
| 2026-03-29 | Supabase MCP: Marco 1 no projeto cloud `ikidptdajtzsqurcnlcp` | Migração ficheiro `public.*` **falhou** (`public.profiles` já existe — app ND Fleet). Aplicadas via MCP migrações **`marco1_foundation_pesca_m1_schema`** (schema **`pesca_m1`**) + **`fix_redeem_invite_digest_cast`** (`digest(..., 'sha256'::text)`, `search_path` com `extensions`). Seed equivalente em `pesca_m1`. RPC `public.redeem_invite_token` OK. Criado `apps/web/.env` com URL + anon (não commitar). | Remoto Supabase + `apps/web/.env`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Executar Marco 1 (plano greenfield) | Branch **`archive/legacy-pwa`**; monorepo (`package.json` workspaces); **`packages/fishing-core`**: TS + Vitest (maré EPAGRI); **`supabase/migrations/20260329120000_marco1_foundation.sql`** + **`seed.sql`** (token dev); **`apps/web`**: React 18 + Vite 6 + React Router + `@supabase/supabase-js`, páginas instalar PWA e convite (RPC), `manifest` + SW mínimo; **`vite.legacy.config.js`** + scripts `dev` / `dev:legacy` / `test:core` / `test:all`; `.gitignore` `.env` e `dist`; **README** atualizado; regra **`pesca-plataforma-norte.mdc`** com globs `apps/web/**` e `packages/fishing-core/**` | `package.json`, `package-lock.json`, `vite.legacy.config.js`, `apps/web/*`, `packages/fishing-core/*`, `supabase/*`, `.gitignore`, `README.md`, `.cursor/rules/pesca-plataforma-norte.mdc`, `docs/PROJETO-STATUS.md` |
| 2026-03-29 | Regras do projeto: aceder sempre ao PROJETO-STATUS, atualizar e pesquisar antes de implementar | `.cursor/rules/projeto-status-documentacao.mdc` reforçada: prioridade máxima; **sempre aceder** ao ficheiro no início da tarefa; secção **Pesquisar para implementar** (código no repo, docs/APIs, alinhamento com plano, skills); checklist explícito; proibição de implementar “à cega”; atualização automática do doc sem pedido explícito. `pesca-plataforma-norte.mdc` com remissão ao mesmo fluxo | `.cursor/rules/projeto-status-documentacao.mdc`, `.cursor/rules/pesca-plataforma-norte.mdc`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Regra global de documentação estrutural obrigatória | Criado `docs/PROJETO-STATUS.md` inicial; criada regra Cursor no projeto e regra global no utilizador para ler/atualizar este ficheiro sempre | `docs/PROJETO-STATUS.md`, `.cursor/rules/projeto-status-documentacao.mdc`, `%USERPROFILE%\.cursor\rules\global-projeto-status.mdc` |
| 2026-03-28 | Garantir regras, skills e documentação | Reforço nas regras global e de projeto: consulta obrigatória a `~/.cursor/skills/.../SKILL.md` quando o domínio corresponder; checklist final (regras + skills + PROJETO-STATUS); secção “o que o utilizador pode fazer” na regra global | `%USERPROFILE%\.cursor\rules\global-projeto-status.mdc`, `.cursor/rules/projeto-status-documentacao.mdc`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Verificar skills corretas e completar documentação | Adicionada **matriz Skills Cursor — aplicabilidade** em `docs/PROJETO-STATUS.md` (o quê usar para PWA estática vs o que evitar); regra `.cursor/rules/projeto-status-documentacao.mdc` atualizada com referência à matriz e exemplos alinhados aos nomes reais das pastas (`e2e-testing`, `tdd-workflow`, `python-patterns`) | `docs/PROJETO-STATUS.md`, `.cursor/rules/projeto-status-documentacao.mdc` |
| 2026-03-28 | Análise completa do sistema | Auditoria estática: secção **Estado do sistema (auditoria)** com o que funciona, riscos e falhas potenciais; tabela de problemas atualizada (ícones ausentes, CDN Chart.js, URL EPAGRI anual, refresh silencioso, gaps no JSON) | `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Localhost em modo debug para ver logs | Servidor local: `py -3 -m http.server 8080 --bind 127.0.0.1` na raiz do repo (cada GET aparece no terminal). **Modo debug na app:** URL com `?debug=1` → `console` com EPAGRI, falhas de `refreshLiveWeatherSnapshot` e registo do SW; sem `debug` o SW volta a falhar em silêncio no `catch` (só `?debug=1` mostra o erro) | `app.js`, `index.html`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Métricas não carregam / erros não aparecem | Pedidos **Open-Meteo e MET Norway não aparecem no log do `serve`** (só no browser); falha em **um** dia MET derrubava tudo (`Promise.all`); `fetch`/`JSON` com mensagens genéricas; `Chart` ausente derrubava o fluxo após dados | `fetchJson` com mensagens por serviço + falhas de rede; `loadAstroSeries` com **`Promise.allSettled`** e fallback por dia; `updateChart` se `Chart` indefinido não aborta a página; `fillDaySelect` vazio lança erro claro; **`console.error`** em `loadFixedLocation` | `app.js`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Verificação das métricas e da tábua EPAGRI | Documentada em **📐 Métricas, pontuações e tábua EPAGRI**: pipeline EPAGRI → `aligned.sea` → índice; limites (interpolação linear, fuso); ideias para site mais completo; corrigida menção MET para `allSettled` | `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Pacote completo maré/testes/SW/UI/README | Extraído **`js/tide-epagri.js`**; **Vitest** (`npm test`, 9 testes); **SW** `CORE_ASSETS` + ícones opcionais (`pesca-v16`); aviso UI + `console.error` no refresh falho; drawer (interpolação, fuso, MSL vs EPAGRI, índice relativo); **README** completo; `.gitignore` `node_modules` | `js/tide-epagri.js`, `app.js`, `sw.js`, `index.html`, `styles.css`, `tests/`, `package.json`, `vitest.config.js`, `README.md`, `.gitignore`, `.cursor/rules/pesca-plataforma-norte.mdc`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Comparar [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) com `~/.cursor/skills` | Clone em `%TEMP%\antigravity-awesome-skills-audit`; **126** skills locais vs **1319** no repo; **18** nomes em comum (case-insensitive). **Substituídas** só onde o remoto é claramente superior: `claude-api` (árvore oficial Anthropic + `python/`/`typescript/`/`shared`/LICENSE), `architecture-decision-records` (`SKILL.md` mais completo), `frontend-slides` (assets + scripts). **Mantidas** versões locais (ECC/community mais ricas ou workflows distintos): `e2e-testing`, `tdd-workflow`, `python-patterns`, `blueprint`, `deep-research`, `exa-search`, `videodb` e skills de domínio com deltas pequenos. **Novas instaladas** (curadas para PWA/JS, não as ~1301 restantes): `progressive-web-app`, `playwright-skill`, `frontend-design`, `systematic-debugging`, `typescript-expert`, `modern-javascript-patterns`. Backups: `claude-api.bak-*`, `frontend-slides.bak-*`, `architecture-decision-records/SKILL.md.bak-*` em `%USERPROFILE%\.cursor\skills` | Nenhuma alteração de código no repo; este ficheiro e ambiente global Cursor |
| 2026-03-28 | Quais skills usar para melhorar o front | Verificação em `~/.cursor/skills`: matriz alargada com `design-system`, `browser-qa`, `click-path-audit`, `product-lens` e **prioridade sugerida** (design → PWA → JS/código → Chart.js → QA/E2E); nota de que `frontend-patterns` é centrada em React/Next | `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Aplicar melhorias de front na ordem combinada | **Design system:** tokens de espaçamento/transição/foco em `styles.css`; paleta e gradientes “cais costeiro”; cartões, hero, rodapé, gaveta; `prefers-reduced-motion`. **A11y:** skip link, `tabindex="-1"` + foco no `<main>` após carga. **PWA:** `offline.html`; SW `pesca-v17` com fallback HTML → `offline.html`; `manifest.json` (`id`, `categories`, `theme`/`background`). **JS:** `escapeHtml` em listas/grades/tábua/pesos; cores Chart alinhadas ao tema | `styles.css`, `index.html`, `offline.html`, `sw.js`, `manifest.json`, `app.js`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Site confuso, muita informação; público simples na plataforma | **Cartão principal** com `simpleVerdictWords` (BOM / MAIS OU MENOS / FRACO / RUIM), frase curta, nota 0–100 em linguagem simples, **2 motivos** (`htmlToPlain` + melhor hora) e sugestão de faixa horária. **Removido** cartão de coordenadas no topo; **hero** orientado à pergunta “está bom para pescar?”. **`<details>`** agrupam: tempo agora; pormenores do dia (antigo bloco recomendações); gráfico + hora a hora; outros dias + grelha técnica. **Drawer** encurtado. SW **`pesca-v18`** | `index.html`, `styles.css`, `app.js`, `sw.js`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Hero rico, tempo em tempo real, métricas laterais, dia mais completo | **Hero:** duas linhas de boas-vindas + strip com data por extenso e tempo (hoje = atual do modelo; outros dias = hora representativa). **Gaveta Métricas:** botão na barra de marca, rail com saltos de secção, corpos `metricsOverviewBody` / `metricsFishBody` / lista horária espelhada, solunar + tábua EPAGRI também na gaveta. **Lista horária:** acordeão com índice, atividade dos peixes (estimativa), métricas da hora e “porquê”; `rerenderAllHourlyLists` no dia, no refresh e na ordem “melhor/hora”. **CSS** para strip, chips, acordeão, gaveta. **Escape** fecha métricas antes do menu info. SW **`pesca-v19`** | `index.html`, `styles.css`, `app.js`, `sw.js`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Ideia “Instagram” / comunidade na plataforma | Utilizador descreveu: login, feed de fotos (visibilidade todos vs amigos), amizades, comentários, inquéritos curtos por **geofence** na Plataforma Norte (isca, percepção do dia, atividade), agregações tipo “melhor isca do dia”. **Registado** em visão futura + pendências: exige stack com backend, políticas de privacidade e moderação; mantém-se PWA estática até decisão explícita | `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Estrutura para Firebase/Supabase sem ligação ainda | Pasta **`js/social/`**: constantes (coordenadas + geofence + iscas), **validação** testada, **geofence** Haversine, **agregação** de votos, **mockBackend** (localStorage), stubs **firebaseAdapter** / **supabaseAdapter**, **socialShell** (tabs Feed/Publicar/Inquérito/Amigos/Eu), **`bootstrap.js`** com `SOCIAL_BACKEND`. **`escapeHtml`** em `js/utils/escapeHtml.js` (import em `app.js`). **index:** secção `#socialAppRoot`, link **Comunidade**. **CSS** comunidade. **Testes** Vitest `tests/social-*.test.js`. SW **`pesca-v20`** | `app.js`, `index.html`, `styles.css`, `sw.js`, `js/utils/`, `js/social/`, `tests/`, `README.md`, `docs/PROJETO-STATUS.md` |
| 2026-03-28 | Documentar estado do plano e decisões para chats futuros | Adicionada secção **🧭 Estado do plano de produto** com “onde estamos”, síntese de decisões (Instagram, greenfield, auth, dependentes, privacidade, DMs, PWA onboarding, QR/portaria, pagamentos, ranking, skills), pendências de decisão técnica, e **regra obrigatória**: cada decisão nova atualiza este ficheiro + plano `.cursor/plans/…` (ou `docs/PLANO-PRODUTO-FUTURO.md`). Plano detalhado continua em `plataforma_instagram_ux_f6049e26.plan.md`. Corrigida menção SW para **`pesca-v20`**. Matriz skills: nota para `postgres-patterns` / `database-migrations` pós-greenfield | `docs/PROJETO-STATUS.md` |

---

## 🐞 Problemas identificados

| ID | Descrição | Severidade | Notas |
|----|-----------|------------|-------|
| ~~P1~~ | ~~README vazio~~ | — | **Resolvido:** README com execução local, testes e link ao PROJETO-STATUS |
| P2 | Ícones PNG podem faltar no clone | Baixa | SW instala sem eles; **PWA** idealmente com ficheiros em `icons/` para “Adicionar ao ecrã” |
| P3 | Chart.js só via CDN externo | Média | Gráfico omitido se CDN falhar; resto da app carrega |
| P4 | `EPAGRI_TIDES_URL` fixo em `epagri-tides-2026.json` | Média | Novo ano → JSON + constante + `CORE_ASSETS` no `sw.js` |
| ~~P5~~ | ~~Refresh sem feedback na UI~~ | — | **Resolvido:** mensagem sob “Tempo agora” + `console.error` |
| P6 | Gaps em `extremesByDate` (dias sem entrada) | Baixa | Fallback ao modelo nessas horas |

*Validação: `npm test` (Vitest) a passar nesta sessão; resto por revisão de código.*

---

## ✅ Correções aplicadas

| Data | Problema | Causa raiz | Como foi corrigido |
|------|----------|------------|-------------------|
| 2026-03-28 | Depuração local / visibilidade de falhas | Erros do refresh e do SW sem feedback; EPAGRI falha em silêncio | Parâmetro **`?debug=1`**: logs na consola (EPAGRI, `refreshLiveWeatherSnapshot`, registo do SW); terminal do `http.server` mostra **404** (ex.: ícones) |
| 2026-03-28 | Falha total se MET Norway falhar ou mensagens opacas | `Promise.all` em astro; erros pouco descritivos | Mensagens por API em `fetchJson`; astro por dia com **`allSettled`**; `console.error` no carregamento principal; gráfico sem Chart não bloqueia |
| 2026-03-28 | SW quebrava com 404 nos ícones; maré só em `app.js`; refresh invisível | `addAll` com ícones obrigatórios; sem testes da interpolação | **`CORE_ASSETS` / opcionais** no `sw.js`; módulo **`js/tide-epagri.js`** + **`npm test`**; aviso de refresh falho na UI |
| 2026-03-28 | Copy pouco claro sobre interpolação e índice | Risco de interpretação errada | Drawer: linear vs harmónico; fuso; EPAGRI vs MSL; índice relativo à janela |
| 2026-03-28 | `innerHTML` com dados de APIs | Teoricamente conteúdo inesperado no JSON | Função **`escapeHtml`** aplicada a texto dinâmico (alertas severos, células “tempo agora”, explicações hora a hora, tábua maré, pesos, resumo) |

---

## ⏳ Pendências

- **Opcional (P2):** commit de `icons/icon-192.png` e `icon-512.png` para melhor instalação PWA.
- Renovar `data/epagri-tides-*.json` quando houver tábua oficial nova (ex.: ano seguinte) mantendo formato esperado por `app.js` e lista `CORE_ASSETS` no `sw.js`.
- Testes manuais periódicos: bloco “Tempo agora”, lista hora a hora, gráfico, recomendações, consola (CORS/4xx), atualização de `sw.js`.
- **Opcional (P3):** empacotar Chart.js localmente ou incluir no precache para offline do gráfico.
- **Opcional:** mais testes (E2E Playwright) para fluxo de carga e `loadFixedLocation`; comando já documentado: `npm test` para maré.
- **Opcional:** alinhar regra global do utilizador (`global-projeto-status.mdc`) se quiser menção explícita a “projetos estáticos” — hoje a matriz neste ficheiro já desambigua o Site-de-pesca.
- **Opcional (skills):** o repositório antigravity tem **~1301** pastas com nomes que ainda não existem em `~/.cursor/skills`. Não foram instaladas em massa; para mais cobertura, usar `npx antigravity-awesome-skills --cursor` ou escolher bundles no próprio repo. Reverter substituições: restaurar pastas `*.bak-*` / `SKILL.md.bak-*` criadas em 2026-03-28.
- **Pós–Marco 3 (produto):** UI “Instagram” mais rica (mídia, composer); moderar comentários; rate limit nas RPCs; **E2E** alargado (convite real → feed → carteirinha → batida staff com Supabase de teste); modo **invisível** para pares; painel **`apps/admin`** separado se o deploy staff for distinto. **Já há:** smoke Playwright em rotas públicas (`npm run test:e2e`).
- **Marco 3b (plano):** mensalidades, batidas avançadas, logs, **PSP** — ver secção “Mensalidade e pagamentos” no plano Cursor; PSP ainda por decidir (BR).
- **Auth sócio:** evoluir de `profile_id` + `device_id` nas RPCs para **Supabase Auth** (ou JWT próprio) e **RLS** com `auth.uid()` mapeado a `profiles`; manter RPCs como fachada opcional.
- **Opcional:** criar `docs/PLANO-PRODUTO-FUTURO.md` com cópia do plano Cursor para repositórios sem `.cursor/plans` partilhado.
- **ND Fleet / Supabase:** projeto **`ikidptdajtzsqurcnlcp`** está **INACTIVE** (pausado). Para reativar: no [dashboard Supabase](https://supabase.com/dashboard) **pausar** temporariamente `pesca-plataforma-norte` **ou** fazer upgrade do plano **ou** apagar um projeto, depois **Restore** no Fleet — não é possível ter **dois ativos** no free sem ajuste.
- **Schema `pesca_m1`:** ficou no projeto Fleet pausado (legado); o projeto **pesca-plataforma-norte** usa só **`public`**. Opcional: após reativar Fleet, executar `DROP SCHEMA IF EXISTS pesca_m1 CASCADE;` se não precisares do Marco 1 antigo lá.
- **JWT / sessão app:** Marco 2 grava **`pesca_session_v1`** em `localStorage` (`profile_id`, `organization_id`, `role_id`, `display_name`, `device_id`) após convite; RPCs sociais enviam `profile_id` + `device_id`. **Sessão JWT** ou Supabase Auth para sócios + RLS por `auth.uid()` fica para iteração seguinte.
- **PSP (pagamentos BR):** ainda por decidir (fase Marco 3b).
- **Remover** UI/mock `js/social/` e PWA legada só após paridade no greenfield (não apagar na pressa).
- **Futuro — produto:** não misturar agregados da comunidade com o índice do modelo sem rótulo claro (“o que a comunidade disse” vs “o que o modelo calculou”).

---

*Documento mantido pelo agente conforme regra global: leitura antes de alterações, atualização após cada ação relevante.*
