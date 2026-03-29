-- Marco 3b (slice 1) — mensalidade: flags, titular/dependente, vencimento, pagamentos manuais.
-- PSP / links / cartão recorrente ficam para iteração seguinte.
-- Mesmo modelo de confiança: RPC SECURITY DEFINER + device_bindings (Marco 2/3).

-- ---------------------------------------------------------------------------
-- Colunas em perfis: plano de cobrança (no titular) + visibilidade dependente
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists holder_profile_id uuid references public.profiles (id) on delete set null;

comment on column public.profiles.holder_profile_id is
  'Marco 3b: se não nulo, este perfil é dependente do titular indicado (mesma org).';

alter table public.profiles
  add column if not exists dues_monthly_amount_cents integer
    check (dues_monthly_amount_cents is null or (dues_monthly_amount_cents >= 0 and dues_monthly_amount_cents <= 500000000));

alter table public.profiles
  add column if not exists dues_due_day smallint
    check (dues_due_day is null or (dues_due_day >= 1 and dues_due_day <= 28));

comment on column public.profiles.dues_monthly_amount_cents is
  'Marco 3b: valor mensal em centavos (ex.: BRL). Null = sem plano configurado para este titular.';

comment on column public.profiles.dues_due_day is
  'Marco 3b: dia do mês do vencimento (1–28).';

alter table public.profiles
  add column if not exists dues_share_with_dependents boolean not null default false;

comment on column public.profiles.dues_share_with_dependents is
  'Marco 3b: titular permite que dependentes vejam situação de mensalidade (metade do duplo consentimento).';

alter table public.profiles
  add column if not exists dues_dependent_can_see boolean not null default false;

comment on column public.profiles.dues_dependent_can_see is
  'Marco 3b: dependente aceita ver mensalidade do titular (metade do duplo consentimento).';

create index if not exists profiles_holder_profile_id_idx on public.profiles (holder_profile_id)
  where holder_profile_id is not null;

-- ---------------------------------------------------------------------------
-- Pagamentos manuais (um registo por mês de referência por titular cobrado)
-- ---------------------------------------------------------------------------
create table public.membership_dues_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  billed_profile_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 500000000),
  covers_month date not null,
  method text not null default 'manual' check (method in ('manual', 'psp')),
  note text,
  recorded_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint membership_dues_payments_covers_month_first_day check (covers_month = date_trunc('month', covers_month)::date),
  constraint membership_dues_payments_billed_month_unique unique (billed_profile_id, covers_month)
);

create index membership_dues_payments_org_idx on public.membership_dues_payments (organization_id, covers_month desc);

alter table public.membership_dues_payments enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------
create or replace function public.marco3b_org_dues_enabled(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (
      select o.feature_flags @> '{"dues": true}'::jsonb
      from public.organizations o
      where o.id = p_org
    ),
    false
  );
$$;

revoke all on function public.marco3b_org_dues_enabled(uuid) from public;

