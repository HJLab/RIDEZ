-- RIDEZ Kamera, chat og live-foelgere v108
-- Koer denne fil EN gang i Supabase SQL Editor FOER v108 flettes ind.

-- Aktive foelgere: anonym browsersession sender heartbeat hvert 3. sekund.
create table if not exists public.ridez_viewer_sessions(
  ride_id uuid not null references public.ridez_rides(id) on delete cascade,
  viewer_token text not null,
  last_seen_at timestamptz not null default now(),
  primary key(ride_id,viewer_token)
);

alter table public.ridez_viewer_sessions enable row level security;
revoke all on table public.ridez_viewer_sessions from anon,authenticated;

create index if not exists ridez_viewer_sessions_seen_idx
  on public.ridez_viewer_sessions(ride_id,last_seen_at);

create or replace function public.ridez_viewer_heartbeat_v108(
  p_public_token text,
  p_viewer_token text
) returns integer
language plpgsql security definer set search_path=public as $$
declare rid uuid; active_count integer;
begin
  if char_length(coalesce(p_viewer_token,''))<32 then raise exception 'invalid viewer token'; end if;
  select r.id into rid from public.ridez_rides r
  where r.public_token=p_public_token and r.active=true limit 1;
  if rid is null then return 0; end if;

  insert into public.ridez_viewer_sessions(ride_id,viewer_token,last_seen_at)
  values(rid,p_viewer_token,now())
  on conflict(ride_id,viewer_token) do update set last_seen_at=excluded.last_seen_at;

  delete from public.ridez_viewer_sessions s
  where s.ride_id=rid and s.last_seen_at<now()-interval '2 minutes';

  select count(*)::integer into active_count
  from public.ridez_viewer_sessions s
  where s.ride_id=rid and s.last_seen_at>=now()-interval '15 seconds';
  return coalesce(active_count,0);
end $$;

revoke all on function public.ridez_viewer_heartbeat_v108(text,text) from public;
grant execute on function public.ridez_viewer_heartbeat_v108(text,text) to anon;

create or replace function public.ridez_driver_viewer_count_v108(
  p_driver_token text
) returns integer
language sql security definer set search_path=public as $$
  select count(*)::integer
  from public.ridez_viewer_sessions s
  join public.ridez_rides r on r.id=s.ride_id
  where r.driver_token=p_driver_token
    and r.active=true
    and s.last_seen_at>=now()-interval '15 seconds'
$$;

revoke all on function public.ridez_driver_viewer_count_v108(text) from public;
grant execute on function public.ridez_driver_viewer_count_v108(text) to anon;

-- Samlet og geninstallerbar chatopdatering.
alter table public.ridez_messages add column if not exists direction text not null default 'viewer_to_driver';
alter table public.ridez_messages add column if not exists viewer_token text;
alter table public.ridez_messages add column if not exists reply_to_id bigint references public.ridez_messages(id) on delete set null;

create index if not exists ridez_messages_viewer_v108_idx
  on public.ridez_messages(ride_id,viewer_token,created_at);

create or replace function public.ridez_send_message_v108(
  p_public_token text,p_viewer_token text,p_sender_name text,p_body text
) returns text
language plpgsql security definer set search_path=public as $$
declare rid uuid; mv boolean; recent integer;
begin
  select r.id,r.moving into rid,mv
  from public.ridez_rides r
  where r.public_token=p_public_token and r.active=true limit 1;
  if rid is null then raise exception 'ride not active'; end if;
  if char_length(coalesce(p_viewer_token,''))<32 then raise exception 'invalid viewer token'; end if;
  if char_length(trim(coalesce(p_sender_name,''))) not between 1 and 40
     or char_length(trim(coalesce(p_body,''))) not between 1 and 240 then
    raise exception 'invalid message';
  end if;

  select count(*)::integer into recent
  from public.ridez_messages m
  where m.ride_id=rid and m.viewer_token=p_viewer_token
    and m.created_at>now()-interval '20 seconds';
  if recent>=5 then raise exception 'too many messages'; end if;

  insert into public.ridez_messages(ride_id,sender_name,body,direction,viewer_token)
  values(rid,trim(p_sender_name),trim(p_body),'viewer_to_driver',p_viewer_token);
  return case when mv then 'moving' else 'stopped' end;
end $$;

revoke all on function public.ridez_send_message_v108(text,text,text,text) from public;
grant execute on function public.ridez_send_message_v108(text,text,text,text) to anon;

create or replace function public.ridez_driver_messages_v108(p_driver_token text)
returns table(
  id bigint,sender_name text,body text,created_at timestamptz,
  viewer_token text,direction text,reply_to_id bigint
)
language sql security definer set search_path=public as $$
  select m.id,m.sender_name,m.body,m.created_at,m.viewer_token,m.direction,m.reply_to_id
  from public.ridez_messages m
  join public.ridez_rides r on r.id=m.ride_id
  where r.driver_token=p_driver_token and m.direction='viewer_to_driver'
  order by m.created_at desc limit 100
$$;

revoke all on function public.ridez_driver_messages_v108(text) from public;
grant execute on function public.ridez_driver_messages_v108(text) to anon;

create or replace function public.ridez_driver_reply_v108(
  p_driver_token text,p_message_id bigint,p_sender_name text,p_body text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtoken text; new_id bigint; mv boolean;
begin
  if char_length(trim(coalesce(p_sender_name,''))) not between 1 and 40 then raise exception 'invalid sender name'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message'; end if;

  select r.id,m.viewer_token,r.moving into rid,vtoken,mv
  from public.ridez_rides r
  join public.ridez_messages m on m.ride_id=r.id
  where r.driver_token=p_driver_token and r.active=true
    and m.id=p_message_id and m.direction='viewer_to_driver';

  if rid is null or vtoken is null then raise exception 'message not found'; end if;
  if mv then raise exception 'moving: chat disabled'; end if;

  insert into public.ridez_messages(ride_id,sender_name,body,direction,viewer_token,reply_to_id)
  values(rid,trim(p_sender_name),trim(p_body),'driver_to_viewer',vtoken,p_message_id)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.ridez_driver_reply_v108(text,bigint,text,text) from public;
grant execute on function public.ridez_driver_reply_v108(text,bigint,text,text) to anon;

create or replace function public.ridez_public_conversation_v108(
  p_public_token text,p_viewer_token text
) returns table(
  id bigint,sender_name text,body text,created_at timestamptz,
  direction text,reply_to_id bigint
)
language sql security definer set search_path=public as $$
  select m.id,m.sender_name,m.body,m.created_at,m.direction,m.reply_to_id
  from public.ridez_messages m
  join public.ridez_rides r on r.id=m.ride_id
  where r.public_token=p_public_token and m.viewer_token=p_viewer_token
    and m.direction in ('viewer_to_driver','driver_to_viewer')
  order by m.created_at asc limit 200
$$;

revoke all on function public.ridez_public_conversation_v108(text,text) from public;
grant execute on function public.ridez_public_conversation_v108(text,text) to anon;
