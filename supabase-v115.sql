-- RIDEZ v115: enkelt, fast følgelink uden konto, brugernavn eller godkendelse.
-- Linkets hemmelige token er adgangsnøglen. Kun en aktiv tur kan læses.
-- Galleri-billeder forbliver private; kun RIDEZ-kamerabilleder udleveres.

create or replace function public.ridez_follow_access_allowed_v115(p_channel_token text,p_viewer_token text)
returns boolean language sql stable security definer set search_path=public as $$
 select char_length(coalesce(p_viewer_token,''))>=32 and exists(
   select 1 from public.ridez_follow_channels c
   where c.channel_token=p_channel_token and c.enabled=true
 )
$$;
revoke all on function public.ridez_follow_access_allowed_v115(text,text) from public;

create or replace function public.ridez_follow_access_status_v115(p_channel_token text,p_viewer_token text)
returns table(access_status text,driver_name text,ride_active boolean,enabled boolean)
language sql security definer set search_path=public as $$
 select case when c.enabled then 'approved' else 'disabled' end,
        c.driver_name,coalesce(r.active,false),c.enabled
 from public.ridez_follow_channels c
 left join public.ridez_rides r on r.id=c.current_ride_id
 where c.channel_token=p_channel_token
   and char_length(coalesce(p_viewer_token,''))>=32
 limit 1
$$;
revoke all on function public.ridez_follow_access_status_v115(text,text) from public;
grant execute on function public.ridez_follow_access_status_v115(text,text) to anon;

create or replace function public.ridez_follow_heartbeat_v115(p_channel_token text,p_viewer_token text)
returns integer language plpgsql security definer set search_path=public as $$
declare rid uuid;active_count integer;
begin
 select c.current_ride_id into rid
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 where c.channel_token=p_channel_token and c.enabled=true and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token);
 if rid is null then return 0;end if;
 insert into public.ridez_viewer_sessions(ride_id,viewer_token,last_seen_at)
 values(rid,p_viewer_token,now())
 on conflict(ride_id,viewer_token) do update set last_seen_at=excluded.last_seen_at;
 select count(*)::integer into active_count
 from public.ridez_viewer_sessions s
 where s.ride_id=rid and s.last_seen_at>=now()-interval '15 seconds';
 return coalesce(active_count,0);
end $$;
revoke all on function public.ridez_follow_heartbeat_v115(text,text) from public;
grant execute on function public.ridez_follow_heartbeat_v115(text,text) to anon;

create or replace function public.ridez_driver_viewer_count_v115(p_driver_token text)
returns integer language sql security definer set search_path=public as $$
 select count(*)::integer
 from public.ridez_viewer_sessions s
 join public.ridez_rides r on r.id=s.ride_id
 join public.ridez_follow_channels c on c.current_ride_id=r.id
 where r.driver_token=p_driver_token and r.active=true and c.enabled=true
   and s.last_seen_at>=now()-interval '15 seconds'
$$;
revoke all on function public.ridez_driver_viewer_count_v115(text) from public;
grant execute on function public.ridez_driver_viewer_count_v115(text) to anon;

create or replace function public.ridez_follow_ride_v115(p_channel_token text,p_viewer_token text)
returns table(title text,active boolean,moving boolean,lat double precision,lng double precision,speed_ms double precision,updated_at timestamptz,max_speed_ms double precision,distance_m double precision,moving_s integer,stopped_s integer,avg_moving_speed_ms double precision,accel_best_s double precision,accel_best_start_kmh double precision,accel_best_end_kmh double precision,accel_slowest_s double precision,accel_slowest_start_kmh double precision,accel_slowest_end_kmh double precision,live_lean_deg double precision,max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer,trip_length_code text,current_day_number integer,current_segment_number integer)
language sql security definer set search_path=public as $$
 select r.title,r.active,r.moving,r.lat,r.lng,r.speed_ms,r.updated_at,r.max_speed_ms,r.distance_m,r.moving_s,r.stopped_s,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end,
        r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh,
        r.live_lean_deg,r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year,
        coalesce(r.trip_length_code,'day'),greatest(1,r.current_day_number),greatest(1,r.current_segment_number)
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 where c.channel_token=p_channel_token and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token)
 limit 1
$$;
revoke all on function public.ridez_follow_ride_v115(text,text) from public;
grant execute on function public.ridez_follow_ride_v115(text,text) to anon;

create or replace function public.ridez_follow_track_v115(p_channel_token text,p_viewer_token text,p_day_number integer default 0,p_after_id bigint default 0,p_limit integer default 500)
returns table(point_id bigint,lat double precision,lng double precision,created_at timestamptz,day_number integer,segment_number integer)
language sql security definer set search_path=public as $$
 select p.id,p.lat,p.lng,coalesce(p.recorded_at,p.created_at),p.day_number,p.segment_number
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 join public.ridez_track_points p on p.ride_id=r.id
 where c.channel_token=p_channel_token and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token)
   and p.day_number=case when coalesce(p_day_number,0)>0 then p_day_number else greatest(1,r.current_day_number) end
   and p.id>greatest(0,coalesce(p_after_id,0))
 order by p.id limit greatest(1,least(coalesce(p_limit,500),1000))
$$;
revoke all on function public.ridez_follow_track_v115(text,text,integer,bigint,integer) from public;
grant execute on function public.ridez_follow_track_v115(text,text,integer,bigint,integer) to anon;

