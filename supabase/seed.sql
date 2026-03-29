-- Dados apenas para desenvolvimento local (`supabase db reset` aplica após migrações).
-- Token em texto claro: marco1-dev-token  (NUNCA usar em produção)

insert into public.organizations (id, name, feature_flags)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Plataforma Norte (dev)',
  '{"presence_qr": true, "dues": true}'::jsonb
)
on conflict (id) do nothing;

update public.organizations
set feature_flags = coalesce(feature_flags, '{}'::jsonb)
  || '{"presence_qr": true, "dues": true}'::jsonb
where id = 'a0000000-0000-4000-8000-000000000001';

insert into public.profiles (id, organization_id, role_id, display_name)
values (
  'b0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'member',
  'Sócio demonstração'
)
on conflict (id) do nothing;

-- Marco 3b — plano de mensalidade no titular demo (valor/dia; pagamento opcional no mês corrente)
update public.profiles
set
  dues_monthly_amount_cents = 15000,
  dues_due_day = 10,
  updated_at = now()
where id = 'b0000000-0000-4000-8000-000000000002';

insert into public.invite_tokens (organization_id, profile_id, token_hash, expires_at, max_uses)
values (
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  encode(digest('marco1-dev-token', 'sha256'::text), 'hex'),
  null,
  null
)
on conflict (token_hash) do nothing;

-- Marco 3 — colaborador demo (staff / presença)
insert into public.profiles (id, organization_id, role_id, display_name)
values (
  'd0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000001',
  'collaborator',
  'Colaborador demo'
)
on conflict (id) do nothing;

insert into public.invite_tokens (organization_id, profile_id, token_hash, expires_at, max_uses)
values (
  'a0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000004',
  encode(digest('marco3-collab-dev-token', 'sha256'::text), 'hex'),
  null,
  null
)
on conflict (token_hash) do nothing;

-- Marco 3b — pagamento demo do mês corrente (registado pelo colaborador)
insert into public.membership_dues_payments (
  organization_id,
  billed_profile_id,
  amount_cents,
  covers_month,
  recorded_by_profile_id
)
select
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  15000,
  date_trunc('month', (timezone('America/Sao_Paulo', now()))::date)::date,
  'd0000000-0000-4000-8000-000000000004'
where not exists (
  select 1 from public.membership_dues_payments m
  where m.billed_profile_id = 'b0000000-0000-4000-8000-000000000002'
    and m.covers_month = date_trunc('month', (timezone('America/Sao_Paulo', now()))::date)::date
);

-- Marco 2 — segundo perfil + amizade aceite + posts demo (visibilidade)
insert into public.profiles (id, organization_id, role_id, display_name)
values (
  'c0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000001',
  'member',
  'Outro sócio (amigo dev)'
)
on conflict (id) do nothing;

insert into public.friendships (requester_id, addressee_id, status)
values (
  'b0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000003',
  'accepted'
)
on conflict (requester_id, addressee_id) do nothing;

insert into public.posts (organization_id, author_profile_id, body, visibility)
select
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'Bem-vindo ao feed (Marco 2). Post público de demonstração.',
  'public'
where not exists (
  select 1 from public.posts p
  where p.organization_id = 'a0000000-0000-4000-8000-000000000001'
    and p.author_profile_id = 'b0000000-0000-4000-8000-000000000002'
    and p.body like 'Bem-vindo ao feed (Marco 2)%'
);

insert into public.posts (organization_id, author_profile_id, body, visibility)
select
  'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000003',
  'Só amigos: exemplo de post com visibilidade restrita (vês isto porque o seed criou amizade aceite com o perfil demo).',
  'friends'
where not exists (
  select 1 from public.posts p
  where p.organization_id = 'a0000000-0000-4000-8000-000000000001'
    and p.author_profile_id = 'c0000000-0000-4000-8000-000000000003'
    and p.visibility = 'friends'
);
