-- RIDEZ Historik v16 migration.
-- Run this ONCE in Supabase SQL Editor on an existing RIDEZ database.

alter table public.ridez_rides add column if not exists owner_token text;
alter table public.ridez_rides add column if not exists ended_at timestamptz;
alter table public.ridez_rides add column if not exists distance_m double precision not null default 0;
alter table public.ridez_rides add column if not exists duration_s integer not null default 0;
create index if not exists ridez_rides_owner_created_idx on public.ridez_rides(owner_token,created_at desc);

create table if not exists public.ridez_photos (
 id bigserial primary key,
 ride_id uuid not null references public.ridez_rides(id) on delete cascade,
 storage_path text not null,
 lat double precision,
 lng double precision,
 captured_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.ridez_photos enable row level security;
revoke all on public.ridez_photos from anon, authenticated;

create or replace function public.ridez_create_ride_v16(
 p_owner_token text,
 p_driver_token text,
 p_public_token text,
 p_title text default 'RIDEZ live-tur'
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if length(coalesce(p_owner_token,''))<32 or length(coalesce(p_driver_token,''))<32 or length(coalesce(p_public_token,''))<32 then
   raise exception 'invalid token';
 end if;
 insert into ridez_rides(owner_token,driver_token,public_token,title)
 values(p_owner_token,p_driver_token,p_public_token,left(coalesce(p_title,'RIDEZ live-tur'),80))
 returning id into rid;
 return rid;
end $$;

create or replace function public.ridez_end_ride_v16(
 p_driver_token text,
 p_distance_m double precision,
 p_duration_s integer
) returns void
language sql security definer set search_path=public as $$
 update ridez_rides
 set active=false,
     moving=false,
     distance_m=greatest(0,coalesce(p_distance_m,0)),
     duration_s=greatest(0,coalesce(p_duration_s,0)),
     ended_at=now(),
     updated_at=now()
 where driver_token=p_driver_token
$$;

create or replace function public.ridez_history(p_owner_token text)
returns table(
 ride_id uuid,
 title text,
 created_at timestamptz,
 ended_at timestamptz,
 distance_m double precision,
 duration_s integer,
 avg_speed_ms double precision,
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
        (select count(*) from ridez_photos ph where ph.ride_id=r.id) as photo_count
 from ridez_rides r
 where r.owner_token=p_owner_token and r.active=false
 order by r.created_at desc
 limit 250
$$;

create or replace function public.ridez_history_track(p_owner_token text,p_ride_id uuid)
returns table(lat double precision,lng double precision,speed_ms double precision,created_at timestamptz)
language sql security definer set search_path=public as $$
 select p.lat,p.lng,p.speed_ms,p.created_at
 from ridez_track_points p
 join ridez_rides r on r.id=p.ride_id
 where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
 order by p.id asc
 limit 10000
$$;

create or replace function public.ridez_history_photos(p_owner_token text,p_ride_id uuid)
returns table(id bigint,storage_path text,lat double precision,lng double precision,captured_at timestamptz)
language sql security definer set search_path=public as $$
 select ph.id,ph.storage_path,ph.lat,ph.lng,ph.captured_at
 from ridez_photos ph
 join ridez_rides r on r.id=ph.ride_id
 where r.id=p_ride_id and r.owner_token=p_owner_token and r.active=false
 order by coalesce(ph.captured_at,ph.created_at) asc
$$;

grant execute on function public.ridez_create_ride_v16(text,text,text,text) to anon;
grant execute on function public.ridez_end_ride_v16(text,double precision,integer) to anon;
grant execute on function public.ridez_history(text) to anon;
grant execute on function public.ridez_history_track(text,uuid) to anon;
grant execute on function public.ridez_history_photos(text,uuid) to anon;
