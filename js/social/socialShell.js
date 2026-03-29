import { escapeHtml } from '../utils/escapeHtml.js';
import { BAIT_OPTIONS, PLATFORM_GEOFENCE_RADIUS_M, PLATFORM_LAT, PLATFORM_LON, VISIBILITY } from './constants.js';
import { isInsideGeofence } from './geofence.js';

const TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'post', label: 'Publicar' },
  { id: 'survey', label: 'Inquérito' },
  { id: 'friends', label: 'Amigos' },
  { id: 'me', label: 'Eu' },
];

/**
 * @param {HTMLElement} root
 * @param {{ backend: object }} ctx
 */
export function mountSocialApp(root, ctx) {
  const { backend } = ctx;
  let tab = 'feed';
  let geoOk = null;
  let geoLat = null;
  let geoLon = null;

  function fmtTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  async function refresh() {
    const session = await backend.getSession().catch(() => ({ user: null }));
    const user = session.user;
    const feed = user ? await backend.listFeed().catch(() => ({ ok: false, posts: [] })) : { ok: true, posts: [] };
    const posts = feed.ok ? feed.posts : [];
    const friendsRes = user ? await backend.listFriends().catch(() => ({ friends: [] })) : { friends: [] };
    const agg = await backend.getAggregatesToday().catch(() => ({ top: null, total: 0 }));

    const feedHtml = await buildFeedHtml(posts, user, backend);
    const composerHtml = buildComposerHtml(user);
    const surveyHtml = buildSurveyHtml(user, geoOk);
    const friendsHtml = buildFriendsHtml(user, friendsRes.friends || []);
    const meHtml = buildMeHtml(user);
    const aggHtml = buildAggHtml(agg);

    root.innerHTML = `
      <div class="social-demo-banner" role="status">
        <strong>Modo demonstração (local).</strong> Dados guardados só neste navegador. Firebase/Supabase: altere
        <code class="social-code">js/social/bootstrap.js</code> quando for ligar o servidor.
      </div>
      <div class="social-head-row">
        <div>
          <h2 class="social-title">Comunidade — Plataforma Norte</h2>
          <p class="muted small social-sub">Partilhas, amigos e inquéritos curtos (quando ligar ao backend, com moderação e LGPD).</p>
        </div>
      </div>
      ${aggHtml}
      <div class="social-tabs" role="tablist" aria-label="Secções da comunidade">
        ${TABS.map(
          (t) => `
          <button type="button" role="tab" class="social-tab ${tab === t.id ? 'is-active' : ''}" data-tab="${escapeHtml(t.id)}" aria-selected="${tab === t.id}">
            ${escapeHtml(t.label)}
          </button>`
        ).join('')}
      </div>
      <div class="social-panels">
        <div class="social-panel ${tab === 'feed' ? '' : 'hidden'}" role="tabpanel" data-panel="feed">${feedHtml}</div>
        <div class="social-panel ${tab === 'post' ? '' : 'hidden'}" role="tabpanel" data-panel="post">${composerHtml}</div>
        <div class="social-panel ${tab === 'survey' ? '' : 'hidden'}" role="tabpanel" data-panel="survey">${surveyHtml}</div>
        <div class="social-panel ${tab === 'friends' ? '' : 'hidden'}" role="tabpanel" data-panel="friends">${friendsHtml}</div>
        <div class="social-panel ${tab === 'me' ? '' : 'hidden'}" role="tabpanel" data-panel="me">${meHtml}</div>
      </div>
    `;

    wire(root, user, backend);
  }

  async function buildFeedHtml(posts, user, be) {
    if (!user) {
      return `<p class="muted">Inicie sessão no separador <strong>Eu</strong> para ver o feed e comentar.</p>`;
    }
    if (!posts.length) {
      return `<p class="muted">Ainda não há publicações visíveis para ti. Publica algo no separador <strong>Publicar</strong>.</p>`;
    }
    const parts = [];
    for (const p of posts) {
      const name = p.authorDisplayName || 'Pescador';
      const vis = p.visibility === VISIBILITY.FRIENDS ? 'Só amigos' : 'Público';
      const commentsRes = await be.listComments(p.id);
      const cc = commentsRes.ok ? commentsRes.comments : [];
      const commentsHtml = cc
        .map((c) => {
          const cn = c.authorDisplayName || 'Pescador';
          return `<li class="social-comment"><span class="social-comment-author">${escapeHtml(cn)}</span> <span class="muted">${escapeHtml(fmtTime(c.createdAt))}</span><br/>${escapeHtml(c.text)}</li>`;
        })
        .join('');
      parts.push(`
        <article class="social-post" data-post-id="${escapeHtml(p.id)}">
          <div class="social-post-head">
            <span class="social-post-emoji" aria-hidden="true">${p.imagePlaceholder || '🎣'}</span>
            <div>
              <strong>${escapeHtml(name)}</strong>
              <span class="muted small"> · ${escapeHtml(vis)} · ${escapeHtml(fmtTime(p.createdAt))}</span>
              <p class="social-post-caption">${escapeHtml(p.caption) || '<span class="muted">(sem legenda)</span>'}</p>
            </div>
          </div>
          <ul class="social-comments">${commentsHtml || '<li class="muted">Sem comentários ainda.</li>'}</ul>
          <form class="social-comment-form" data-post-id="${escapeHtml(p.id)}">
            <label class="visually-hidden" for="c_${escapeHtml(p.id)}">Comentário</label>
            <input type="text" class="social-input social-input-inline" id="c_${escapeHtml(p.id)}" name="text" maxlength="280" placeholder="Escreva um comentário…" />
            <button type="submit" class="btn social-btn">Enviar</button>
          </form>
        </article>
      `);
    }
    return parts.join('');
  }

  function buildComposerHtml(user) {
    if (!user) {
      return `<p class="muted">Inicie sessão no separador <strong>Eu</strong>.</p>`;
    }
    return `
      <form id="socialPostForm" class="social-form">
        <label class="social-label" for="socialCaption">Legenda (opcional)</label>
        <textarea id="socialCaption" name="caption" class="social-input social-textarea" maxlength="500" rows="3" placeholder="O que pegou, condições, dica…"></textarea>
        <label class="social-label" for="socialVis">Quem vê</label>
        <select id="socialVis" name="visibility" class="social-input">
          <option value="public">Todos</option>
          <option value="friends">Só amigos</option>
        </select>
        <p class="muted small">Foto de verdade virá com Firebase/Storage ou Supabase — aqui só simulamos o cartão.</p>
        <button type="submit" class="btn social-btn-primary">Publicar (demo)</button>
        <p id="socialPostMsg" class="social-form-msg" role="status"></p>
      </form>
    `;
  }

  function buildSurveyHtml(user, geo) {
    if (!user) {
      return `<p class="muted">Inicie sessão no separador <strong>Eu</strong>.</p>`;
    }
    const geoMsg =
      geo === true
        ? `<p class="social-geo social-geo-ok">GPS: parece que estás por perto da plataforma (≤ ${PLATFORM_GEOFENCE_RADIUS_M} m). Inquérito desbloqueado.</p>`
        : geo === false
          ? `<p class="social-geo social-geo-warn">GPS: fora da zona da plataforma ou permissão negada — podes responder na mesma <strong>só em demonstração</strong>. Com backend, isto pode ser obrigatório para contar na estatística “do cais”.</p>`
          : `<p class="muted small">Toque em “Usar localização” abaixo para simular o geofence (${PLATFORM_GEOFENCE_RADIUS_M} m em torno da Plataforma Norte).</p>`;

    const baitOpts = BAIT_OPTIONS.map(
      (b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.label)}</option>`
    ).join('');

    return `
      ${geoMsg}
      <button type="button" class="btn social-btn" id="socialGeoBtn">Usar localização</button>
      <p class="muted small">Coordenadas de referência: ${PLATFORM_LAT}, ${PLATFORM_LON}</p>
      <form id="socialSurveyForm" class="social-form">
        <fieldset class="social-fieldset">
          <legend class="social-legend">Hoje</legend>
          <label class="social-radio"><input type="radio" name="fishing" value="yes" checked /> Estou a pescar na plataforma</label>
          <label class="social-radio"><input type="radio" name="fishing" value="no" /> Não estou a pescar agora</label>
        </fieldset>
        <label class="social-label" for="socialBait">Melhor isca <span class="muted">(na tua experiência hoje)</span></label>
        <select id="socialBait" name="bait" class="social-input" required>${baitOpts}</select>
        <label class="social-label" for="socialDayRate">Como está o dia para pesca? (1–5)</label>
        <input type="number" id="socialDayRate" name="dayRating" class="social-input" min="1" max="5" value="3" required />
        <label class="social-label" for="socialWater">Atividade / água (1–5)</label>
        <input type="number" id="socialWater" name="waterActivity" class="social-input" min="1" max="5" value="3" required />
        <button type="submit" class="btn social-btn-primary">Enviar inquérito</button>
        <p id="socialSurveyMsg" class="social-form-msg" role="status"></p>
      </form>
    `;
  }

  function buildFriendsHtml(user, friends) {
    if (!user) {
      return `<p class="muted">Inicie sessão no separador <strong>Eu</strong>.</p>`;
    }
    const list = friends.length
      ? `<ul class="social-friend-list">${friends.map((f) => `<li><strong>${escapeHtml(f.displayName)}</strong> <span class="muted small">${escapeHtml(f.email)}</span></li>`).join('')}</ul>`
      : `<p class="muted">Ainda sem amigos. Adiciona pelo e-mail de alguém que já tenha conta de demonstração.</p>`;
    return `
      ${list}
      <form id="socialFriendForm" class="social-form">
        <label class="social-label" for="socialFriendEmail">E-mail do pescador</label>
        <input type="email" id="socialFriendEmail" class="social-input" placeholder="amigo@exemplo.br" required />
        <button type="submit" class="btn social-btn-primary">Adicionar amigo (demo aceita logo)</button>
        <p id="socialFriendMsg" class="social-form-msg" role="status"></p>
      </form>
    `;
  }

  function buildMeHtml(user) {
    if (!user) {
      return `
        <form id="socialLoginForm" class="social-form">
          <p class="muted small">Conta de demonstração — sem Firebase/Supabase ainda.</p>
          <label class="social-label" for="socialEmail">E-mail</label>
          <input type="email" id="socialEmail" class="social-input" autocomplete="username" required />
          <label class="social-label" for="socialPass">Palavra-passe</label>
          <input type="password" id="socialPass" class="social-input" autocomplete="current-password" minlength="4" required />
          <button type="submit" class="btn social-btn-primary">Entrar</button>
          <p id="socialLoginMsg" class="social-form-msg" role="status"></p>
        </form>
      `;
    }
    return `
      <p>Olá, <strong>${escapeHtml(user.displayName)}</strong></p>
      <p class="muted small">${escapeHtml(user.email)}</p>
      <form id="socialNameForm" class="social-form">
        <label class="social-label" for="socialDisplayName">Nome público</label>
        <input type="text" id="socialDisplayName" class="social-input" value="${escapeHtml(user.displayName)}" maxlength="40" />
        <button type="submit" class="btn social-btn">Guardar nome</button>
        <p id="socialNameMsg" class="social-form-msg" role="status"></p>
      </form>
      <button type="button" class="btn social-btn-ghost" id="socialLogoutBtn">Sair</button>
    `;
  }

  function buildAggHtml(agg) {
    const top = agg.top;
    const line = top
      ? `<strong>Hoje (${escapeHtml(agg.dateKey || '')})</strong>: a isca mais citada na comunidade (demo) é <em>${escapeHtml(top.label)}</em> (${top.count} ${top.count === 1 ? 'resposta' : 'respostas'}, ${agg.total} no total).`
      : '<strong>Hoje (demo):</strong> ainda sem respostas no inquérito — envia uma no separador Inquérito.';
    return `<div class="social-agg-card" aria-live="polite"><p class="social-agg-text">${line}</p></div>`;
  }

  function wire(el, user, be) {
    el.querySelectorAll('.social-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.getAttribute('data-tab') || 'feed';
        refresh();
      });
    });

    el.querySelector('#socialGeoBtn')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        geoOk = false;
        refresh();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geoLat = pos.coords.latitude;
          geoLon = pos.coords.longitude;
          geoOk = isInsideGeofence(geoLat, geoLon, PLATFORM_LAT, PLATFORM_LON, PLATFORM_GEOFENCE_RADIUS_M);
          refresh();
        },
        () => {
          geoOk = false;
          refresh();
        },
        { enableHighAccuracy: true, timeout: 12_000 }
      );
    });

    el.querySelector('#socialLoginForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = el.querySelector('#socialLoginMsg');
      const email = /** @type {HTMLInputElement} */ (el.querySelector('#socialEmail')).value;
      const pass = /** @type {HTMLInputElement} */ (el.querySelector('#socialPass')).value;
      const r = await be.signIn(email, pass);
      if (msg) msg.textContent = r.ok ? 'Sessão iniciada.' : r.errors?.join(' ') || 'Erro.';
      refresh();
    });

    el.querySelector('#socialLogoutBtn')?.addEventListener('click', async () => {
      await be.signOut();
      refresh();
    });

    el.querySelector('#socialNameForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = el.querySelector('#socialNameMsg');
      const name = /** @type {HTMLInputElement} */ (el.querySelector('#socialDisplayName')).value;
      const r = await be.updateProfile(name);
      if (msg) msg.textContent = r.ok ? 'Nome atualizado.' : r.errors?.join(' ') || 'Erro.';
      refresh();
    });

    el.querySelector('#socialPostForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = el.querySelector('#socialPostMsg');
      const caption = /** @type {HTMLTextAreaElement} */ (el.querySelector('#socialCaption')).value;
      const visibility = /** @type {HTMLSelectElement} */ (el.querySelector('#socialVis')).value;
      const r = await be.createPost({ caption, visibility });
      if (msg) msg.textContent = r.ok ? 'Publicado (só neste navegador).' : r.errors?.join(' ') || 'Erro.';
      if (r.ok) {
        /** @type {HTMLFormElement} */ (ev.target).reset();
      }
      refresh();
    });

    el.querySelector('#socialSurveyForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = el.querySelector('#socialSurveyMsg');
      const fd = new FormData(/** @type {HTMLFormElement} */ (ev.target));
      const fishing = fd.get('fishing') === 'yes';
      const baitId = String(fd.get('bait') || '');
      const dayRating = fd.get('dayRating');
      const waterActivity = fd.get('waterActivity');
      const r = await be.submitSurvey(baitId, fishing, dayRating, waterActivity);
      if (msg) msg.textContent = r.ok ? 'Obrigado — contou para a estatística do dia (demo).' : r.errors?.join(' ') || 'Erro.';
      refresh();
    });

    el.querySelector('#socialFriendForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = el.querySelector('#socialFriendMsg');
      const email = /** @type {HTMLInputElement} */ (el.querySelector('#socialFriendEmail')).value;
      const r = await be.requestFriendByEmail(email);
      if (msg) msg.textContent = r.ok ? 'Amigo adicionado (demo).' : r.errors?.join(' ') || 'Erro.';
      refresh();
    });

    el.querySelectorAll('.social-comment-form').forEach((form) => {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const postId = form.getAttribute('data-post-id');
        const input = form.querySelector('input[name="text"]');
        const text = input instanceof HTMLInputElement ? input.value : '';
        const r = await be.addComment(postId, text);
        if (!r.ok && r.errors) {
          window.alert(r.errors.join(' '));
        }
        if (r.ok && input) input.value = '';
        refresh();
      });
    });
  }

  refresh();
}
