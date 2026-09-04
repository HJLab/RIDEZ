-- RIDEZ v113 · pålidelig GPS-distance og sikkert, fast følgelink
-- Kør hele filen én gang i Supabase SQL Editor, før v113 flettes ind.

create extension if not exists pgcrypto;

-- Den godkendte deldistance gemmes med hvert nyt v113-punkt. Ældre punkter
-- forbliver NULL, så gamle ture fortsat kan bruge den tidligere beregning.
alter table public.ridez_track_points add column if not exists step_distance_m double precision;
alter table public.ridez_track_points add column if not exists total_distance_m double precision;
alter table public.ridez_track_points add column if not exists moving_s integer;
alter table public.ridez_track_points add column if not exists stopped_s integer;

create table if not exists public.ridez_follow_channels(
  id uuid primary key default gen_random_uuid(),
  owner_token text unique not null,
  channel_token text unique not null,
  driver_name text not null default 'Føreren',
  current_ride_id uuid references public.ridez_rides(id) on delete set null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ridez_follow_requests(
  channel_id uuid not null references public.ridez_follow_channels(id) on delete cascade,
  viewer_token text not null,
  viewer_name text not null,
  status text not null default 'pending' check(status in ('pending','approved','denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  last_seen_at timestamptz not null default now(),
  primary key(channel_id,viewer_token)
);

alter table public.ridez_follow_channels enable row level security;
alter table public.ridez_follow_requests enable row level security;
revoke all on public.ridez_follow_channels,public.ridez_follow_requests from anon,authenticated;
create index if not exists ridez_follow_requests_pending_idx on public.ridez_follow_requests(channel_id,status,requested_at);

create or replace function public.ridez_prepare_follow_channel_v113(
  p_owner_token text,p_suggested_token text,p_driver_name text
) returns text
language plpgsql security definer set search_path=public as $$
declare result_token text;
begin
  if char_length(coalesce(p_owner_token,''))<32 or char_length(coalesce(p_suggested_token,''))<32 then raise exception 'invalid token'; end if;
  insert into public.ridez_follow_channels(owner_token,channel_token,driver_name,enabled)
  values(p_owner_token,p_suggested_token,left(coalesce(nullif(trim(p_driver_name),''),'Føreren'),40),true)
  on conflict(owner_token) do update set driver_name=excluded.driver_name,updated_at=now()
  returning channel_token into result_token;
  return result_token;
end $$;
revoke all on function public.ridez_prepare_follow_channel_v113(text,text,text) from public;
grant execute on function public.ridez_prepare_follow_channel_v113(text,text,text) to anon;

create or replace function public.ridez_driver_follow_channel_status_v113(p_owner_token text)
returns table(channel_token text,enabled boolean)
language sql security definer set search_path=public as $$
 select c.channel_token,c.enabled from public.ridez_follow_channels c where c.owner_token=p_owner_token limit 1
$$;
revoke all on function public.ridez_driver_follow_channel_status_v113(text) from public;
grant execute on function public.ridez_driver_follow_channel_status_v113(text) to anon;

create or replace function public.ridez_create_ride_v113(
 p_owner_token text,p_driver_token text,p_public_token text,p_follow_channel_token text,p_driver_name text,
 p_title text,p_vehicle_type text,p_vehicle_name text,p_vehicle_make text,p_vehicle_model text,p_vehicle_year integer,
 p_vehicle_consumption_l100 double precision,p_trip_length_code text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; cid uuid; vtype text; tcode text; consumption double precision;
begin
 if char_length(coalesce(p_owner_token,''))<32 or char_length(coalesce(p_driver_token,''))<32 or char_length(coalesce(p_public_token,''))<32 or char_length(coalesce(p_follow_channel_token,''))<32 then raise exception 'invalid token'; end if;
 select id into cid from public.ridez_follow_channels where owner_token=p_owner_token and channel_token=p_follow_channel_token and enabled=true;
 if cid is null then raise exception 'follow channel not prepared'; end if;
 vtype:=case when p_vehicle_type='car' then 'car' else 'motorcycle' end;
 tcode:=case when p_trip_length_code in ('day','weekend','7days','14days') then p_trip_length_code else 'day' end;
 if p_vehicle_year is not null and (p_vehicle_year<1900 or p_vehicle_year>2100) then raise exception 'invalid vehicle year'; end if;
 consumption:=case when p_vehicle_consumption_l100 between 0.5 and 50 then p_vehicle_consumption_l100 else null end;
 insert into public.ridez_rides(owner_token,driver_token,public_token,title,vehicle_type,vehicle_name,vehicle_make,vehicle_model,vehicle_year,vehicle_consumption_l100,trip_length_code,current_day_number,current_segment_number,track_point_count,distance_m,moving_s,stopped_s)
 values(p_owner_token,p_driver_token,p_public_token,left(coalesce(p_title,'RIDEZ live-tur'),80),vtype,left(nullif(trim(coalesce(p_vehicle_name,'')),''),40),left(nullif(trim(coalesce(p_vehicle_make,'')),''),40),left(nullif(trim(coalesce(p_vehicle_model,'')),''),40),p_vehicle_year,consumption,tcode,1,1,0,0,0,0)
 returning id into rid;
 update public.ridez_follow_channels set current_ride_id=rid,driver_name=left(coalesce(nullif(trim(p_driver_name),''),'Føreren'),40),updated_at=now() where id=cid;
 return rid;
end $$;
revoke all on function public.ridez_create_ride_v113(text,text,text,text,text,text,text,text,text,text,integer,double precision,text) from public;
grant execute on function public.ridez_create_ride_v113(text,text,text,text,text,text,text,text,text,text,integer,double precision,text) to anon;

create or replace function public.ridez_update_location_v113(
 p_driver_token text,p_lat double precision,p_lng double precision,p_speed_ms double precision,p_moving boolean,p_accuracy_m double precision,
 p_recorded_at timestamptz,p_day_number integer,p_segment_number integer,p_step_distance_m double precision,p_total_distance_m double precision,
 p_moving_s integer,p_stopped_s integer
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; point_id bigint; dn integer; sn integer; rec timestamptz; safe_step double precision; safe_total double precision;
begin
 if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid coordinates'; end if;
 dn:=greatest(1,least(coalesce(p_day_number,1),366));sn:=greatest(1,least(coalesce(p_segment_number,1),1000000));rec:=coalesce(p_recorded_at,now());
 safe_step:=greatest(0,least(coalesce(p_step_distance_m,0),5000));safe_total:=greatest(0,coalesce(p_total_distance_m,0));
 select id into rid from public.ridez_rides where driver_token=p_driver_token and active=true for update;
 if rid is null then raise exception 'ride not found'; end if;
 if exists(select 1 from public.ridez_rides where id=rid and last_point_at is not null and rec<=last_point_at) then return null; end if;
 update public.ridez_rides set lat=p_lat,lng=p_lng,speed_ms=greatest(0,least(coalesce(p_speed_ms,0),75)),moving=coalesce(p_moving,false),accuracy_m=p_accuracy_m,updated_at=now(),last_point_at=rec,current_day_number=dn,current_segment_number=sn,track_point_count=coalesce(track_point_count,0)+1,distance_m=greatest(coalesce(distance_m,0),safe_total),moving_s=greatest(coalesce(moving_s,0),greatest(0,coalesce(p_moving_s,0))),stopped_s=greatest(coalesce(stopped_s,0),greatest(0,coalesce(p_stopped_s,0))) where id=rid;
 insert into public.ridez_track_points(ride_id,lat,lng,speed_ms,created_at,recorded_at,day_number,segment_number,step_distance_m,total_distance_m,moving_s,stopped_s)
 values(rid,p_lat,p_lng,greatest(0,least(coalesce(p_speed_ms,0),75)),rec,rec,dn,sn,safe_step,safe_total,greatest(0,coalesce(p_moving_s,0)),greatest(0,coalesce(p_stopped_s,0))) returning id into point_id;
 return point_id;
end $$;
revoke all on function public.ridez_update_location_v113(text,double precision,double precision,double precision,boolean,double precision,timestamptz,integer,integer,double precision,double precision,integer,integer) from public;
grant execute on function public.ridez_update_location_v113(text,double precision,double precision,double precision,boolean,double precision,timestamptz,integer,integer,double precision,double precision,integer,integer) to anon;

-- Dagsoversigten bruger v113's godkendte deldistance. For ældre ture uden disse
-- værdier bevares den gamle ruteafstand, så eksisterende historik ikke nulstilles.
create or replace function public.ridez_history_days_v113(p_owner_token text,p_ride_id uuid)
returns table(day_number integer,started_at timestamptz,ended_at timestamptz,distance_m double precision,max_speed_ms double precision,point_count bigint,segment_count integer)
language sql security definer set search_path=public as $$
 with ordered as (
   select p.id,p.day_number,p.segment_number,p.lat,p.lng,p.speed_ms,p.step_distance_m,coalesce(p.recorded_at,p.created_at) recorded_at,
          lag(p.lat) over(partition by p.day_number,p.segment_number order by p.id) prev_lat,lag(p.lng) over(partition by p.day_number,p.segment_number order by p.id) prev_lng
   from public.ridez_track_points p join public.ridez_rides r on r.id=p.ride_id where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
 ), calc as (
   select *,case when prev_lat is null then 0::double precision else 2*6371000*asin(least(1.0,sqrt(power(sin(radians(lat-prev_lat)/2),2)+cos(radians(prev_lat))*cos(radians(lat))*power(sin(radians(lng-prev_lng)/2),2)))) end fallback_step from ordered
 )
 select day_number,min(recorded_at),max(recorded_at),case when count(step_distance_m)>0 then coalesce(sum(step_distance_m),0)::double precision else coalesce(sum(case when fallback_step between 0 and 1000 then fallback_step else 0 end),0)::double precision end,coalesce(max(speed_ms),0)::double precision,count(*)::bigint,count(distinct segment_number)::integer
 from calc group by day_number order by day_number
$$;
revoke all on function public.ridez_history_days_v113(text,uuid) from public;
grant execute on function public.ridez_history_days_v113(text,uuid) to anon;

create or replace function public.ridez_follow_access_allowed_v113(p_channel_token text,p_viewer_token text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.ridez_follow_channels c join public.ridez_follow_requests q on q.channel_id=c.id where c.channel_token=p_channel_token and c.enabled=true and q.viewer_token=p_viewer_token and q.status='approved')
$$;
revoke all on function public.ridez_follow_access_allowed_v113(text,text) from public;

create or replace function public.ridez_follow_access_status_v113(p_channel_token text,p_viewer_token text)
returns table(access_status text,driver_name text,ride_active boolean,enabled boolean)
language sql security definer set search_path=public as $$
 select coalesce(q.status,'new'),c.driver_name,coalesce(r.active,false),c.enabled
 from public.ridez_follow_channels c left join public.ridez_follow_requests q on q.channel_id=c.id and q.viewer_token=p_viewer_token left join public.ridez_rides r on r.id=c.current_ride_id
 where c.channel_token=p_channel_token limit 1
$$;
revoke all on function public.ridez_follow_access_status_v113(text,text) from public;
grant execute on function public.ridez_follow_access_status_v113(text,text) to anon;

create or replace function public.ridez_request_follow_access_v113(p_channel_token text,p_viewer_token text,p_viewer_name text)
returns text language plpgsql security definer set search_path=public as $$
declare cid uuid; result_status text;
begin
 if char_length(coalesce(p_viewer_token,''))<32 or char_length(trim(coalesce(p_viewer_name,''))) not between 1 and 40 then raise exception 'invalid request'; end if;
 select id into cid from public.ridez_follow_channels where channel_token=p_channel_token and enabled=true;
 if cid is null then raise exception 'follow link unavailable'; end if;
 insert into public.ridez_follow_requests(channel_id,viewer_token,viewer_name,status,requested_at,decided_at,last_seen_at)
 values(cid,p_viewer_token,trim(p_viewer_name),'pending',now(),null,now())
 on conflict(channel_id,viewer_token) do update set viewer_name=excluded.viewer_name,status=case when ridez_follow_requests.status='approved' then 'approved' else 'pending' end,requested_at=case when ridez_follow_requests.status='approved' then ridez_follow_requests.requested_at else now() end,decided_at=case when ridez_follow_requests.status='approved' then ridez_follow_requests.decided_at else null end,last_seen_at=now()
 returning status into result_status;return result_status;
end $$;
revoke all on function public.ridez_request_follow_access_v113(text,text,text) from public;
grant execute on function public.ridez_request_follow_access_v113(text,text,text) to anon;

create or replace function public.ridez_driver_follow_requests_v113(p_driver_token text)
returns table(viewer_token text,viewer_name text,requested_at timestamptz)
language sql security definer set search_path=public as $$
 select q.viewer_token,q.viewer_name,q.requested_at from public.ridez_rides r join public.ridez_follow_channels c on c.current_ride_id=r.id join public.ridez_follow_requests q on q.channel_id=c.id where r.driver_token=p_driver_token and r.active=true and q.status='pending' order by q.requested_at asc limit 25
$$;
revoke all on function public.ridez_driver_follow_requests_v113(text) from public;
grant execute on function public.ridez_driver_follow_requests_v113(text) to anon;

create or replace function public.ridez_decide_follow_request_v113(p_driver_token text,p_viewer_token text,p_decision text)
returns boolean language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
 if p_decision not in ('approved','denied') then raise exception 'invalid decision'; end if;
 select c.id into cid from public.ridez_rides r join public.ridez_follow_channels c on c.current_ride_id=r.id where r.driver_token=p_driver_token and r.active=true and r.moving=false;
 if cid is null then raise exception 'ride moving or unavailable'; end if;
 update public.ridez_follow_requests set status=p_decision,decided_at=now(),last_seen_at=now() where channel_id=cid and viewer_token=p_viewer_token and status='pending';
 if not found then raise exception 'pending request not found'; end if;return true;
end $$;
revoke all on function public.ridez_decide_follow_request_v113(text,text,text) from public;
grant execute on function public.ridez_decide_follow_request_v113(text,text,text) to anon;

create or replace function public.ridez_follow_heartbeat_v113(p_channel_token text,p_viewer_token text)
returns integer language plpgsql security definer set search_path=public as $$
declare rid uuid; active_count integer;
begin
 select c.current_ride_id into rid from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id where c.channel_token=p_channel_token and c.enabled=true and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token);
 if rid is null then return 0; end if;
 insert into public.ridez_viewer_sessions(ride_id,viewer_token,last_seen_at) values(rid,p_viewer_token,now()) on conflict(ride_id,viewer_token) do update set last_seen_at=excluded.last_seen_at;
 select count(*)::integer into active_count from public.ridez_viewer_sessions s join public.ridez_follow_channels c on c.current_ride_id=s.ride_id join public.ridez_follow_requests q on q.channel_id=c.id and q.viewer_token=s.viewer_token and q.status='approved' where s.ride_id=rid and s.last_seen_at>=now()-interval '15 seconds';return coalesce(active_count,0);
end $$;
revoke all on function public.ridez_follow_heartbeat_v113(text,text) from public;
grant execute on function public.ridez_follow_heartbeat_v113(text,text) to anon;

create or replace function public.ridez_driver_viewer_count_v113(p_driver_token text)
returns integer language sql security definer set search_path=public as $$
 select count(*)::integer from public.ridez_viewer_sessions s join public.ridez_rides r on r.id=s.ride_id join public.ridez_follow_channels c on c.current_ride_id=r.id join public.ridez_follow_requests q on q.channel_id=c.id and q.viewer_token=s.viewer_token and q.status='approved' where r.driver_token=p_driver_token and r.active=true and s.last_seen_at>=now()-interval '15 seconds'
$$;
revoke all on function public.ridez_driver_viewer_count_v113(text) from public;
grant execute on function public.ridez_driver_viewer_count_v113(text) to anon;

create or replace function public.ridez_follow_ride_v113(p_channel_token text,p_viewer_token text)
returns table(title text,active boolean,moving boolean,lat double precision,lng double precision,speed_ms double precision,updated_at timestamptz,max_speed_ms double precision,distance_m double precision,moving_s integer,stopped_s integer,avg_moving_speed_ms double precision,accel_best_s double precision,accel_best_start_kmh double precision,accel_best_end_kmh double precision,accel_slowest_s double precision,accel_slowest_start_kmh double precision,accel_slowest_end_kmh double precision,live_lean_deg double precision,max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer,trip_length_code text,current_day_number integer,current_segment_number integer)
language sql security definer set search_path=public as $$
 select r.title,r.active,r.moving,r.lat,r.lng,r.speed_ms,r.updated_at,r.max_speed_ms,r.distance_m,r.moving_s,r.stopped_s,case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end,r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh,r.live_lean_deg,r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year,coalesce(r.trip_length_code,'day'),greatest(1,r.current_day_number),greatest(1,r.current_segment_number)
 from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id where c.channel_token=p_channel_token and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token) limit 1
$$;
revoke all on function public.ridez_follow_ride_v113(text,text) from public;
grant execute on function public.ridez_follow_ride_v113(text,text) to anon;

create or replace function public.ridez_follow_track_v113(p_channel_token text,p_viewer_token text,p_day_number integer default 0,p_after_id bigint default 0,p_limit integer default 500)
returns table(point_id bigint,lat double precision,lng double precision,created_at timestamptz,day_number integer,segment_number integer)
language sql security definer set search_path=public as $$
 select p.id,p.lat,p.lng,coalesce(p.recorded_at,p.created_at),p.day_number,p.segment_number from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id join public.ridez_track_points p on p.ride_id=r.id where c.channel_token=p_channel_token and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token) and p.day_number=case when coalesce(p_day_number,0)>0 then p_day_number else greatest(1,r.current_day_number) end and p.id>greatest(0,coalesce(p_after_id,0)) order by p.id limit greatest(1,least(coalesce(p_limit,500),1000))
$$;
revoke all on function public.ridez_follow_track_v113(text,text,integer,bigint,integer) from public;
grant execute on function public.ridez_follow_track_v113(text,text,integer,bigint,integer) to anon;

create or replace function public.ridez_follow_camera_photos_v113(p_channel_token text,p_viewer_token text,p_day_number integer default 0,p_after_id bigint default 0)
returns table(id bigint,storage_path text,lat double precision,lng double precision,captured_at timestamptz,day_number integer,country_name text)
language sql security definer set search_path=public as $$
 select ph.id,ph.storage_path,ph.lat,ph.lng,ph.captured_at,greatest(1,ph.day_number),ph.country_name from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id join public.ridez_photos ph on ph.ride_id=r.id where c.channel_token=p_channel_token and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token) and ph.photo_origin='camera' and (coalesce(p_day_number,0)=0 or ph.day_number=p_day_number) and ph.id>greatest(0,coalesce(p_after_id,0)) order by ph.id limit 1000
$$;
revoke all on function public.ridez_follow_camera_photos_v113(text,text,integer,bigint) from public;
grant execute on function public.ridez_follow_camera_photos_v113(text,text,integer,bigint) to anon;

create or replace function public.ridez_update_fun_facts_v113(p_driver_token text,p_fun_facts jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare rid uuid; safe_items jsonb;
begin
 select id into rid from public.ridez_rides where driver_token=p_driver_token and active=true order by created_at desc limit 1;if rid is null then raise exception 'active ride not found';end if;
 with raw as (select case when (e->>'id')~'^[0-9]+$' then (e->>'id')::integer end id,left(coalesce(e->>'value',''),120) value,left(coalesce(e->>'detail',''),180) detail from jsonb_array_elements(case when jsonb_typeof(p_fun_facts)='object' and jsonb_typeof(p_fun_facts->'items')='array' then p_fun_facts->'items' else '[]'::jsonb end)e),allowed as (select distinct on(id) id,value,detail from raw where id in(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,35,36,37,39,40) and value<>'' order by id)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'value',value,'detail',detail) order by id),'[]'::jsonb) into safe_items from allowed;
 update public.ridez_rides set fun_facts=jsonb_build_object('version',113,'items',safe_items) where id=rid;return true;
