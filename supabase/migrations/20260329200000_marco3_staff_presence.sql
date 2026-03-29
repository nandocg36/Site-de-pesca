-- Marco 3 — staff: feature flags por organização, código de presença (carteirinha), batidas entrada/saída.
-- Acesso a dados via RPC SECURITY DEFINER + device_bindings (mesmo modelo Marco 2).

alter table public.organizations
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

comment on column public.organizations.feature_flags is
  'Flags de módulos (ex.: {"presence_qr": true}). Marco 3.';

alter table public.profiles
  add column if not exists checkin_code text;

comment on column public.profiles.checkin_code is
  'Código alfanumérico curto para batida na portaria (único por organização). Marco 3.';

create unique index if not exists profiles_org_checkin_code_uidx
  on public.profiles (organization_id, checkin_code)
  where checkin_code is not null;

-- ---------------------------------------------------------------------------
-- Eventos de presença (último evento por membro determina dentro/fora)
-- ---------------------------------------------------------------------------
create table public.presence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_profile_id uuid not null references public.profiles (id) on delete cascade,
  recorded_by_profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('in', 'out')),
  method text not null default 'code' check (method in ('code', 'qr', 'manual')),
  created_at timestamptz not null default now()
);

create index presence_events_org_created_idx on public.presence_events (organization_id, created_at desc);
create index presence_events_member_idx on public.presence_events (member_profile_id, created_at desc);

alter table public.presence_events enable row level security;

-- ---------------------------------------------------------------------------
-- Helper interno: perfil é owner ou colaborador?
-- ---------------------------------------------------------------------------
create or replace function public.marco3_profile_is_staff(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.role_id in ('owner', 'collaborator')
  );
$$;

revoke all on function public.marco3_profile_is_staff(uuid) from public;

create or replace function public.marco3_org_presence_qr_enabled(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (
      select o.feature_flags @> '{"presence_qr": true}'::jsonb
      from public.organizations o
      where o.id = p_org
    ),
    false
  );
$$;

revoke all on function public.marco3_org_presence_qr_enabled(uuid) from public;

-- ---------------------------------------------------------------------------
-- Sócio: garantir / devolver código de presença
-- ---------------------------------------------------------------------------
create or replace function public.marco3_member_ensure_checkin_code(p_profile_id uuid, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_role text;
  v_code text;
  v_try text;
  v_n int := 0;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id, role_id, checkin_code
  into v_org, v_role, v_code
  from public.profiles
  where id = p_profile_id;

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if v_role is distinct from 'member' then
    return jsonb_build_object('ok', false, 'error', 'only_members');
  end if;

  if not public.marco3_org_presence_qr_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  if v_code is not null and char_length(trim(v_code)) >= 4 then
    return jsonb_build_object('ok', true, 'checkin_code', v_code);
  end if;

  loop
    v_try := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.profiles p2
      where p2.organization_id = v_org and p2.checkin_code = v_try
    );
    v_n := v_n + 1;
    if v_n > 80 then
      return jsonb_build_object('ok', false, 'error', 'code_gen_failed');
    end if;
  end loop;

  update public.profiles
  set checkin_code = v_try, updated_at = now()
  where id = p_profile_id;

  return jsonb_build_object('ok', true, 'checkin_code', v_try);
end;
$$;

revoke all on function public.marco3_member_ensure_checkin_code(uuid, text) from public;
grant execute on function public.marco3_member_ensure_checkin_code(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: registar entrada ou saída pelo código do sócio
-- ---------------------------------------------------------------------------
create or replace function public.marco3_staff_register_presence(
  p_staff_profile_id uuid,
  p_staff_device_id text,
  p_member_code text,
  p_event text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_member uuid;
  ev text;
  c text;
begin
  if not public.marco2_validate_device(p_staff_profile_id, p_staff_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if not public.marco3_profile_is_staff(p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select organization_id into v_org from public.profiles where id = p_staff_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if not public.marco3_org_presence_qr_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  c := upper(trim(coalesce(p_member_code, '')));
  if char_length(c) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  ev := lower(trim(coalesce(p_event, '')));
  if ev not in ('in', 'out') then
    return jsonb_build_object('ok', false, 'error', 'invalid_event');
  end if;

  select id into v_member
  from public.profiles
  where organization_id = v_org
    and role_id = 'member'
    and checkin_code = c;

  if v_member is null then
    return jsonb_build_object('ok', false, 'error', 'member_not_found');
  end if;

  insert into public.presence_events (
    organization_id,
    member_profile_id,
    recorded_by_profile_id,
    event_type,
    method
  )
  values (v_org, v_member, p_staff_profile_id, ev, 'code');

  return jsonb_build_object(
    'ok', true,
    'member_profile_id', v_member,
    'event', ev
  );
end;
$$;

revoke all on function public.marco3_staff_register_presence(uuid, text, text, text) from public;
grant execute on function public.marco3_staff_register_presence(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: quem está “dentro” (último evento = in)
-- ---------------------------------------------------------------------------
create or replace function public.marco3_staff_presence_list(p_staff_profile_id uuid, p_staff_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
begin
  if not public.marco2_validate_device(p_staff_profile_id, p_staff_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if not public.marco3_profile_is_staff(p_staff_profile_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select organization_id into v_org from public.profiles where id = p_staff_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if not public.marco3_org_presence_qr_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  return jsonb_build_object(
    'ok', true,
    'present', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'member_profile_id', pr.id,
            'display_name', pr.display_name,
            'checkin_code', pr.checkin_code,
            'since', le.created_at
          )
          order by le.created_at desc
        )
        from (
          select distinct on (pe.member_profile_id)
            pe.member_profile_id,
            pe.event_type,
            pe.created_at
          from public.presence_events pe
          where pe.organization_id = v_org
          order by pe.member_profile_id, pe.created_at desc
        ) le
        join public.profiles pr on pr.id = le.member_profile_id
        where le.event_type = 'in'
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.marco3_staff_presence_list(uuid, text) from public;
grant execute on function public.marco3_staff_presence_list(uuid, text) to anon, authenticated;

comment on function public.marco3_member_ensure_checkin_code(uuid, text) is
  'Marco 3: sócio membro com device válido obtém código único na org (se módulo presence_qr ativo).';

comment on function public.marco3_staff_register_presence(uuid, text, text, text) is
  'Marco 3: staff regista entrada/saída pelo código do sócio.';

comment on function public.marco3_staff_presence_list(uuid, text) is
  'Marco 3: lista sócios com último evento = entrada.';
