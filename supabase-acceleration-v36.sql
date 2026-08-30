-- RIDEZ Acceleration v36
-- Run once in Supabase SQL Editor.

alter table public.ridez_rides add column if not exists accel_0_80_s double precision;
alter table public.ridez_rides add column if not exists accel_0_100_s double precision;
alter table public.ridez_rides add column if not exists accel_best_80_s double precision;
alter table public.ridez_rides add column if not exists accel_best_80_start_kmh double precision;
alter table public.ridez_rides add column if not exists accel_best_80_end_kmh double precision;
alter table public.ridez_rides add column if not exists accel_slowest_80_s double precision;
alter table public.ridez_rides add column if not exists accel_slowest_80_start_kmh double precision;
alter table public.ridez_rides add column if not exists accel_slowest_80_end_kmh double precision;

create or replace function public.ridez_end_ride_v36(
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
 p_accel_slowest_80_end_kmh double precision
) returns void
language sql security definer set search_path=public as $$
 update ridez_rides
 set active=false,
     moving=false,
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
     ended_at=now(),
     updated_at=now()
 where driver_token=p_driver_token
$$;

create or replace function public.ridez_history_v36(p_owner_token text)
returns table(
 ride_id uuid,
 title text,
 created_at timestamptz,
 ended_at timestamptz,
 distance_m double precision,
 duration_s integer,
 avg_speed_ms double precision,
 avg_moving_speed_ms double precision,
 max_speed_ms double precision,
 moving_s integer,
 stopped_s integer,
 photo_count bigint,
 accel_0_80_s double precision,
 accel_0_100_s double precision,
 accel_best_80_s double precision,
 accel_best_80_start_kmh double precision,
 accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,
 accel_slowest_80_start_kmh double precision,
 accel_slowest_80_end_kmh double precision
)
language sql security definer set search_path=public as $$
 select r.id,
        r.title,
        r.created_at,
        r.ended_at,
        r.distance_m,
        r.duration_s,
        case when r.duration_s>0 then r.distance_m/r.duration_s else 0 end as avg_speed_ms,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end as avg_moving_speed_ms,
        r.max_speed_ms,
        r.moving_s,
        r.stopped_s,
        (select count(*) from ridez_photos ph where ph.ride_id=r.id) as photo_count,
        r.accel_0_80_s,
        r.accel_0_100_s,
        r.accel_best_80_s,
        r.accel_best_80_start_kmh,
        r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,
        r.accel_slowest_80_start_kmh,
        r.accel_slowest_80_end_kmh
 from ridez_rides r
 where r.owner_token=p_owner_token and r.active=false
 order by r.created_at desc
 limit 250
$$;

grant execute on function public.ridez_end_ride_v36(text,double precision,integer,double precision,integer,integer,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision) to anon;
grant execute on function public.ridez_history_v36(text) to anon;
