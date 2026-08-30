-- RIDEZ Topfart & Fartgraense v19 migration.
-- Run this ONCE in Supabase SQL Editor AFTER the v18 migration.
-- Public followers never receive the raw top speed when it is over the verified speed limit
-- or while the limit is unknown. The driver/history still keeps the real max speed.

alter table public.ridez_rides add column if not exists top_speed_limit_kmh double precision;
alter table public.ridez_rides add column if not exists top_speed_over_limit boolean;
alter table public.ridez_rides add column if not exists top_speed_unlimited boolean not null default false;
alter table public.ridez_rides add column if not exists top_speed_country_code text;
alter table public.ridez_rides add column if not exists top_speed_road_type text;
alter table public.ridez_rides add column if not exists top_speed_checked_at timestamptz;

create or replace function public.ridez_update_top_speed_v19(
 p_driver_token text,
 p_max_speed_ms double precision,
 p_limit_kmh double precision,
 p_unlimited boolean,
 p_country_code text,
 p_road_type text
) returns void
language plpgsql security definer set search_path=public as $$
declare
 new_speed double precision := greatest(0,least(coalesce(p_max_speed_ms,0),120));
 new_limit double precision := case when p_limit_kmh is null then null else greatest(1,least(p_limit_kmh,300)) end;
begin
 update ridez_rides r
 set max_speed_ms=greatest(r.max_speed_ms,new_speed),
     top_speed_limit_kmh=case when new_speed>=r.max_speed_ms then new_limit else r.top_speed_limit_kmh end,
     top_speed_unlimited=case when new_speed>=r.max_speed_ms then coalesce(p_unlimited,false) else r.top_speed_unlimited end,
     top_speed_over_limit=case when new_speed>=r.max_speed_ms then
       case when coalesce(p_unlimited,false) then false
            when new_limit is null then null
            else (new_speed*3.6)>new_limit+0.5 end
       else r.top_speed_over_limit end,
     top_speed_country_code=case when new_speed>=r.max_speed_ms then left(upper(coalesce(p_country_code,'')),2) else r.top_speed_country_code end,
     top_speed_road_type=case when new_speed>=r.max_speed_ms then left(coalesce(p_road_type,''),20) else r.top_speed_road_type end,
     top_speed_checked_at=case when new_speed>=r.max_speed_ms then now() else r.top_speed_checked_at end
 where r.driver_token=p_driver_token and r.active=true;
end $$;

create or replace function public.ridez_public_ride_v19(p_public_token text)
returns table(
 title text,
 active boolean,
 moving boolean,
 lat double precision,
 lng double precision,
 speed_ms double precision,
 updated_at timestamptz,
 public_top_speed_ms double precision,
 top_speed_hidden boolean,
 top_speed_over_limit boolean
)
language sql security definer set search_path=public as $$
 select r.title,
        r.active,
        r.moving,
        r.lat,
        r.lng,
        r.speed_ms,
        r.updated_at,
        case when r.top_speed_over_limit is false then r.max_speed_ms else null end as public_top_speed_ms,
        (r.max_speed_ms>0 and r.top_speed_over_limit is not false) as top_speed_hidden,
        (r.top_speed_over_limit is true) as top_speed_over_limit
 from ridez_rides r
 where r.public_token=p_public_token
 limit 1
$$;

create or replace function public.ridez_end_ride_v19(
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
     max_speed_ms=greatest(max_speed_ms,greatest(0,coalesce(p_max_speed_ms,0))),
     moving_s=greatest(0,coalesce(p_moving_s,0)),
     stopped_s=greatest(0,coalesce(p_stopped_s,0)),
     ended_at=now(),
     updated_at=now()
 where driver_token=p_driver_token
$$;

grant execute on function public.ridez_update_top_speed_v19(text,double precision,double precision,boolean,text,text) to anon;
grant execute on function public.ridez_public_ride_v19(text) to anon;
grant execute on function public.ridez_end_ride_v19(text,double precision,integer,double precision,integer,integer) to anon;
