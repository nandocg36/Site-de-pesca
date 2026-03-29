import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadPlataformaPinnedSnapshot, type PlataformaPinnedSnapshot } from '../lib/plataformaBundle';
import { clearSession, isMemberSession, isStaffSession, loadSession, type PescaSession } from '../lib/session';
import { supabase, supabaseConfigured } from '../lib/supabase';

type FeedPostRow = {
  id: string;
  author_profile_id: string;
  author_display_name: string | null;
  body: string | null;
  media_url: string | null;
  visibility: string;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
};

type CommentRow = {
  id: string;
  author_profile_id: string;
  author_display_name: string | null;
  body: string;
  created_at: string;
};

type FeedOk = { ok: true; posts: FeedPostRow[] };
type FeedErr = { ok: false; error: string };

function parseFeedPayload(data: unknown): FeedOk | FeedErr {
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid_response' };
  const o = data as Record<string, unknown>;
  if (o.ok !== true) return { ok: false, error: String(o.error ?? 'unknown') };
  if (!Array.isArray(o.posts)) return { ok: false, error: 'invalid_posts' };
  const posts = o.posts.map((p) => {
    const r = p as Record<string, unknown>;
    return {
      id: String(r.id),
      author_profile_id: String(r.author_profile_id),
      author_display_name: r.author_display_name == null ? null : String(r.author_display_name),
      body: r.body == null ? null : String(r.body),
      media_url: r.media_url == null ? null : String(r.media_url),
      visibility: String(r.visibility),
      created_at: String(r.created_at),
      like_count: Number(r.like_count) || 0,
      comment_count: Number(r.comment_count) || 0,
      liked: Boolean(r.liked),
    };
  });
  return { ok: true, posts };
}

