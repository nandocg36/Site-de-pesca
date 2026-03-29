-- Marco 1 — fundações: organizações, perfis, papéis, convites (hash), vínculos de dispositivo.
-- Stack: Supabase (Postgres + RLS). Sem pagamentos nesta migração.
-- Compatível com Postgres/Supabase: digest com tipo explícito + search_path inclui extensions (pgcrypto).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Papéis (referência)
-- ---------------------------------------------------------------------------
create table public.roles (
  id text primary key check (id in ('owner', 'collaborator', 'member')),
  label_pt text not null
);

insert into public.roles (id, label_pt) values
  ('owner', 'Proprietário'),
  ('collaborator', 'Colaborador'),
  ('member', 'Sócio')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Organização (entidade / clube)
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Perfil (sócio, colaborador ou titular; auth Supabase opcional para proprietário)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role_id text not null references public.roles (id),
  display_name text,
  auth_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_auth_user_id_idx on public.profiles (auth_user_id) where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- Convite: token armazenado como SHA-256 hex (nunca o token em claro)
-- ---------------------------------------------------------------------------
create table public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz,
  max_uses int,
  use_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_tokens_token_hash_unique unique (token_hash)
);

create index invite_tokens_profile_id_idx on public.invite_tokens (profile_id);

-- ---------------------------------------------------------------------------
-- Vínculo dispositivo ↔ perfil (primeiro uso do convite)
-- ---------------------------------------------------------------------------
create table public.device_bindings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  device_id text not null
    check (char_length(device_id) >= 8 and char_length(device_id) <= 128),
  user_agent text,
  created_at timestamptz not null default now(),
  constraint device_bindings_profile_device_unique unique (profile_id, device_id)
);

create index device_bindings_profile_id_idx on public.device_bindings (profile_id);

-- ---------------------------------------------------------------------------
-- RLS: negar acesso direto anónimo às tabelas; RPC controlada abaixo
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.device_bindings enable row level security;
alter table public.roles enable row level security;

-- Sem políticas para anon/authenticated = nenhuma linha visível via PostgREST por defeito.

-- ---------------------------------------------------------------------------
-- RPC: resgatar convite (token em trânsito uma vez; comparar hash no servidor)
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite_token(p_token text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  inv public.invite_tokens%rowtype;
  prof public.profiles%rowtype;
begin
  if p_token is null or char_length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if p_device_id is null or char_length(trim(p_device_id)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  v_hash := encode(digest(trim(p_token), 'sha256'::text), 'hex');

  select * into inv
  from public.invite_tokens
  where token_hash = v_hash
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    return jsonb_build_object('ok', false, 'error', 'token_exhausted');
  end if;

  select * into prof from public.profiles where id = inv.profile_id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  insert into public.device_bindings (profile_id, device_id)
  values (inv.profile_id, trim(p_device_id))
  on conflict (profile_id, device_id) do nothing;

  update public.invite_tokens
  set use_count = use_count + 1
  where id = inv.id;

  return jsonb_build_object(
    'ok', true,
    'profile_id', inv.profile_id,
    'organization_id', inv.organization_id,
    'role_id', prof.role_id,
    'display_name', prof.display_name
  );
end;
$$;

revoke all on function public.redeem_invite_token(text, text) from public;
grant execute on function public.redeem_invite_token(text, text) to anon, authenticated;

comment on function public.redeem_invite_token(text, text) is
  'Marco 1: valida token (SHA-256), regista device_id e incrementa use_count. Sem JWT próprio ainda.';
