-- Marco 2 — RPCs sociais (parte 2; requer 20260329180000_marco2_social.sql)
-- ---------------------------------------------------------------------------
-- marco2_feed_list
-- ---------------------------------------------------------------------------
create or replace function public.marco2_feed_list(p_profile_id uuid, p_device_id text, p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  lim int;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id into v_org from public.profiles where id = p_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  lim := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 100));

  return jsonb_build_object(
    'ok', true,
    'posts', coalesce(
      (
        select jsonb_agg(sub.card order by sub.sort_key desc)
        from (
          select
            jsonb_build_object(
              'id', po.id,
              'organization_id', po.organization_id,
              'author_profile_id', po.author_profile_id,
              'author_display_name', pr.display_name,
              'body', po.body,
              'media_url', po.media_url,
              'visibility', po.visibility,
              'created_at', po.created_at,
              'like_count', (select count(*)::int from public.post_likes pl where pl.post_id = po.id),
              'comment_count', (select count(*)::int from public.post_comments pc where pc.post_id = po.id),
              'liked', exists (
                select 1
                from public.post_likes pl2
                where pl2.post_id = po.id and pl2.profile_id = p_profile_id
              )
            ) as card,
            po.created_at as sort_key
          from public.posts po
          join public.profiles pr on pr.id = po.author_profile_id
          where po.organization_id = v_org
            and (
              po.visibility = 'public'
              or po.author_profile_id = p_profile_id
              or (
                po.visibility = 'friends'
                and public.marco2_are_friends(p_profile_id, po.author_profile_id)
              )
            )
          order by po.created_at desc
          limit lim
        ) sub
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.marco2_feed_list(uuid, text, int) from public;
grant execute on function public.marco2_feed_list(uuid, text, int) to anon, authenticated;

comment on function public.marco2_feed_list(uuid, text, int) is
  'Marco 2: lista posts da mesma org respeitando visibilidade (público vs amigos) + device válido.';

-- ---------------------------------------------------------------------------
-- marco2_post_create
-- ---------------------------------------------------------------------------
create or replace function public.marco2_post_create(
  p_profile_id uuid,
  p_device_id text,
  p_body text,
  p_visibility text,
  p_media_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  vis text;
  bid uuid;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id into v_org from public.profiles where id = p_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  vis := lower(trim(coalesce(p_visibility, 'public')));
  if vis not in ('public', 'friends') then
    return jsonb_build_object('ok', false, 'error', 'invalid_visibility');
  end if;

  if (p_body is null or char_length(trim(p_body)) < 1)
     and (p_media_url is null or char_length(trim(p_media_url)) < 1) then
    return jsonb_build_object('ok', false, 'error', 'empty_post');
  end if;

  insert into public.posts (organization_id, author_profile_id, body, media_url, visibility)
  values (
    v_org,
    p_profile_id,
    case when p_body is null then null else trim(p_body) end,
    case when p_media_url is null then null else trim(p_media_url) end,
    vis
  )
  returning id into bid;

  return jsonb_build_object('ok', true, 'post_id', bid);
end;
$$;

revoke all on function public.marco2_post_create(uuid, text, text, text, text) from public;
grant execute on function public.marco2_post_create(uuid, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- marco2_like_toggle
-- ---------------------------------------------------------------------------
create or replace function public.marco2_like_toggle(p_profile_id uuid, p_device_id text, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  cnt int;
  now_liked boolean;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id into v_org from public.profiles where id = p_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if not exists (
    select 1
    from public.posts po
    where po.id = p_post_id
      and po.organization_id = v_org
      and (
        po.visibility = 'public'
        or po.author_profile_id = p_profile_id
        or (
          po.visibility = 'friends'
          and public.marco2_are_friends(p_profile_id, po.author_profile_id)
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if exists (
    select 1
    from public.post_likes pl
    where pl.post_id = p_post_id and pl.profile_id = p_profile_id
  ) then
    delete from public.post_likes
    where post_id = p_post_id and profile_id = p_profile_id;
    now_liked := false;
  else
    insert into public.post_likes (post_id, profile_id) values (p_post_id, p_profile_id);
    now_liked := true;
  end if;

  select count(*)::int into cnt from public.post_likes where post_id = p_post_id;

  return jsonb_build_object('ok', true, 'liked', now_liked, 'like_count', cnt);
end;
$$;

revoke all on function public.marco2_like_toggle(uuid, text, uuid) from public;
grant execute on function public.marco2_like_toggle(uuid, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- marco2_comment_add
-- ---------------------------------------------------------------------------
create or replace function public.marco2_comment_add(
  p_profile_id uuid,
  p_device_id text,
  p_post_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  cid uuid;
  t text;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id into v_org from public.profiles where id = p_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  t := trim(coalesce(p_body, ''));
  if char_length(t) < 1 or char_length(t) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_comment');
  end if;

  if not exists (
    select 1
    from public.posts po
    where po.id = p_post_id
      and po.organization_id = v_org
      and (
        po.visibility = 'public'
        or po.author_profile_id = p_profile_id
        or (
          po.visibility = 'friends'
          and public.marco2_are_friends(p_profile_id, po.author_profile_id)
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.post_comments (post_id, author_profile_id, body)
  values (p_post_id, p_profile_id, t)
  returning id into cid;

  return jsonb_build_object('ok', true, 'comment_id', cid);
end;
$$;

revoke all on function public.marco2_comment_add(uuid, text, uuid, text) from public;
grant execute on function public.marco2_comment_add(uuid, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- marco2_comments_list
-- ---------------------------------------------------------------------------
create or replace function public.marco2_comments_list(
  p_profile_id uuid,
  p_device_id text,
  p_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
begin
  if not public.marco2_validate_device(p_profile_id, p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select organization_id into v_org from public.profiles where id = p_profile_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  if not exists (
    select 1
    from public.posts po
    where po.id = p_post_id
      and po.organization_id = v_org
      and (
        po.visibility = 'public'
        or po.author_profile_id = p_profile_id
        or (
          po.visibility = 'friends'
          and public.marco2_are_friends(p_profile_id, po.author_profile_id)
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'ok', true,
    'comments', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'author_profile_id', c.author_profile_id,
            'author_display_name', pr.display_name,
            'body', c.body,
            'created_at', c.created_at
          )
          order by c.created_at asc
        )
        from public.post_comments c
        join public.profiles pr on pr.id = c.author_profile_id
        where c.post_id = p_post_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.marco2_comments_list(uuid, text, uuid) from public;
grant execute on function public.marco2_comments_list(uuid, text, uuid) to anon, authenticated;
</think>


<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplac
