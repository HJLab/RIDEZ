-- RIDEZ Forbrug & Hoejde v97
-- Koer denne fil EN GANG i Supabase SQL Editor EFTER v96.
-- Tilfoejer teoretisk koeretoejsforbrug samt turens hoejeste/laveste terraenhoejde.

alter table public.ridez_rides add column if not exists vehicle_consumption_l100 double precision;
alter table public.ridez_rides add column if not exists max_elevation_m double precision;
alter table public.ridez_rides add column if not exists min_elevation_m double precision;
alter table public.ridez_rides add column if not exists elevation_sample_count bigint not null default 0;

create or replace function public.ridez_create_ride_v97(
 p_owner_token text,
 p_driver_token text,
 p_public_token text,
 p_title text,
 p_vehicle_type text,
 p_vehicle_name text,
 p_vehicle_make text,
 p_vehicle_model text,
 p_vehicle_year integer,
 p_vehicle_consumption_l100 double precision,
 p_trip_length_code text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtype text; tcode text; consumption double precision;
begin
 if length(coalesce(p_owner_token,''))<32 or length(coalesce(p_driver_token,''))<32 or length(coalesce(p_public_token,''))<32 then raise exception 'invalid token'; end if;
 vtype:=case when p_vehicle_type='car' then 'car' else 'motorcycle' end;
 tcode:=case when p_trip_length_code in ('day','weekend','7days','14days') then p_trip_length_code else 'day' end;
 if p_vehicle_year is not null and (p_vehicle_year<1900 or p_vehicle_year>2100) then raise exception 'invalid vehicle year'; end if;
 consumption:=case when p_vehicle_consumption_l100 between 0.5 and 50 then p_vehicle_consumption_l100 else null end;
 insert into public.ridez_rides(
   owner_token,driver_token,public_token,title,vehicle_type,vehicle_name,vehicle_make,vehicle_model,vehicle_year,vehicle_consumption_l100,
   trip_length_code,current_day_number,current_segment_number,track_point_count
 ) values(
   p_owner_token,p_driver_token,p_public_token,left(coalesce(p_title,'RIDEZ live-tur'),80),vtype,
   left(nullif(trim(coalesce(p_vehicle_name,'')),''),40),left(nullif(trim(coalesce(p_vehicle_make,'')),''),40),
   left(nullif(trim(coalesce(p_vehicle_model,'')),''),40),p_vehicle_year,consumption,tcode,1,1,0
 ) returning id into rid;
 return rid;
end $$;
revoke all on function public.ridez_create_ride_v97(text,text,text,text,text,text,text,text,integer,double precision,text) from public;
grant execute on function public.ridez_create_ride_v97(text,text,text,text,text,text,text,text,integer,double precision,text) to anon;

create or replace function public.ridez_update_elevation_v97(
 p_driver_token text,
 p_max_elevation_m double precision,
 p_min_elevation_m double precision,
 p_sample_count integer default 0
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 update public.ridez_rides r set
   max_elevation_m=case when p_max_elevation_m is null then r.max_elevation_m when r.max_elevation_m is null then p_max_elevation_m else greatest(r.max_elevation_m,p_max_elevation_m) end,
   min_elevation_m=case when p_min_elevation_m is null then r.min_elevation_m when r.min_elevation_m is null then p_min_elevation_m else least(r.min_elevation_m,p_min_elevation_m) end,
   elevation_sample_count=coalesce(r.elevation_sample_count,0)+greatest(0,coalesce(p_sample_count,0)),updated_at=now()
 where r.driver_token=p_driver_token and r.active=true returning r.id into rid;
 if rid is null then raise exception 'ride not found'; end if;
 return rid;
end $$;
revoke all on function public.ridez_update_elevation_v97(text,double precision,double precision,integer) from public;
grant execute on function public.ridez_update_elevation_v97(text,double precision,double precision,integer) to anon;

create or replace function public.ridez_resume_ride_v97(p_owner_token text,p_driver_token text)
returns table(
 ride_id uuid,public_token text,created_at timestamptz,distance_m double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,trip_length_code text,current_day_number integer,current_segment_number integer,last_point_at timestamptz,track_point_count bigint,
 current_segment_point_count bigint,vehicle_consumption_l100 double precision,max_elevation_m double precision,min_elevation_m double precision,
 accel_0_80_s double precision,accel_0_100_s double precision,
 accel_best_80_s double precision,accel_best_80_start_kmh double precision,accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,accel_slowest_80_start_kmh double precision,accel_slowest_80_end_kmh double precision
)
language sql security definer set search_path=public as $$
 select r.id,r.public_token,r.created_at,r.distance_m,r.max_speed_ms,r.moving_s,r.stopped_s,
        r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,coalesce(r.trip_length_code,'day'),
        greatest(1,r.current_day_number),greatest(1,r.current_segment_number),r.last_point_at,coalesce(r.track_point_count,0),
        (select count(*) from public.ridez_track_points p where p.ride_id=r.id and p.day_number=r.current_day_number and p.segment_number=r.current_segment_number),
        r.vehicle_consumption_l100,r.max_elevation_m,r.min_elevation_m,
        r.accel_0_80_s,r.accel_0_100_s,r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh
 from public.ridez_rides r
 where r.owner_token=p_owner_token and r.driver_token=p_driver_token and r.active=true
 order by r.created_at desc limit 1
$$;
revoke all on function public.ridez_resume_ride_v97(text,text) from public;
grant execute on function public.ridez_resume_ride_v97(text,text) to anon;

create or replace function public.ridez_history_v97(p_owner_token text)
returns table(
 ride_id uuid,title text,created_at timestamptz,ended_at timestamptz,distance_m double precision,duration_s integer,
 avg_speed_ms double precision,avg_moving_speed_ms double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,photo_count bigint,
 accel_0_80_s double precision,accel_0_100_s double precision,accel_best_80_s double precision,accel_best_80_start_kmh double precision,accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,accel_slowest_80_start_kmh double precision,accel_slowest_80_end_kmh double precision,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer,vehicle_consumption_l100 double precision,
 max_elevation_m double precision,min_elevation_m double precision,elevation_sample_count bigint,
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
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year,r.vehicle_consumption_l100,
        r.max_elevation_m,r.min_elevation_m,coalesce(r.elevation_sample_count,0),coalesce(r.trip_length_code,'day'),
        greatest(1,coalesce((select max(p.day_number) from public.ridez_track_points p where p.ride_id=r.id),1))::integer,
        coalesce((select count(distinct (p.day_number,p.segment_number)) from public.ridez_track_points p where p.ride_id=r.id),0)::integer,
        coalesce((select count(*) from public.ridez_track_points p where p.ride_id=r.id),0)::bigint
 from public.ridez_rides r where r.owner_token=p_owner_token and r.active=false
 order by r.created_at desc limit 250
$$;
revoke all on function public.ridez_history_v97(text) from public;
grant execute on function public.ridez_history_v97(text) to anon;
