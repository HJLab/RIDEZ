-- RIDEZ Flerdagsture v96
-- Koer denne fil EN GANG i Supabase SQL Editor.
-- Giver Dagstur / Weekend / 7 dage / 14 dage som én samlet tur,
-- opdelt i kalenderdage og mindre GPS-segmenter bag kulissen.
-- Alle GPS-punkter bevares i databasen. Lange spor hentes i sider,
-- saa Supabase-projektets normale API-graense ikke klipper ruten.

alter table public.ridez_rides add column if not exists trip_length_code text not null default 'day';
alter table public.ridez_rides add column if not exists current_day_number integer not null default 1;
alter table public.ridez_rides add column if not exists current_segment_number integer not null default 1;
alter table public.ridez_rides add column if not exists track_point_count bigint not null default 0;
alter table public.ridez_rides add column if not exists last_point_at timestamptz;

alter table public.ridez_track_points add column if not exists day_number integer not null default 1;
alter table public.ridez_track_points add column if not exists segment_number integer not null default 1;
alter table public.ridez_track_points add column if not exists recorded_at timestamptz not null default now();
update public.ridez_track_points set recorded_at=created_at;

alter table public.ridez_photos add column if not exists day_number integer not null default 1;

update public.ridez_rides r
set track_point_count=(select count(*) from public.ridez_track_points p where p.ride_id=r.id)
where coalesce(r.track_point_count,0)=0
  and exists(select 1 from public.ridez_track_points p where p.ride_id=r.id);

create index if not exists ridez_track_points_ride_day_segment_id_idx
  on public.ridez_track_points(ride_id,day_number,segment_number,id);
create index if not exists ridez_track_points_ride_recorded_idx
  on public.ridez_track_points(ride_id,recorded_at,id);
create index if not exists ridez_photos_ride_day_idx
  on public.ridez_photos(ride_id,day_number,captured_at);

