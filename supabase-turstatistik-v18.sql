-- RIDEZ Turstatistik v18 migration.
-- Run this ONCE in Supabase SQL Editor AFTER the v16/v17 migrations.

alter table public.ridez_rides add column if not exists max_speed_ms double precision not null default 0;
alter table public.ridez_rides add column if not exists moving_s integer not null default 0;
alter table public.ridez_rides add column if not exists stopped_s integer not null default 0;

create or replace function public.ridez_end_ride_v18(
 p_driver_token text,
 p_distance_m double precision,
 p_duration_s integer,
 p_max_speed_ms double precision,
 p_moving_s integer,
 p_stopped_s integer
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
     ended_at=now(),
     updated_at=now()
 where driver_token=p_driver_token
$$;

create or replace function public.ridez_history_v18(p_owner_token text)
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
 photo_count bigint
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
        (select count(*) from ridez_photos ph where ph.ride_id=r.id) as photo_count
 from ridez_rides r
 where r.owner_token=p_owner_token and r.active=false
 order by r.created_at desc
 limit 250
$$;

grant execute on function public.ridez_end_ride_v18(text,double precision,integer,double precision,integer,integer) to anon;
grant execute on function public.ridez_history_v18(text) to anon;