end $$;
revoke all on function public.ridez_update_fun_facts_v113(text,jsonb) from public;
grant execute on function public.ridez_update_fun_facts_v113(text,jsonb) to anon;

create or replace function public.ridez_follow_fun_facts_v113(p_channel_token text,p_viewer_token text)
returns jsonb language sql security definer set search_path=public as $$
 select coalesce(r.fun_facts,'{"version":113,"items":[]}'::jsonb) from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id where c.channel_token=p_channel_token and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token) limit 1
$$;
revoke all on function public.ridez_follow_fun_facts_v113(text,text) from public;
grant execute on function public.ridez_follow_fun_facts_v113(text,text) to anon;

create or replace function public.ridez_follow_send_message_v113(p_channel_token text,p_viewer_token text,p_sender_name text,p_body text)
returns text language plpgsql security definer set search_path=public as $$
declare rid uuid; mv boolean; recent integer;
begin
 select r.id,r.moving into rid,mv from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id where c.channel_token=p_channel_token and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token);
 if rid is null then raise exception 'access denied or ride inactive';end if;if char_length(trim(coalesce(p_sender_name,''))) not between 1 and 40 or char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message';end if;
 select count(*)::integer into recent from public.ridez_messages where ride_id=rid and viewer_token=p_viewer_token and created_at>now()-interval '20 seconds';if recent>=5 then raise exception 'too many messages';end if;
 insert into public.ridez_messages(ride_id,sender_name,body,direction,viewer_token) values(rid,trim(p_sender_name),trim(p_body),'viewer_to_driver',p_viewer_token);return case when mv then 'moving' else 'stopped' end;