-- Titular de cobrança: perfil com holder_profile_id is null usa o próprio; dependente usa o titular.
create or replace function public.marco3b_billing_profile_id(p_profile_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_holder uuid;
  v_id uuid;
  v_org uuid;
  v_org_h uuid;
begin
  select id, organization_id, holder_profile_id
  into v_id, v_org, v_holder
  from public.profiles
  where id = p_profile_id;

  if v_id is null then
    return null;
  end if;

  if v_holder is null then
    return v_id;
  end if;

  select organization_id into v_org_h from public.profiles where id = v_holder;
  if v_org_h is distinct from v_org then
    return null;
  end if;

  return v_holder;
end;
$$;

revoke all on function public.marco3b_billing_profile_id(uuid) from public;

-- Estado do mês corrente para um titular (billed_profile_id deve ser titular: holder is null)
create or replace function public.marco3b_dues_month_state(p_billed uuid, p_ref_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_amount int;
  v_day smallint;
  v_org uuid;
  v_holder uuid;
  v_month_start date;
  v_last_day int;
  v_eff_day int;
  v_due date;
  v_paid boolean;
  v_paid_amount int;
begin
  select organization_id, holder_profile_id, dues_monthly_amount_cents, dues_due_day
  into v_org, v_holder, v_amount, v_day
  from public.profiles
  where id = p_billed;

  if v_org is null or v_holder is not null then
    return jsonb_build_object('error', 'not_billing_profile');
  end if;

  if v_amount is null or v_day is null then
    return jsonb_build_object(
      'configured', false
    );
  end if;

  v_month_start := date_trunc('month', p_ref_date)::date;
  v_last_day := extract(day from (v_month_start + interval '1 month - 1 day'))::int;
  v_eff_day := least(v_day::int, v_last_day);
  v_due := v_month_start + (v_eff_day - 1);

  select m.amount_cents into v_paid_amount
  from public.membership_dues_payments m
  where m.billed_profile_id = p_billed
    and m.covers_month = v_month_start
  limit 1;

  v_paid := v_paid_amount is not null and v_paid_amount >= v_amount;

  return jsonb_build_object(
    'configured', true,
    'amount_cents', v_amount,
    'due_day', v_day,
    'month_start', v_month_start,
    'due_date', v_due,
    'paid', v_paid,
    'paid_amount_cents', coalesce(v_paid_amount, 0),
    'overdue', (not v_paid) and (p_ref_date > v_due),
    'pending', (not v_paid) and (p_ref_date <= v_due)
  );
end;
$$;

revoke all on function public.marco3b_dues_month_state(uuid, date) from public;

-- ---------------------------------------------------------------------------
-- Sócio: estado de mensalidade (respeita módulo + duplo consentimento dependente)
-- ---------------------------------------------------------------------------
create or replace function public.marco3b_member_dues_status(p_profile_id uuid, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_role text;
  v_holder uuid;
  v_dep_accept boolean;
  v_holder_share boolean;
  v_billed uuid;
  v_state jsonb;
  v_prefs jsonb;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id, role_id, holder_profile_id, dues_dependent_can_see
  into v_org, v_role, v_holder, v_dep_accept
  from public.profiles
  where id = p_profile_id;

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if v_role is distinct from 'member' then
    return jsonb_build_object('ok', false, 'error', 'only_members');
  end if;

  if v_holder is null then
    select coalesce(dues_share_with_dependents, false)
    into v_holder_share
    from public.profiles
    where id = p_profile_id;
  else
    select coalesce(dues_share_with_dependents, false)
    into v_holder_share
    from public.profiles
    where id = v_holder;
  end if;

  v_prefs := jsonb_build_object(
    'holder_allows_share', coalesce(v_holder_share, false),
    'dependent_accepts', coalesce(v_dep_accept, false)
  );

  if not public.marco3b_org_dues_enabled(v_org) then
    return jsonb_build_object(
      'ok', true,
      'visible', false,
      'reason', 'module_disabled',
      'prefs', v_prefs,
      'is_dependent', (v_holder is not null)
    );
  end if;

  v_billed := public.marco3b_billing_profile_id(p_profile_id);
  if v_billed is null then
    return jsonb_build_object('ok', false, 'error', 'billing_unresolved');
  end if;

  if v_holder is not null then
    if not coalesce(v_holder_share, false) or not coalesce(v_dep_accept, false) then
      return jsonb_build_object(
        'ok', true,
        'visible', false,
        'reason', 'dependent_visibility_denied',
        'is_dependent', true,
        'prefs', v_prefs
      );
    end if;
  end if;

  v_state := public.marco3b_dues_month_state(
    v_billed,
    (timezone('America/Sao_Paulo', now()))::date
  );

  return jsonb_build_object(
    'ok', true,
    'visible', true,
    'is_dependent', (v_holder is not null),
    'billed_profile_id', v_billed,
    'state', v_state,
    'prefs', v_prefs
  );
end;
$$;

revoke all on function public.marco3b_member_dues_status(uuid, text) from public;
grant execute on function public.marco3b_member_dues_status(uuid, text) to anon, authenticated;

-- Titular: permitir/partilhar com dependentes
create or replace function public.marco3b_member_holder_share_dues(
  p_profile_id uuid,
  p_device_id text,
  p_allow boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
  v_holder uuid;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select role_id, holder_profile_id into v_role, v_holder
  from public.profiles where id = p_profile_id;

  if v_role is distinct from 'member' or v_holder is not null then
    return jsonb_build_object('ok', false, 'error', 'only_holders');
  end if;

  if not public.marco3b_org_dues_enabled((select organization_id from public.profiles where id = p_profile_id)) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  update public.profiles
  set dues_share_with_dependents = coalesce(p_allow, false), updated_at = now()
  where id = p_profile_id;

  return jsonb_build_object('ok', true, 'dues_share_with_dependents', coalesce(p_allow, false));
end;
$$;

revoke all on function public.marco3b_member_holder_share_dues(uuid, text, boolean) from public;
grant execute on function public.marco3b_member_holder_share_dues(uuid, text, boolean) to anon, authenticated;

-- Dependente: aceitar ver mensalidade
create or replace function public.marco3b_member_dependent_accept_dues(
  p_profile_id uuid,
  p_device_id text,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
  v_holder uuid;
  v_org uuid;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id, role_id, holder_profile_id into v_org, v_role, v_holder
  from public.profiles where id = p_profile_id;

  if v_role is distinct from 'member' or v_holder is null then
    return jsonb_build_object('ok', false, 'error', 'only_dependents');
  end if;

  if not public.marco3b_org_dues_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  update public.profiles
  set dues_dependent_can_see = coalesce(p_accept, false), updated_at = now()
  where id = p_profile_id;

  return jsonb_build_object('ok', true, 'dues_dependent_can_see', coalesce(p_accept, false));
end;
$$;

revoke all on function public.marco3b_member_dependent_accept_dues(uuid, text, boolean) from public;
grant execute on function public.marco3b_member_dependent_accept_dues(uuid, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: definir valor e dia de vencimento (titular alvo: holder is null)
-- ---------------------------------------------------------------------------
create or replace function public.marco3b_staff_set_member_dues(
  p_staff_profile_id uuid,
  p_staff_device_id text,
  p_member_profile_id uuid,
  p_amount_cents integer,
  p_due_day integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_m_org uuid;
  v_role text;
  v_holder uuid;
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

  if not public.marco3b_org_dues_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  select organization_id, role_id, holder_profile_id
  into v_m_org, v_role, v_holder
  from public.profiles
  where id = p_member_profile_id;

  if v_m_org is null or v_m_org is distinct from v_org then
    return jsonb_build_object('ok', false, 'error', 'member_not_in_org');
  end if;

  if v_role is distinct from 'member' or v_holder is not null then
    return jsonb_build_object('ok', false, 'error', 'only_billing_members');
  end if;

  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 500000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if p_due_day is null or p_due_day < 1 or p_due_day > 28 then
    return jsonb_build_object('ok', false, 'error', 'invalid_due_day');
  end if;

  update public.profiles
  set
    dues_monthly_amount_cents = p_amount_cents,
    dues_due_day = p_due_day::smallint,
    updated_at = now()
  where id = p_member_profile_id;

  return jsonb_build_object(
    'ok', true,
    'dues_monthly_amount_cents', p_amount_cents,
    'dues_due_day', p_due_day
  );
end;
$$;

revoke all on function public.marco3b_staff_set_member_dues(uuid, text, uuid, integer, integer) from public;
grant execute on function public.marco3b_staff_set_member_dues(uuid, text, uuid, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: registar pagamento manual (upsert por mês)
-- ---------------------------------------------------------------------------
create or replace function public.marco3b_staff_record_dues_payment(
  p_staff_profile_id uuid,
  p_staff_device_id text,
  p_billed_profile_id uuid,
  p_amount_cents integer,
  p_covers_year integer,
  p_covers_month integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_m_org uuid;
  v_role text;
  v_holder uuid;
  v_covers date;
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

  if not public.marco3b_org_dues_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  select organization_id, role_id, holder_profile_id
  into v_m_org, v_role, v_holder
  from public.profiles
  where id = p_billed_profile_id;

  if v_m_org is null or v_m_org is distinct from v_org then
    return jsonb_build_object('ok', false, 'error', 'member_not_in_org');
  end if;

  if v_role is distinct from 'member' or v_holder is not null then
    return jsonb_build_object('ok', false, 'error', 'only_billing_members');
  end if;

  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 500000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  if p_covers_year is null or p_covers_month is null or p_covers_month < 1 or p_covers_month > 12 then
    return jsonb_build_object('ok', false, 'error', 'invalid_period');
  end if;

  begin
    v_covers := make_date(p_covers_year, p_covers_month, 1);
  exception
    when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_period');
  end;

  insert into public.membership_dues_payments (
    organization_id,
    billed_profile_id,
    amount_cents,
    covers_month,
    method,
    note,
    recorded_by_profile_id
  )
  values (
    v_org,
    p_billed_profile_id,
    p_amount_cents,
    v_covers,
    'manual',
    nullif(trim(coalesce(p_note, '')), ''),
    p_staff_profile_id
  )
  on conflict (billed_profile_id, covers_month) do update
  set
    amount_cents = excluded.amount_cents,
    note = excluded.note,
    recorded_by_profile_id = excluded.recorded_by_profile_id,
    created_at = now();

  return jsonb_build_object(
    'ok', true,
    'covers_month', v_covers,
    'amount_cents', p_amount_cents
  );
end;
$$;

revoke all on function public.marco3b_staff_record_dues_payment(uuid, text, uuid, integer, integer, integer, text) from public;
grant execute on function public.marco3b_staff_record_dues_payment(uuid, text, uuid, integer, integer, integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff: listar sócios com resumo de mensalidade (mês corrente, fuso SP)
-- ---------------------------------------------------------------------------
create or replace function public.marco3b_staff_dues_members_list(
  p_staff_profile_id uuid,
  p_staff_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_today date;
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

  if not public.marco3b_org_dues_enabled(v_org) then
    return jsonb_build_object('ok', false, 'error', 'module_disabled');
  end if;

  v_today := (timezone('America/Sao_Paulo', now()))::date;

  return jsonb_build_object(
    'ok', true,
    'members', coalesce(
      (
        select jsonb_agg(row_json order by sort_name)
        from (
          select
            pr.display_name as sort_name,
            jsonb_build_object(
              'profile_id', pr.id,
              'display_name', pr.display_name,
              'holder_profile_id', pr.holder_profile_id,
              'is_billing_holder', (pr.holder_profile_id is null),
              'billing_profile_id', z.billed,
              'dues_monthly_amount_cents', bp.dues_monthly_amount_cents,
              'dues_due_day', bp.dues_due_day,
              'month_state',
                case
                  when z.billed is null then jsonb_build_object('error', 'billing_unresolved')
                  else public.marco3b_dues_month_state(z.billed, v_today)
                end
            ) as row_json
          from public.profiles pr
          cross join lateral (select public.marco3b_billing_profile_id(pr.id) as billed) z
          left join public.profiles bp on bp.id = z.billed
          where pr.organization_id = v_org
            and pr.role_id = 'member'
        ) sub
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.marco3b_staff_dues_members_list(uuid, text) from public;
grant execute on function public.marco3b_staff_dues_members_list(uuid, text) to anon, authenticated;

comment on table public.membership_dues_payments is
  'Marco 3b: pagamentos de mensalidade; método manual no MVP; PSP depois.';

comment on function public.marco3b_member_dues_status(uuid, text) is
  'Marco 3b: estado de mensalidade do sócio (titular ou dependente com duplo consentimento).';

comment on function public.marco3b_staff_set_member_dues(uuid, text, uuid, integer, integer) is
  'Marco 3b: staff define valor e dia de vencimento para titular (sem holder).';

comment on function public.marco3b_staff_record_dues_payment(uuid, text, uuid, integer, integer, integer, text) is
  'Marco 3b: staff regista ou atualiza pagamento manual de um mês.';

comment on function public.marco3b_staff_dues_members_list(uuid, text) is
  'Marco 3b: lista sócios da org com estado do mês corrente.';
