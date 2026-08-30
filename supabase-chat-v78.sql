-- RIDEZ Brugernavn v78
-- Koer denne fil EN GANG i Supabase SQL Editor.
-- Foererens gemte RIDEZ-brugernavn bruges som afsendernavn paa chat-svar.

create or replace function public.ridez_driver_reply_v78(
  p_driver_token text,
  p_message_id bigint,
  p_sender_name text,
  p_body text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtoken text; new_id bigint; mv boolean;
begin
  if char_length(trim(coalesce(p_sender_name,''))) not between 1 and 40 then raise exception 'invalid sender name'; end if;
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
  values(rid,trim(p_sender_name),trim(p_body),'driver_to_viewer',vtoken,p_message_id)
  returning id into new_id;
  return new_id;
end $$;

grant execute on function public.ridez_driver_reply_v78(text,bigint,text,text) to anon;