end $$;
revoke all on function public.ridez_follow_send_message_v113(text,text,text,text) from public;
grant execute on function public.ridez_follow_send_message_v113(text,text,text,text) to anon;

create or replace function public.ridez_follow_conversation_v113(p_channel_token text,p_viewer_token text)
returns table(id bigint,sender_name text,body text,created_at timestamptz,direction text,reply_to_id bigint)
language sql security definer set search_path=public as $$
 select m.id,m.sender_name,m.body,m.created_at,m.direction,m.reply_to_id from public.ridez_follow_channels c join public.ridez_rides r on r.id=c.current_ride_id join public.ridez_messages m on m.ride_id=r.id where c.channel_token=p_channel_token and r.active=true and public.ridez_follow_access_allowed_v113(p_channel_token,p_viewer_token) and m.viewer_token=p_viewer_token and m.direction in('viewer_to_driver','driver_to_viewer') order by m.created_at limit 200
$$;
revoke all on function public.ridez_follow_conversation_v113(text,text) from public;
grant execute on function public.ridez_follow_conversation_v113(text,text) to anon;

create or replace function public.ridez_driver_messages_v113(p_driver_token text)
returns table(id bigint,sender_name text,body text,created_at timestamptz,viewer_token text,direction text,reply_to_id bigint)
language sql security definer set search_path=public as $$
 select m.id,m.sender_name,m.body,m.created_at,m.viewer_token,m.direction,m.reply_to_id from public.ridez_messages m join public.ridez_rides r on r.id=m.ride_id join public.ridez_follow_channels c on c.current_ride_id=r.id join public.ridez_follow_requests q on q.channel_id=c.id and q.viewer_token=m.viewer_token and q.status='approved' where r.driver_token=p_driver_token and r.active=true and m.direction='viewer_to_driver' order by m.created_at desc limit 100
