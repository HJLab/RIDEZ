-- RIDEZ Foelgedashboard v45
-- Koer denne EN gang i Supabase SQL Editor.
-- Tilfoejer live turstatistik til det offentlige foelgelink.

alter table public.ridez_rides
  add column if not exists live_lean_deg double precision not null default 0;

create or replace function public.ridez_update_live_stats_v45(
  p_driver_token text,
  p_distance_m double precision,
  p_max_speed_ms double precision,
  p_moving_s integer,
  p_stopped_s integer,
  p_accel_best_s double precision,
  p_accel_best_start_kmh double precision,
  p_accel_best_end_kmh double precision,
  p_accel_slowest_s double precision,
  p_accel_slowest_start_kmh double precision,
  p_accel_slowest_end_kmh double precision,
  p_live_lean_deg double precision,
  p_max_lean_left_deg double precision,
  p_max_lean_right_deg double precision,
  p_turn_left_count integer,
  p_turn_right_count integer
) returns void
language sql security definer set search_path=public as $$
 update public.ridez_rides
 set distance_m=greatest(0,coalesce(p_distance_m,0)),
     max_speed_ms=greatest(max_speed_ms,greatest(0,coalesce(p_max_speed_ms,0))),
     moving_s=greatest(0,coalesce(p_moving_s,0)),
     stopped_s=greatest(0,coalesce(p_stopped_s,0)),
     accel_best_80_s=case when p_accel_best_s is null then accel_best_80_s else greatest(0,p_accel_best_s) end,
     accel_best_80_start_kmh=case when p_accel_best_s is null then accel_best_80_start_kmh else p_accel_best_start_kmh end,
     accel_best_80_end_kmh=case when p_accel_best_s is null then accel_best_80_end_kmh else p_accel_best_end_kmh end,
     accel_slowest_80_s=case when p_accel_slowest_s is null then accel_slowest_80_s else greatest(0,p_accel_slowest_s) end,
     accel_slowest_80_start_kmh=case when p_accel_slowest_s is null then accel_slowest_80_start_kmh else p_accel_slowest_start_kmh end,
     accel_slowest_80_end_kmh=case when p_accel_slowest_s is null then accel_slowest_80_end_kmh else p_accel_slowest_end_kmh end,
     live_lean_deg=greatest(-70,least(70,coalesce(p_live_lean_deg,0))),
     max_lean_left_deg=greatest(max_lean_left_deg,greatest(0,coalesce(p_max_lean_left_deg,0))),
     max_lean_right_deg=greatest(max_lean_right_deg,greatest(0,coalesce(p_max_lean_right_deg,0))),
     turn_left_count=greatest(turn_left_count,greatest(0,coalesce(p_turn_left_count,0))),
     turn_right_count=greatest(turn_right_count,greatest(0,coalesce(p_turn_right_count,0)))
 where driver_token=p_driver_token and active=true
$$;

grant execute on function public.ridez_update_live_stats_v45(
 text,double precision,double precision,integer,integer,
 double precision,double precision,double precision,
 double precision,double precision,double precision,
 double precision,double precision,double precision,integer,integer
) to anon;

create or replace function public.ridez_public_ride_v45(p_public_token text)
returns table(
 title text,
 active boolean,
 moving boolean,
 lat double precision,
 lng double precision,
 speed_ms double precision,
 updated_at timestamptz,
 max_speed_ms double precision,
 distance_m double precision,
 moving_s integer,
 stopped_s integer,
 avg_moving_speed_ms double precision,
 accel_best_s double precision,
 accel_best_start_kmh double precision,
 accel_best_end_kmh double precision,
 accel_slowest_s double precision,
 accel_slowest_start_kmh double precision,
 accel_slowest_end_kmh double precision,
 live_lean_deg double precision,
 max_lean_left_deg double precision,
 max_lean_right_deg double precision,
 turn_left_count integer,
 turn_right_count integer
)
language sql security definer set search_path=public as $$
 select r.title,
        r.active,
        r.moving,
        r.lat,
        r.lng,
        r.speed_ms,
        r.updated_at,
        r.max_speed_ms,
        r.distance_m,
        r.moving_s,
        r.stopped_s,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end as avg_moving_speed_ms,
        r.accel_best_80_s,
        r.accel_best_80_start_kmh,
        r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,
        r.accel_slowest_80_start_kmh,
        r.accel_slowest_80_end_kmh,
        r.live_lean_deg,
        r.max_lean_left_deg,
        r.max_lean_right_deg,
        r.turn_left_count,
        r.turn_right_count
 from public.ridez_rides r
 where r.public_token=p_public_token
 limit 1
$$;

grant execute on function public.ridez_public_ride_v45(text) to anon;