create or replace function public.ridez_create_ride_v96(
 p_owner_token text,
 p_driver_token text,
 p_public_token text,
 p_title text,
 p_vehicle_type text,
 p_vehicle_name text,
 p_vehicle_make text,
 p_vehicle_model text,
 p_vehicle_year integer,
 p_trip_length_code text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtype text; tcode text;
begin
 if length(coalesce(p_owner_token,''))<32 or length(coalesce(p_driver_token,''))<32 or length(coalesce(p_public_token,''))<32 then raise exception 'invalid token'; end if;
 vtype:=case when p_vehicle_type='car' then 'car' else 'motorcycle' end;
 tcode:=case when p_trip_length_code in ('day','weekend','7days','14days') then p_trip_length_code else 'day' end;
 if p_vehicle_year is not null and (p_vehicle_year<1900 or p_vehicle_year>2100) then raise exception 'invalid vehicle year'; end if;
 insert into public.ridez_rides(
   owner_token,driver_token,public_token,title,vehicle_type,vehicle_name,vehicle_make,vehicle_model,vehicle_year,
   trip_length_code,current_day_number,current_segment_number,track_point_count
 ) values(
   p_owner_token,p_driver_token,p_public_token,left(coalesce(p_title,'RIDEZ live-tur'),80),vtype,
   left(nullif(trim(coalesce(p_vehicle_name,'')),''),40),left(nullif(trim(coalesce(p_vehicle_make,'')),''),40),
   left(nullif(trim(coalesce(p_vehicle_model,'')),''),40),p_vehicle_year,tcode,1,1,0
 ) returning id into rid;
 return rid;
end $$;

revoke all on function public.ridez_create_ride_v96(text,text,text,text,text,text,text,text,integer,text) from public;
grant execute on function public.ridez_create_ride_v96(text,text,text,text,text,text,text,text,integer,text) to anon;

create or replace function public.ridez_update_location_v96(
 p_driver_token text,
 p_lat double precision,
 p_lng double precision,
 p_speed_ms double precision,
 p_moving boolean,
 p_accuracy_m double precision,
 p_recorded_at timestamptz,
 p_day_number integer,
 p_segment_number integer
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; point_id bigint; dn integer; sn integer; rec timestamptz;
begin
 if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid coordinates'; end if;
 dn:=greatest(1,least(coalesce(p_day_number,1),366));
 sn:=greatest(1,least(coalesce(p_segment_number,1),1000000));
 rec:=coalesce(p_recorded_at,now());
 update public.ridez_rides
 set lat=p_lat,lng=p_lng,speed_ms=greatest(0,least(coalesce(p_speed_ms,0),120)),
     moving=coalesce(p_moving,false),accuracy_m=p_accuracy_m,updated_at=now(),last_point_at=rec,
     current_day_number=dn,current_segment_number=sn,track_point_count=coalesce(track_point_count,0)+1
 where driver_token=p_driver_token and active=true
 returning id into rid;
 if rid is null then raise exception 'ride not found'; end if;
 insert into public.ridez_track_points(ride_id,lat,lng,speed_ms,created_at,recorded_at,day_number,segment_number)
 values(rid,p_lat,p_lng,greatest(0,least(coalesce(p_speed_ms,0),120)),rec,rec,dn,sn)
 returning id into point_id;
 return point_id;
end $$;

revoke all on function public.ridez_update_location_v96(text,double precision,double precision,double precision,boolean,double precision,timestamptz,integer,integer) from public;
grant execute on function public.ridez_update_location_v96(text,double precision,double precision,double precision,boolean,double precision,timestamptz,integer,integer) to anon;

create or replace function public.ridez_end_ride_v96(
 p_driver_token text,
 p_distance_m double precision,
 p_duration_s integer,
 p_max_speed_ms double precision,
 p_moving_s integer,
 p_stopped_s integer,
 p_accel_0_80_s double precision,
 p_accel_0_100_s double precision,
 p_accel_best_80_s double precision,
 p_accel_best_80_start_kmh double precision,
 p_accel_best_80_end_kmh double precision,
 p_accel_slowest_80_s double precision,
 p_accel_slowest_80_start_kmh double precision,
 p_accel_slowest_80_end_kmh double precision,
 p_max_lean_left_deg double precision,
 p_max_lean_right_deg double precision,
 p_turn_left_count integer,
 p_turn_right_count integer
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 update public.ridez_rides as r
 set active=false,moving=false,
     distance_m=greatest(0,coalesce(p_distance_m,0)),duration_s=greatest(0,coalesce(p_duration_s,0)),
     max_speed_ms=greatest(0,coalesce(p_max_speed_ms,0)),moving_s=greatest(0,coalesce(p_moving_s,0)),stopped_s=greatest(0,coalesce(p_stopped_s,0)),
     accel_0_80_s=case when p_accel_0_80_s is null then null else greatest(0,p_accel_0_80_s) end,
     accel_0_100_s=case when p_accel_0_100_s is null then null else greatest(0,p_accel_0_100_s) end,
     accel_best_80_s=case when p_accel_best_80_s is null then null else greatest(0,p_accel_best_80_s) end,
     accel_best_80_start_kmh=p_accel_best_80_start_kmh,accel_best_80_end_kmh=p_accel_best_80_end_kmh,
     accel_slowest_80_s=case when p_accel_slowest_80_s is null then null else greatest(0,p_accel_slowest_80_s) end,
     accel_slowest_80_start_kmh=p_accel_slowest_80_start_kmh,accel_slowest_80_end_kmh=p_accel_slowest_80_end_kmh,
     max_lean_left_deg=greatest(0,least(90,coalesce(p_max_lean_left_deg,0))),
     max_lean_right_deg=greatest(0,least(90,coalesce(p_max_lean_right_deg,0))),
     turn_left_count=greatest(0,coalesce(p_turn_left_count,0)),turn_right_count=greatest(0,coalesce(p_turn_right_count,0)),
     ended_at=coalesce(r.ended_at,now()),updated_at=now(),track_point_count=(select count(*) from public.ridez_track_points p where p.ride_id=r.id)
 where r.driver_token=p_driver_token returning r.id into rid;
 if rid is null then raise exception 'ride not found'; end if;
 return rid;
end $$;

revoke all on function public.ridez_end_ride_v96(text,double precision,integer,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) from public;
grant execute on function public.ridez_end_ride_v96(text,double precision,integer,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) to anon;

create or replace function public.ridez_resume_ride_v96(p_owner_token text,p_driver_token text)
returns table(
 ride_id uuid,public_token text,created_at timestamptz,distance_m double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,trip_length_code text,current_day_number integer,current_segment_number integer,last_point_at timestamptz,track_point_count bigint,
 current_segment_point_count bigint,
 accel_0_80_s double precision,accel_0_100_s double precision,
 accel_best_80_s double precision,accel_best_80_start_kmh double precision,accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,accel_slowest_80_start_kmh double precision,accel_slowest_80_end_kmh double precision
)
language sql security definer set search_path=public as $$
 select r.id,r.public_token,r.created_at,r.distance_m,r.max_speed_ms,r.moving_s,r.stopped_s,
        r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,coalesce(r.trip_length_code,'day'),
        greatest(1,r.current_day_number),greatest(1,r.current_segment_number),r.last_point_at,
        coalesce(r.track_point_count,0),
        (select count(*) from public.ridez_track_points p where p.ride_id=r.id and p.day_number=r.current_day_number and p.segment_number=r.current_segment_number),
        r.accel_0_80_s,r.accel_0_100_s,
        r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh
 from public.ridez_rides r
 where r.owner_token=p_owner_token and r.driver_token=p_driver_token and r.active=true
 order by r.created_at desc limit 1
$$;

revoke all on function public.ridez_resume_ride_v96(text,text) from public;
grant execute on function public.ridez_resume_ride_v96(text,text) to anon;

create or replace function public.ridez_public_ride_v96(p_public_token text)
returns table(
 title text,active boolean,moving boolean,lat double precision,lng double precision,speed_ms double precision,updated_at timestamptz,
 max_speed_ms double precision,distance_m double precision,moving_s integer,stopped_s integer,avg_moving_speed_ms double precision,
 accel_best_s double precision,accel_best_start_kmh double precision,accel_best_end_kmh double precision,
 accel_slowest_s double precision,accel_slowest_start_kmh double precision,accel_slowest_end_kmh double precision,
 live_lean_deg double precision,max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer,
 trip_length_code text,current_day_number integer,current_segment_number integer
)
language sql security definer set search_path=public as $$
 select r.title,r.active,r.moving,r.lat,r.lng,r.speed_ms,r.updated_at,r.max_speed_ms,r.distance_m,r.moving_s,r.stopped_s,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end,
        r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh,
        r.live_lean_deg,r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year,
        coalesce(r.trip_length_code,'day'),greatest(1,r.current_day_number),greatest(1,r.current_segment_number)
 from public.ridez_rides r where r.public_token=p_public_token limit 1
$$;

revoke all on function public.ridez_public_ride_v96(text) from public;
grant execute on function public.ridez_public_ride_v96(text) to anon;

-- Remove draft signatures if this migration was tried previously.
drop function if exists public.ridez_public_track_v96(text,integer);
drop function if exists public.ridez_public_track_v96(text,integer,bigint);

create or replace function public.ridez_public_track_v96(
 p_public_token text,
 p_day_number integer default 0,
 p_after_id bigint default 0,
 p_limit integer default 500
)
returns table(point_id bigint,lat double precision,lng double precision,created_at timestamptz,day_number integer,segment_number integer)
language sql security definer set search_path=public as $$
 select p.id,p.lat,p.lng,coalesce(p.recorded_at,p.created_at),p.day_number,p.segment_number
 from public.ridez_track_points p join public.ridez_rides r on r.id=p.ride_id
 where r.public_token=p_public_token
   and p.day_number=case when coalesce(p_day_number,0)>0 then p_day_number else greatest(1,r.current_day_number) end
   and p.id>greatest(0,coalesce(p_after_id,0))
 order by p.id asc
 limit greatest(1,least(coalesce(p_limit,500),1000))
$$;

revoke all on function public.ridez_public_track_v96(text,integer,bigint,integer) from public;
grant execute on function public.ridez_public_track_v96(text,integer,bigint,integer) to anon;

create or replace function public.ridez_history_v96(p_owner_token text)
returns table(
 ride_id uuid,title text,created_at timestamptz,ended_at timestamptz,distance_m double precision,duration_s integer,
 avg_speed_ms double precision,avg_moving_speed_ms double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,photo_count bigint,
 accel_0_80_s double precision,accel_0_100_s double precision,accel_best_80_s double precision,accel_best_80_start_kmh double precision,accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,accel_slowest_80_start_kmh double precision,accel_slowest_80_end_kmh double precision,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer,
 trip_length_code text,day_count integer,segment_count integer,track_point_count bigint
)
language sql security definer set search_path=public as $$
 select r.id,r.title,r.created_at,r.ended_at,r.distance_m,r.duration_s,
        case when r.duration_s>0 then r.distance_m/r.duration_s else 0 end,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end,
        r.max_speed_ms,r.moving_s,r.stopped_s,(select count(*) from public.ridez_photos ph where ph.ride_id=r.id),
        r.accel_0_80_s,r.accel_0_100_s,r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh,
        r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year,
        coalesce(r.trip_length_code,'day'),
        greatest(1,coalesce((select max(p.day_number) from public.ridez_track_points p where p.ride_id=r.id),1))::integer,
        coalesce((select count(distinct (p.day_number,p.segment_number)) from public.ridez_track_points p where p.ride_id=r.id),0)::integer,
        coalesce((select count(*) from public.ridez_track_points p where p.ride_id=r.id),0)::bigint
 from public.ridez_rides r where r.owner_token=p_owner_token and r.active=false
 order by r.created_at desc limit 250
$$;

revoke all on function public.ridez_history_v96(text) from public;
grant execute on function public.ridez_history_v96(text) to anon;

create or replace function public.ridez_history_days_v96(p_owner_token text,p_ride_id uuid)
returns table(day_number integer,started_at timestamptz,ended_at timestamptz,distance_m double precision,max_speed_ms double precision,point_count bigint,segment_count integer)
language sql security definer set search_path=public as $$
 with ordered as (
   select p.id,p.day_number,p.segment_number,p.lat,p.lng,p.speed_ms,coalesce(p.recorded_at,p.created_at) as recorded_at,
          lag(p.lat) over(partition by p.day_number,p.segment_number order by p.id) as prev_lat,
          lag(p.lng) over(partition by p.day_number,p.segment_number order by p.id) as prev_lng
   from public.ridez_track_points p join public.ridez_rides r on r.id=p.ride_id
   where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
 ), calc as (
   select *,case when prev_lat is null or prev_lng is null then 0::double precision else
     2*6371000*asin(least(1.0,sqrt(
       power(sin(radians(lat-prev_lat)/2),2)+cos(radians(prev_lat))*cos(radians(lat))*power(sin(radians(lng-prev_lng)/2),2)
     ))) end as step_m
   from ordered
 )
 select day_number,min(recorded_at),max(recorded_at),
        coalesce(sum(case when step_m between 0 and 1000 then step_m else 0 end),0)::double precision,
        coalesce(max(speed_ms),0)::double precision,count(*)::bigint,count(distinct segment_number)::integer
 from calc group by day_number order by day_number
$$;

revoke all on function public.ridez_history_days_v96(text,uuid) from public;
grant execute on function public.ridez_history_days_v96(text,uuid) to anon;

-- Pagineret hentning: højst 1.000 rækker pr. kald. Hele turen komprimeres
-- til ca. 20.000 punkter, mens en enkelt dag kan bruge op til ca. 25.000.
drop function if exists public.ridez_history_track_v96(text,uuid,integer);
drop function if exists public.ridez_history_track_v96(text,uuid,integer,bigint);

create or replace function public.ridez_history_track_v96(
 p_owner_token text,
 p_ride_id uuid,
 p_day_number integer default 0,
 p_after_id bigint default 0,
 p_limit integer default 1000
)
returns table(point_id bigint,lat double precision,lng double precision,speed_ms double precision,created_at timestamptz,day_number integer,segment_number integer)
language sql security definer set search_path=public as $$
 with settings as (
   select case when coalesce(p_day_number,0)=0 then 20000 else 25000 end::bigint as cap
 ), base as (
   select p.id,p.lat,p.lng,p.speed_ms,coalesce(p.recorded_at,p.created_at) as recorded_at,p.day_number,p.segment_number,
          row_number() over(order by p.id) as rn,
          count(*) over() as total,
          row_number() over(partition by p.day_number,p.segment_number order by p.id) as segment_rn,
          count(*) over(partition by p.day_number,p.segment_number) as segment_total
   from public.ridez_track_points p join public.ridez_rides r on r.id=p.ride_id
   where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
     and (coalesce(p_day_number,0)=0 or p.day_number=p_day_number)
 ), qualified as (
   select b.*
   from base b cross join settings s
   where b.total<=s.cap
      or b.segment_rn=1
      or b.segment_rn=b.segment_total
      or mod(b.rn-1,greatest(1,ceil(b.total::numeric/s.cap)::bigint))=0
 )
 select id,lat,lng,speed_ms,recorded_at,day_number,segment_number
 from qualified
 where id>greatest(0,coalesce(p_after_id,0))
 order by id
 limit greatest(1,least(coalesce(p_limit,1000),1000))
$$;

revoke all on function public.ridez_history_track_v96(text,uuid,integer,bigint,integer) from public;
grant execute on function public.ridez_history_track_v96(text,uuid,integer,bigint,integer) to anon;

create or replace function public.ridez_register_photo_v96(
 p_driver_token text,p_storage_path text,p_lat double precision,p_lng double precision,p_captured_at timestamptz,p_day_number integer
) returns bigint
language plpgsql security definer set search_path=public as $$
declare rid uuid; photo_id bigint; dn integer;
begin
 if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid coordinates'; end if;
 select r.id into rid from public.ridez_rides r where r.driver_token=p_driver_token and r.active=true limit 1;
 if rid is null then raise exception 'active ride not found'; end if;
 if p_storage_path is null or p_storage_path not like ('v55/'||rid::text||'/%') then raise exception 'invalid storage path'; end if;
 dn:=greatest(1,least(coalesce(p_day_number,1),366));
 insert into public.ridez_photos(ride_id,storage_path,lat,lng,captured_at,day_number)
 values(rid,p_storage_path,p_lat,p_lng,coalesce(p_captured_at,now()),dn) returning id into photo_id;
 return photo_id;
end $$;

revoke all on function public.ridez_register_photo_v96(text,text,double precision,double precision,timestamptz,integer) from public;
grant execute on function public.ridez_register_photo_v96(text,text,double precision,double precision,timestamptz,integer) to anon;

create or replace function public.ridez_history_photos_v96(p_owner_token text,p_ride_id uuid)
returns table(id bigint,storage_path text,lat double precision,lng double precision,captured_at timestamptz,day_number integer)
language sql security definer set search_path=public as $$
 select ph.id,ph.storage_path,ph.lat,ph.lng,ph.captured_at,greatest(1,ph.day_number)
 from public.ridez_photos ph join public.ridez_rides r on r.id=ph.ride_id
 where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
 order by coalesce(ph.captured_at,ph.created_at) asc
$$;

revoke all on function public.ridez_history_photos_v96(text,uuid) from public;
grant execute on function public.ridez_history_photos_v96(text,uuid) to anon;
