import { VISIBILITY, FRIEND_STATUS } from '../constants.js';
import {
  validateComment,
  validateDisplayName,
  validateEmailLoose,
  validateNewPost,
  validateSurveyPayload,
} from '../validation.js';
import { aggregateBaitVotes } from '../aggregate.js';
import { BAIT_OPTIONS } from '../constants.js';

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Backend em memória + localStorage opcional — espelha o contrato dos adaptadores remotos.
 * @param {{ storageKey?: string, persist?: boolean }} [opts]
 */
export function createMockBackend(opts = {}) {
  const storageKey = opts.storageKey ?? 'pesca_social_mock_v1';
  const persist = opts.persist !== false && typeof localStorage !== 'undefined';

  let data = loadInitial();

  function loadInitial() {
    if (!persist) return seedData();
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') return normalizePersisted(p);
      }
    } catch {
      /* ignore */
    }
    const s = seedData();
    save(s);
    return s;
  }

  function save(next) {
    data = next;
    if (!persist) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      /* quota */
    }
  }

  function normalizePersisted(p) {
    return {
      users: Array.isArray(p.users) ? p.users : [],
      posts: Array.isArray(p.posts) ? p.posts : [],
      comments: Array.isArray(p.comments) ? p.comments : [],
      friendships: Array.isArray(p.friendships) ? p.friendships : [],
      surveys: Array.isArray(p.surveys) ? p.surveys : [],
      sessionUserId: p.sessionUserId ?? null,
    };
  }

  function seedData() {
    const u1 = { id: 'u_seed_1', email: 'maria@exemplo.br', displayName: 'Maria (demo)', createdAt: new Date().toISOString() };
    const u2 = { id: 'u_seed_2', email: 'joao@exemplo.br', displayName: 'João (demo)', createdAt: new Date().toISOString() };
    return {
      users: [u1, u2],
      posts: [
        {
          id: 'p_seed_1',
          authorId: u1.id,
          caption: 'Peixe bonito hoje de manhã — só para mostrar o feed de demonstração.',
          visibility: VISIBILITY.PUBLIC,
          imagePlaceholder: '🐟',
          createdAt: new Date().toISOString(),
        },
      ],
      comments: [
        { id: 'c_seed_1', postId: 'p_seed_1', authorId: u2.id, text: 'Boa! Água limpa aí?', createdAt: new Date().toISOString() },
      ],
      friendships: [{ a: u1.id, b: u2.id, status: FRIEND_STATUS.ACCEPTED }],
      surveys: [],
      sessionUserId: null,
    };
  }

  function getUser(id) {
    return data.users.find((u) => u.id === id) || null;
  }

  function areFriends(aId, bId) {
    if (aId === bId) return true;
    return data.friendships.some(
      (f) =>
        f.status === FRIEND_STATUS.ACCEPTED &&
        ((f.a === aId && f.b === bId) || (f.a === bId && f.b === aId))
    );
  }

  return {
    /** @returns {Promise<{ user: object | null }>} */
    async getSession() {
      const user = data.sessionUserId ? getUser(data.sessionUserId) : null;
      return { user };
    },

    /** Demo: aceita e-mail válido + palavra-passe ≥ 4 caracteres; cria ou reutiliza utilizador. */
    async signIn(emailRaw, passwordRaw) {
      const ve = validateEmailLoose(emailRaw);
      if (!ve.ok) return { ok: false, errors: ve.errors };
      const pw = typeof passwordRaw === 'string' ? passwordRaw : '';
      if (pw.length < 4) return { ok: false, errors: ['Em demonstração: use palavra-passe com pelo menos 4 caracteres.'] };

      let u = data.users.find((x) => x.email === ve.value);
      if (!u) {
        u = {
          id: uid('u'),
          email: ve.value,
          displayName: ve.value.split('@')[0],
          createdAt: new Date().toISOString(),
        };
        save({ ...data, users: [...data.users, u] });
      }
      save({ ...data, sessionUserId: u.id });
      return { ok: true, user: u };
    },

    async signOut() {
      save({ ...data, sessionUserId: null });
      return { ok: true };
    },

    async updateProfile(displayNameRaw) {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      if (!me) return { ok: false, errors: ['Inicie sessão primeiro.'] };
      const vd = validateDisplayName(displayNameRaw);
      if (!vd.ok) return { ok: false, errors: vd.errors };
      const users = data.users.map((u) => (u.id === me.id ? { ...u, displayName: vd.value } : u));
      save({ ...data, users });
      return { ok: true, user: getUser(me.id) };
    },

    /** @param {{ caption?: string, visibility?: string }} payload */
    async createPost(payload) {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      if (!me) return { ok: false, errors: ['Inicie sessão para publicar.'] };
      const vp = validateNewPost(payload?.caption ?? '', payload?.visibility);
      if (!vp.ok) return { ok: false, errors: vp.errors };
      const post = {
        id: uid('p'),
        authorId: me.id,
        caption: vp.value.caption,
        visibility: vp.value.visibility,
        imagePlaceholder: '🎣',
        createdAt: new Date().toISOString(),
      };
      save({ ...data, posts: [post, ...data.posts] });
      return { ok: true, post };
    },

    async listFeed() {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      const visible = data.posts.filter((p) => {
        if (p.visibility === VISIBILITY.PUBLIC) return true;
        if (!me) return false;
        return areFriends(me.id, p.authorId) || p.authorId === me.id;
      });
      const sorted = visible.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const posts = sorted.map((p) => ({
        ...p,
        authorDisplayName: getUser(p.authorId)?.displayName ?? 'Pescador',
      }));
      return { ok: true, posts };
    },

    async listComments(postId) {
      const list = data.comments
        .filter((c) => c.postId === postId)
        .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
        .map((c) => ({
          ...c,
          authorDisplayName: getUser(c.authorId)?.displayName ?? 'Pescador',
        }));
      return { ok: true, comments: list };
    },

    async addComment(postId, textRaw) {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      if (!me) return { ok: false, errors: ['Inicie sessão para comentar.'] };
      const vc = validateComment(textRaw);
      if (!vc.ok) return { ok: false, errors: vc.errors };
      const c = {
        id: uid('c'),
        postId,
        authorId: me.id,
        text: vc.value,
        createdAt: new Date().toISOString(),
      };
      save({ ...data, comments: [...data.comments, c] });
      return { ok: true, comment: c };
    },

    /** Pedido de amizade por e-mail de utilizador existente */
    async requestFriendByEmail(emailRaw) {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      if (!me) return { ok: false, errors: ['Inicie sessão.'] };
      const ve = validateEmailLoose(emailRaw);
      if (!ve.ok) return { ok: false, errors: ve.errors };
      const target = data.users.find((u) => u.email === ve.value);
      if (!target) return { ok: false, errors: ['Não encontrámos utilizador com esse e-mail (ainda é só demonstração local).'] };
      if (target.id === me.id) return { ok: false, errors: ['Não pode ser amigo de si mesmo.'] };
      const exists = data.friendships.some(
        (f) => (f.a === me.id && f.b === target.id) || (f.a === target.id && f.b === me.id)
      );
      if (exists) return { ok: false, errors: ['Pedido ou amizade já existe.'] };
      save({
        ...data,
        friendships: [...data.friendships, { a: me.id, b: target.id, status: FRIEND_STATUS.ACCEPTED }],
      });
      return { ok: true };
    },

    async listFriends() {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      if (!me) return { ok: true, friends: [] };
      const ids = new Set();
      for (const f of data.friendships) {
        if (f.status !== FRIEND_STATUS.ACCEPTED) continue;
        if (f.a === me.id) ids.add(f.b);
        else if (f.b === me.id) ids.add(f.a);
      }
      const friends = data.users.filter((u) => ids.has(u.id));
      return { ok: true, friends };
    },

    async submitSurvey(baitId, fishingToday, dayRating, waterActivity) {
      const me = data.sessionUserId ? getUser(data.sessionUserId) : null;
      if (!me) return { ok: false, errors: ['Inicie sessão para enviar o inquérito.'] };
      const vs = validateSurveyPayload(baitId, fishingToday, dayRating, waterActivity);
      if (!vs.ok) return { ok: false, errors: vs.errors };
      const row = {
        id: uid('s'),
        userId: me.id,
        dateKey: todayKey(),
        ...vs.value,
        createdAt: new Date().toISOString(),
      };
      save({ ...data, surveys: [...data.surveys, row] });
      return { ok: true, survey: row };
    },

    async getAggregatesToday() {
      const dk = todayKey();
      const rows = data.surveys.filter((s) => s.dateKey === dk);
      const agg = aggregateBaitVotes(rows, BAIT_OPTIONS, 1);
      return { ok: true, dateKey: dk, ...agg };
    },

    /** Para testes / reset */
    _dangerReset() {
      const s = seedData();
      save(s);
    },
  };
}
