-- RIDEZ Beskeder v73
-- Koer denne fil EN GANG i Supabase SQL Editor.
-- Tilfojer sikre tovejsbeskeder uden login. Hver foelger faar en lokal, anonym session-token,
-- saa et svar fra foereren kun vises til den foelger, der sendte den oprindelige besked.

alter table public.ridez_messages add column if not exists direction text not null default 'viewer_to_driver';
alter table public.ridez_messages add column if not exists viewer_token text;
alter table public.ridez_messages add column if not exists reply_to_id bigint references public.ridez_messages(id) on delete set null;

create index if not exists ridez_messages_viewer_idx
  on public.ridez_messages(ride_id, viewer_token, created_at);

create or replace function public.ridez_send_message_v73(
  p_public_token text,
  p_viewer_token text,
  p_sender_name text,
  p_body text
) returns text
language plpgsql security definer set search_path=public as $$
declare rid uuid; mv boolean; recent int;
begin
  select id,moving into rid,mv
  from ridez_rides
  where public_token=p_public_token and active=true;
  if rid is null then raise exception 'ride not active'; end if;
  if char_length(coalesce(p_viewer_token,'')) < 32 then raise exception 'invalid viewer token'; end if;
  if char_length(trim(p_sender_name)) not between 1 and 40 or char_length(trim(p_body)) not between 1 and 240 then
    raise exception 'invalid message';
  end if;
  select count(*) into recent
  from ridez_messages
  where ride_id=rid and viewer_token=p_viewer_token and created_at>now()-interval '20 seconds';
  if recent>=5 then raise exception 'too many messages'; end if;
  insert into ridez_messages(ride_id,sender_name,body,direction,viewer_token)
  values(rid,trim(p_sender_name),trim(p_body),'viewer_to_driver',p_viewer_token);
  return case when mv then 'moving' else 'stopped' end;
end $$;

create or replace function public.ridez_driver_messages_v73(p_driver_token text)
returns table(
  id bigint,
  sender_name text,
  body text,
  created_at timestamptz,
  viewer_token text,
  direction text,
  reply_to_id bigint
)
language sql security definer set search_path=public as $$
  select m.id,m.sender_name,m.body,m.created_at,m.viewer_token,m.direction,m.reply_to_id
  from ridez_messages m
  join ridez_rides r on r.id=m.ride_id
  where r.driver_token=p_driver_token and m.direction='viewer_to_driver'
  order by m.created_at desc
  limit 100
$$;

create or replace function public.ridez_driver_reply_v73(
  p_driver_token text,
  p_message_id bigint,
  p_body text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtoken text; new_id bigint;
begin
  if char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message'; end if;
  select r.id,m.viewer_token into rid,vtoken
  from ridez_rides r
  join ridez_messages m on m.ride_id=r.id
  where r.driver_token=p_driver_token
    and r.active=true
    and m.id=p_message_id
    and m.direction='viewer_to_driver';
  if rid is null or vtoken is null then raise exception 'message not found'; end if;
  insert into ridez_messages(ride_id,sender_name,body,direction,viewer_token,reply_to_id)
  values(rid,'Føreren',trim(p_body),'driver_to_viewer',vtoken,p_message_id)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.ridez_public_conversation_v73(
  p_public_token text,
  p_viewer_token text
) returns table(
  id bigint,
  sender_name text,
  body text,
  created_at timestamptz,
  direction text,
  reply_to_id bigint
)
language sql security definer set search_path=public as $$
  select m.id,m.sender_name,m.body,m.created_at,m.direction,m.reply_to_id
  from ridez_messages m
  join ridez_rides r on r.id=m.ride_id
  where r.public_token=p_public_token
    and m.viewer_token=p_viewer_token
    and m.direction in ('viewer_to_driver','driver_to_viewer')
  order by m.created_at asc
  limit 200
$$;

grant execute on function public.ridez_send_message_v73(text,text,text,text) to anon;
grant execute on function public.ridez_driver_messages_v73(text) to anon;
grant execute on function public.ridez_driver_reply_v73(text,bigint,text) to anon;
grant execute on function public.ridez_public_conversation_v73(text,text) to anon;
