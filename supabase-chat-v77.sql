-- RIDEZ Chat-sikkerhed v77
-- Koer denne fil EN GANG i Supabase SQL Editor.
-- Beskeder fra foelgere kan stadig skrives under koersel, men de udleveres foerst til foereren,
-- naar motorcyklen holder stille. Foereren kan heller ikke sende svar, mens turen er i bevaegelse.

create or replace function public.ridez_driver_messages_v77(p_driver_token text)
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
  where r.driver_token=p_driver_token
    and r.active=true
    and r.moving=false
    and m.direction='viewer_to_driver'
  order by m.created_at desc
  limit 100
$$;

create or replace function public.ridez_driver_reply_v77(
  p_driver_token text,
  p_message_id bigint,
  p_body text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtoken text; new_id bigint; mv boolean;
begin
  if char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message'; end if;

  select r.id,m.viewer_token,r.moving into rid,vtoken,mv
  from ridez_rides r
  join ridez_messages m on m.ride_id=r.id
  where r.driver_token=p_driver_token
    and r.active=true
    and m.id=p_message_id
    and m.direction='viewer_to_driver';

  if rid is null or vtoken is null then raise exception 'message not found'; end if;
  if mv then raise exception 'moving: chat disabled'; end if;

  insert into ridez_messages(ride_id,sender_name,body,direction,viewer_token,reply_to_id)
  values(rid,'Føreren',trim(p_body),'driver_to_viewer',vtoken,p_message_id)
  returning id into new_id;
  return new_id;
end $$;

grant execute on function public.ridez_driver_messages_v77(text) to anon;
grant execute on function public.ridez_driver_reply_v77(text,bigint,text) to anon;