create or replace function public.ridez_follow_camera_photos_v115(p_channel_token text,p_viewer_token text,p_day_number integer default 0,p_after_id bigint default 0)
returns table(id bigint,storage_path text,lat double precision,lng double precision,captured_at timestamptz,day_number integer,country_name text)
language sql security definer set search_path=public as $$
 select ph.id,ph.storage_path,ph.lat,ph.lng,ph.captured_at,greatest(1,ph.day_number),ph.country_name
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 join public.ridez_photos ph on ph.ride_id=r.id
 where c.channel_token=p_channel_token and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token)
   and ph.photo_origin='camera'
   and (coalesce(p_day_number,0)=0 or ph.day_number=p_day_number)
   and ph.id>greatest(0,coalesce(p_after_id,0))
 order by ph.id limit 1000
$$;
revoke all on function public.ridez_follow_camera_photos_v115(text,text,integer,bigint) from public;
grant execute on function public.ridez_follow_camera_photos_v115(text,text,integer,bigint) to anon;

create or replace function public.ridez_follow_fun_facts_v115(p_channel_token text,p_viewer_token text)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(r.fun_facts,'{"version":115,"items":[]}'::jsonb)
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 where c.channel_token=p_channel_token and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token)
 limit 1
$$;
revoke all on function public.ridez_follow_fun_facts_v115(text,text) from public;
grant execute on function public.ridez_follow_fun_facts_v115(text,text) to anon;

create or replace function public.ridez_follow_send_message_v115(p_channel_token text,p_viewer_token text,p_sender_name text,p_body text)
returns text language plpgsql security definer set search_path=public as $$
declare rid uuid;mv boolean;recent integer;
begin
 select r.id,r.moving into rid,mv
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 where c.channel_token=p_channel_token and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token);
 if rid is null then raise exception 'access denied or ride inactive';end if;
 if char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message';end if;
 select count(*)::integer into recent from public.ridez_messages
 where ride_id=rid and viewer_token=p_viewer_token and created_at>now()-interval '20 seconds';
 if recent>=5 then raise exception 'too many messages';end if;
 insert into public.ridez_messages(ride_id,sender_name,body,direction,viewer_token)
 values(rid,'Følger',trim(p_body),'viewer_to_driver',p_viewer_token);
 return case when mv then 'moving' else 'stopped' end;
end $$;
revoke all on function public.ridez_follow_send_message_v115(text,text,text,text) from public;
grant execute on function public.ridez_follow_send_message_v115(text,text,text,text) to anon;

create or replace function public.ridez_follow_conversation_v115(p_channel_token text,p_viewer_token text)
returns table(id bigint,sender_name text,body text,created_at timestamptz,direction text,reply_to_id bigint)
language sql security definer set search_path=public as $$
 select m.id,m.sender_name,m.body,m.created_at,m.direction,m.reply_to_id
 from public.ridez_follow_channels c
 join public.ridez_rides r on r.id=c.current_ride_id
 join public.ridez_messages m on m.ride_id=r.id
 where c.channel_token=p_channel_token and r.active=true
   and public.ridez_follow_access_allowed_v115(p_channel_token,p_viewer_token)
   and m.viewer_token=p_viewer_token
   and m.direction in('viewer_to_driver','driver_to_viewer')
 order by m.created_at limit 200
$$;
revoke all on function public.ridez_follow_conversation_v115(text,text) from public;
grant execute on function public.ridez_follow_conversation_v115(text,text) to anon;

create or replace function public.ridez_driver_messages_v115(p_driver_token text)
returns table(id bigint,sender_name text,body text,created_at timestamptz,viewer_token text,direction text,reply_to_id bigint)
language sql security definer set search_path=public as $$
 select m.id,m.sender_name,m.body,m.created_at,m.viewer_token,m.direction,m.reply_to_id
 from public.ridez_messages m
 join public.ridez_rides r on r.id=m.ride_id
 join public.ridez_follow_channels c on c.current_ride_id=r.id
 where r.driver_token=p_driver_token and r.active=true and c.enabled=true
   and m.direction='viewer_to_driver'
 order by m.created_at desc limit 100
$$;
revoke all on function public.ridez_driver_messages_v115(text) from public;
grant execute on function public.ridez_driver_messages_v115(text) to anon;

create or replace function public.ridez_driver_reply_v115(p_driver_token text,p_message_id bigint,p_sender_name text,p_body text)
returns bigint language plpgsql security definer set search_path=public as $$
declare rid uuid;vtoken text;new_id bigint;
begin
 if char_length(trim(coalesce(p_sender_name,''))) not between 1 and 40
    or char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message';end if;
 select r.id,m.viewer_token into rid,vtoken
 from public.ridez_rides r
 join public.ridez_follow_channels c on c.current_ride_id=r.id
 join public.ridez_messages m on m.ride_id=r.id
 where r.driver_token=p_driver_token and r.active=true and r.moving=false and c.enabled=true
   and m.id=p_message_id and m.direction='viewer_to_driver';
 if rid is null then raise exception 'message unavailable or ride moving';end if;
 insert into public.ridez_messages(ride_id,sender_name,body,direction,viewer_token,reply_to_id)
 values(rid,trim(p_sender_name),trim(p_body),'driver_to_viewer',vtoken,p_message_id)
 returning id into new_id;
 return new_id;
end $$;
revoke all on function public.ridez_driver_reply_v115(text,bigint,text,text) from public;
grant execute on function public.ridez_driver_reply_v115(text,bigint,text,text) to anon;

-- Følgertabellerne kan fortsat ikke læses direkte fra browseren.
revoke all on public.ridez_follow_channels,public.ridez_follow_requests from anon,authenticated;