$$;
revoke all on function public.ridez_driver_messages_v113(text) from public;
grant execute on function public.ridez_driver_messages_v113(text) to anon;

create or replace function public.ridez_driver_reply_v113(p_driver_token text,p_message_id bigint,p_sender_name text,p_body text)
returns bigint language plpgsql security definer set search_path=public as $$
declare rid uuid;vtoken text;new_id bigint;
begin
 if char_length(trim(coalesce(p_sender_name,''))) not between 1 and 40 or char_length(trim(coalesce(p_body,''))) not between 1 and 240 then raise exception 'invalid message';end if;
 select r.id,m.viewer_token into rid,vtoken from public.ridez_rides r join public.ridez_follow_channels c on c.current_ride_id=r.id join public.ridez_messages m on m.ride_id=r.id join public.ridez_follow_requests q on q.channel_id=c.id and q.viewer_token=m.viewer_token and q.status='approved' where r.driver_token=p_driver_token and r.active=true and r.moving=false and m.id=p_message_id and m.direction='viewer_to_driver';
 if rid is null then raise exception 'message unavailable or ride moving';end if;insert into public.ridez_messages(ride_id,sender_name,body,direction,viewer_token,reply_to_id) values(rid,trim(p_sender_name),trim(p_body),'driver_to_viewer',vtoken,p_message_id) returning id into new_id;return new_id;