export function FeedPage() {
  const [session, setSession] = useState<PescaSession | null>(() => loadSession());
  const [feedErr, setFeedErr] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPostRow[]>([]);
  const [pinned, setPinned] = useState<PlataformaPinnedSnapshot | null>(null);
  const [pinnedErr, setPinnedErr] = useState<string | null>(null);
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [pinnedMin, setPinnedMin] = useState(false);

  const refreshFeed = useCallback(async (s: PescaSession) => {
    if (!supabaseConfigured) {
      setFeedErr('Supabase não configurado (.env).');
      return;
    }
    setFeedLoading(true);
    setFeedErr(null);
    const { data, error } = await supabase.rpc('marco2_feed_list', {
      p_profile_id: s.profile_id,
      p_device_id: s.device_id,
      p_limit: 50,
    });
    if (error) {
      setFeedErr(error.message);
      setFeedLoading(false);
      return;
    }
    const parsed = parseFeedPayload(data);
    if (!parsed.ok) {
      setFeedErr(parsed.error === 'unauthorized' ? 'Sessão inválida ou dispositivo não vinculado.' : parsed.error);
      setPosts([]);
    } else {
      setPosts(parsed.posts);
    }
    setFeedLoading(false);
  }, []);

  useEffect(() => {
    const s = loadSession();
    setSession(s);
    if (s) void refreshFeed(s);
  }, [refreshFeed]);

  useEffect(() => {
    let cancelled = false;
    setPinnedLoading(true);
    setPinnedErr(null);
    loadPlataformaPinnedSnapshot()
      .then((snap) => {
        if (!cancelled) {
          setPinned(snap);
          setPinnedLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setPinnedErr(e.message);
          setPinnedLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onToggleLike(post: FeedPostRow) {
    if (!session || !supabaseConfigured) return;
    const { data, error } = await supabase.rpc('marco2_like_toggle', {
      p_profile_id: session.profile_id,
      p_device_id: session.device_id,
      p_post_id: post.id,
    });
    if (error) {
      setFeedErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; liked?: boolean; like_count?: number };
    if (!o?.ok) {
      setFeedErr(String((data as { error?: string }).error ?? 'like_failed'));
      return;
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked: Boolean(o.liked), like_count: Number(o.like_count) || 0 }
          : p,
      ),
    );
  }

  function onLogout() {
    clearSession();
    setSession(null);
    setPosts([]);
    setFeedErr(null);
  }

  if (!session) {
    return (
      <main className="feed-main">
        <h1>Feed</h1>
        <p className="muted">Precisas de uma sessão local (convite + dispositivo vinculado).</p>
        <p>
          <Link to="/convite">Ir para convite</Link> · <Link to="/">Início</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="feed-main">
      <header className="feed-top">
        <h1>Feed</h1>
        <p className="muted">
          {session.display_name ?? session.profile_id} ·{' '}
          <button type="button" className="linkish" onClick={onLogout}>
            Sair (local)
          </button>
        </p>
        <p className="muted" style={{ marginTop: '0.35rem' }}>
          {isMemberSession(session) ? (
            <>
              <Link to="/carteirinha">Código de presença</Link>
              {' · '}
            </>
          ) : null}
          {isStaffSession(session) ? (
            <>
              <Link to="/admin">Staff</Link>
              {' · '}
            </>
          ) : null}
          <Link to="/">Início</Link>
        </p>
      </header>

      <section className={`pinned-card card ${pinnedMin ? 'pinned-min' : ''}`}>
        <button
          type="button"
          className="pinned-toggle"
          onClick={() => setPinnedMin((m) => !m)}
          aria-expanded={!pinnedMin}
        >
          {pinnedMin ? 'Expandir índice' : 'Minimizar'}
        </button>
        {pinnedLoading ? (
          <p className="muted">A carregar índice da plataforma…</p>
        ) : pinnedErr ? (
          <p className="err">{pinnedErr}</p>
        ) : pinned ? (
          <>
            {pinnedMin ? (
              <div className="pinned-marquee" aria-live="polite">
                <span className="marquee-track">
                  <span className={`verdict-chip ${pinned.verdictCls}`}>{pinned.verdictWord}</span>
                  <span className="muted">
                    {' '}
                    · Nota {pinned.scoreRounded}/100 · {pinned.weatherEmoji} {pinned.weatherDesc} ·{' '}
                    {pinned.placeLabel}
                  </span>
                </span>
              </div>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {pinned.placeLabel} — hoje ({pinned.todayKey})
                </p>
                <p className={`simple-verdict-word ${pinned.verdictCls}`}>{pinned.verdictWord}</p>
                <p>{pinned.verdictSub}</p>
                <p className="muted">
                  Nota do modelo: {pinned.scoreRounded} em 100. {pinned.weatherEmoji} {pinned.weatherDesc}
                </p>
                <p className="muted smallprint">
                  Modelo heurístico (Open-Meteo, MET Norway, maré EPAGRI). Não substitui alertas oficiais.
                </p>
              </>
            )}
          </>
        ) : null}
      </section>

      {!supabaseConfigured ? <p className="err">Configure Supabase no .env para ver posts.</p> : null}
      {feedErr ? <p className="err">{feedErr}</p> : null}
      {feedLoading ? <p className="muted">A carregar publicações…</p> : null}

      <ul className="feed-list">
        {posts.map((p) => (
          <li key={p.id} className="feed-post card">
            <header className="feed-post-head">
              <strong>{p.author_display_name ?? p.author_profile_id.slice(0, 8)}</strong>
              <span className="muted">
                {' '}
                · {p.visibility === 'friends' ? 'Amigos' : 'Público'} ·{' '}
                {new Date(p.created_at).toLocaleString('pt-BR')}
              </span>
            </header>
            {p.body ? <p className="feed-body">{p.body}</p> : null}
            {p.media_url ? (
              <p className="muted">
                <a href={p.media_url} target="_blank" rel="noopener noreferrer">
                  Mídia
                </a>
              </p>
            ) : null}
            <PostActions
              post={p}
              session={session}
              onToggleLike={() => void onToggleLike(p)}
              onCommentPosted={() =>
                setPosts((prev) =>
                  prev.map((x) => (x.id === p.id ? { ...x, comment_count: x.comment_count + 1 } : x)),
                )
              }
            />
          </li>
        ))}
      </ul>

      {posts.length === 0 && !feedLoading && supabaseConfigured ? (
        <p className="muted">Sem publicações visíveis (ou ainda não aplicaste a migração Marco 2 no projeto).</p>
      ) : null}

      <p className="muted">
        <Link to="/">← Início</Link>
      </p>
    </main>
  );
}

function PostActions({
  post,
  session,
  onToggleLike,
  onCommentPosted,
}: {
  post: FeedPostRow;
  session: PescaSession;
  onToggleLike: () => void;
  onCommentPosted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [cErr, setCErr] = useState<string | null>(null);
  const [cLoading, setCLoading] = useState(false);
  const [draft, setDraft] = useState('');

  const loadComments = useCallback(async () => {
    if (!supabaseConfigured) return;
    setCLoading(true);
    setCErr(null);
    const { data, error } = await supabase.rpc('marco2_comments_list', {
      p_profile_id: session.profile_id,
      p_device_id: session.device_id,
      p_post_id: post.id,
    });
    setCLoading(false);
    if (error) {
      setCErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; comments?: unknown; error?: string };
    if (!o.ok) {
      setCErr(o.error ?? 'comments_failed');
      return;
    }
    const raw = Array.isArray(o.comments) ? o.comments : [];
    setComments(
      raw.map((c) => {
        const r = c as Record<string, unknown>;
        return {
          id: String(r.id),
          author_profile_id: String(r.author_profile_id),
          author_display_name: r.author_display_name == null ? null : String(r.author_display_name),
          body: String(r.body),
          created_at: String(r.created_at),
        };
      }),
    );
  }, [post.id, session.device_id, session.profile_id]);

  useEffect(() => {
    if (open) void loadComments();
  }, [open, loadComments]);

  async function onSubmitComment(e: FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (t.length < 1 || !supabaseConfigured) return;
    setCErr(null);
    const { data, error } = await supabase.rpc('marco2_comment_add', {
      p_profile_id: session.profile_id,
      p_device_id: session.device_id,
      p_post_id: post.id,
      p_body: t,
    });
    if (error) {
      setCErr(error.message);
      return;
    }
    const o = data as { ok?: boolean; error?: string };
    if (!o.ok) {
      setCErr(o.error ?? 'comment_failed');
      return;
    }
    setDraft('');
    onCommentPosted?.();
    await loadComments();
  }

  return (
    <div className="post-actions">
      <p>
        <button type="button" onClick={onToggleLike}>
          {post.liked ? '♥ Curtido' : '♡ Curtir'} ({post.like_count})
        </button>{' '}
        <button type="button" onClick={() => setOpen((x) => !x)}>
          Comentários ({post.comment_count})
        </button>
      </p>
      {open ? (
        <div className="comments-block">
          {cLoading ? <p className="muted">A carregar…</p> : null}
          {cErr ? <p className="err">{cErr}</p> : null}
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id}>
                <strong>{c.author_display_name ?? c.author_profile_id.slice(0, 8)}</strong>: {c.body}
                <span className="muted"> · {new Date(c.created_at).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void onSubmitComment(e)}>
            <label htmlFor={`c-${post.id}`} className="muted">
              Novo comentário
            </label>
            <textarea
              id={`c-${post.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              style={{ width: '100%', marginTop: '0.35rem' }}
              maxLength={2000}
            />
            <p>
              <button type="submit">Enviar</button>
            </p>
          </form>
        </div>
      ) : null}
    </div>
  );
}
