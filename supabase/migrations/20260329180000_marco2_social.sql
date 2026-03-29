-- Marco 2 — feed social (parte 1): tabelas + RLS + helpers.
-- RPCs em `20260329180100_marco2_social_rpcs.sql`.
-- Sem JWT sócio: RPCs validam device_bindings (evoluir para RLS + auth.uid()).

-- ---------------------------------------------------------------------------
-- Amizades (pedido / aceite / bloqueado)
-- ---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_pair_unique unique (requester_id, addressee_id)
);

create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id) on delete cascade,
  body text,
  media_url text,
  visibility text not null default 'public' check (visibility in ('public', 'friends')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_body_or_media check (
    (body is not null and char_length(trim(body)) >= 1)
    or (media_url is not null and char_length(trim(media_url)) >= 1)
  )
);

create index posts_org_created_idx on public.posts (organization_id, created_at desc);
create index posts_author_idx on public.posts (author_profile_id);

-- ---------------------------------------------------------------------------
-- Curtidas e comentários
-- ---------------------------------------------------------------------------
create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create index post_likes_profile_idx on public.post_likes (profile_id);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index post_comments_post_created_idx on public.post_comments (post_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS: fechado; acesso só via RPC
-- ---------------------------------------------------------------------------
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers internos (sem grant a anon — chamados por funções definer)
-- ---------------------------------------------------------------------------
create or replace function public.marco2_validate_device(p_profile_id uuid, p_device_id text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.device_bindings db
    where db.profile_id = p_profile_id
      and db.device_id = trim(p_device_id)
  );
$$;

revoke all on function public.marco2_validate_device(uuid, text) from public;

create or replace function public.marco2_are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = p_a and f.addressee_id = p_b)
        or (f.requester_id = p_b and f.addressee_id = p_a)
      )
  );
$$;

revoke all on function public.marco2_are_friends(uuid, uuid) from public;