end $$;
revoke all on function public.ridez_driver_reply_v113(text,bigint,text,text) from public;
grant execute on function public.ridez_driver_reply_v113(text,bigint,text,text) to anon;

create or replace function public.ridez_set_follow_channel_enabled_v113(p_owner_token text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin update public.ridez_follow_channels set enabled=coalesce(p_enabled,false),updated_at=now() where owner_token=p_owner_token;if not found then raise exception 'channel not found';end if;return coalesce(p_enabled,false);end $$;
revoke all on function public.ridez_set_follow_channel_enabled_v113(text,boolean) from public;
grant execute on function public.ridez_set_follow_channel_enabled_v113(text,boolean) to anon;

create or replace function public.ridez_rotate_follow_channel_v113(p_owner_token text,p_new_channel_token text,p_driver_name text)
returns text language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin if char_length(coalesce(p_new_channel_token,''))<32 then raise exception 'invalid token';end if;select id into cid from public.ridez_follow_channels where owner_token=p_owner_token for update;if cid is null then raise exception 'channel not found';end if;delete from public.ridez_follow_requests where channel_id=cid;update public.ridez_follow_channels set channel_token=p_new_channel_token,driver_name=left(coalesce(nullif(trim(p_driver_name),''),'Føreren'),40),enabled=true,current_ride_id=null,updated_at=now() where id=cid;return p_new_channel_token;end $$;
revoke all on function public.ridez_rotate_follow_channel_v113(text,text,text) from public;
grant execute on function public.ridez_rotate_follow_channel_v113(text,text,text) to anon;

-- Sikkerhedstjek: ingen af de to følgertabeller må kunne læses direkte fra browseren.
revoke all on public.ridez_follow_channels,public.ridez_follow_requests from anon,authenticated;
