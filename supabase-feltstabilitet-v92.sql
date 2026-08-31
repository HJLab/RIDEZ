-- RIDEZ Feltstabilitet v92
-- Koer denne fil EN GANG i Supabase SQL Editor.
-- Giver sikker afslutning/genoptagelse af rigtige ture og plads til lange GPS-spor.

create index if not exists ridez_track_points_ride_id_id_idx on public.ridez_track_points(ride_id,id);

create or replace function public.ridez_end_ride_v92(
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
 update ridez_rides
 set active=false,moving=false,
     distance_m=greatest(0,coalesce(p_distance_m,0)),
     duration_s=greatest(0,coalesce(p_duration_s,0)),
     max_speed_ms=greatest(0,coalesce(p_max_speed_ms,0)),
     moving_s=greatest(0,coalesce(p_moving_s,0)),
     stopped_s=greatest(0,coalesce(p_stopped_s,0)),
     accel_0_80_s=case when p_accel_0_80_s is null then null else greatest(0,p_accel_0_80_s) end,
     accel_0_100_s=case when p_accel_0_100_s is null then null else greatest(0,p_accel_0_100_s) end,
     accel_best_80_s=case when p_accel_best_80_s is null then null else greatest(0,p_accel_best_80_s) end,
     accel_best_80_start_kmh=p_accel_best_80_start_kmh,
     accel_best_80_end_kmh=p_accel_best_80_end_kmh,
     accel_slowest_80_s=case when p_accel_slowest_80_s is null then null else greatest(0,p_accel_slowest_80_s) end,
     accel_slowest_80_start_kmh=p_accel_slowest_80_start_kmh,
     accel_slowest_80_end_kmh=p_accel_slowest_80_end_kmh,
     max_lean_left_deg=greatest(0,least(90,coalesce(p_max_lean_left_deg,0))),
     max_lean_right_deg=greatest(0,least(90,coalesce(p_max_lean_right_deg,0))),
     turn_left_count=greatest(0,coalesce(p_turn_left_count,0)),
     turn_right_count=greatest(0,coalesce(p_turn_right_count,0)),
     ended_at=now(),updated_at=now()
 where driver_token=p_driver_token
 returning id into rid;
 if rid is null then raise exception 'ride not found'; end if;
 return rid;
end $$;

grant execute on function public.ridez_end_ride_v92(text,double precision,integer,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer) to anon;

create or replace function public.ridez_resume_ride_v92(p_owner_token text,p_driver_token text)
returns table(
 ride_id uuid,public_token text,created_at timestamptz,distance_m double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text
)
language sql security definer set search_path=public as $$
 select r.id,r.public_token,r.created_at,r.distance_m,r.max_speed_ms,r.moving_s,r.stopped_s,
        r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name
 from ridez_rides r
 where r.owner_token=p_owner_token and r.driver_token=p_driver_token and r.active=true
 order by r.created_at desc limit 1
$$;

grant execute on function public.ridez_resume_ride_v92(text,text) to anon;

create or replace function public.ridez_public_track(p_public_token text)
returns table(lat double precision,lng double precision,created_at timestamptz)
language sql security definer set search_path=public as $$
 select p.lat,p.lng,p.created_at
 from ridez_track_points p join ridez_rides r on r.id=p.ride_id
 where r.public_token=p_public_token
 order by p.id asc limit 25000
$$;

grant execute on function public.ridez_public_track(text) to anon;

create or replace function public.ridez_history_track(p_owner_token text,p_ride_id uuid)
returns table(lat double precision,lng double precision,speed_ms double precision,created_at timestamptz)
language sql security definer set search_path=public as $$
 select p.lat,p.lng,p.speed_ms,p.created_at
 from ridez_track_points p join ridez_rides r on r.id=p.ride_id
 where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
 order by p.id asc limit 25000
$$;

grant execute on function public.ridez_history_track(text,uuid) to anon;
