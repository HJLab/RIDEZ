-- RIDEZ backend. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.ridez_rides (
 id uuid primary key default gen_random_uuid(),
 public_token text unique not null,
 driver_token text unique not null,
 title text not null default 'RIDEZ live-tur',
 active boolean not null default true,
 moving boolean not null default false,
 lat double precision, lng double precision, speed_ms double precision not null default 0,
 accuracy_m double precision, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.ridez_track_points (
 id bigserial primary key, ride_id uuid not null references public.ridez_rides(id) on delete cascade,
 lat double precision not null,lng double precision not null,speed_ms double precision not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.ridez_messages (
 id bigserial primary key,ride_id uuid not null references public.ridez_rides(id) on delete cascade,
 sender_name text not null check(char_length(sender_name) between 1 and 40),
 body text not null check(char_length(body) between 1 and 240),created_at timestamptz not null default now()
);
alter table public.ridez_rides enable row level security;
alter table public.ridez_track_points enable row level security;
alter table public.ridez_messages enable row level security;
revoke all on public.ridez_rides, public.ridez_track_points, public.ridez_messages from anon, authenticated;

create or replace function public.ridez_create_ride(p_driver_token text,p_public_token text,p_title text default 'RIDEZ live-tur') returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; begin
 if length(p_driver_token)<32 or length(p_public_token)<32 then raise exception 'invalid token'; end if;
 insert into ridez_rides(driver_token,public_token,title) values(p_driver_token,p_public_token,left(coalesce(p_title,'RIDEZ live-tur'),80)) returning id into rid; return rid; end $$;

create or replace function public.ridez_update_location(p_driver_token text,p_lat double precision,p_lng double precision,p_speed_ms double precision,p_moving boolean,p_accuracy_m double precision) returns void language plpgsql security definer set search_path=public as $$
declare rid uuid; begin
 if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid coordinates'; end if;
 update ridez_rides set lat=p_lat,lng=p_lng,speed_ms=greatest(0,least(coalesce(p_speed_ms,0),120)),moving=coalesce(p_moving,false),accuracy_m=p_accuracy_m,updated_at=now() where driver_token=p_driver_token and active=true returning id into rid;
 if rid is null then raise exception 'ride not found'; end if;
 insert into ridez_track_points(ride_id,lat,lng,speed_ms) values(rid,p_lat,p_lng,greatest(0,least(coalesce(p_speed_ms,0),120)));
 end $$;

create or replace function public.ridez_end_ride(p_driver_token text) returns void language sql security definer set search_path=public as $$ update ridez_rides set active=false,moving=false,updated_at=now() where driver_token=p_driver_token $$;

create or replace function public.ridez_public_ride(p_public_token text) returns table(title text,active boolean,moving boolean,lat double precision,lng double precision,speed_ms double precision,updated_at timestamptz) language sql security definer set search_path=public as $$ select r.title,r.active,r.moving,r.lat,r.lng,r.speed_ms,r.updated_at from ridez_rides r where r.public_token=p_public_token limit 1 $$;

create or replace function public.ridez_public_track(p_public_token text) returns table(lat double precision,lng double precision,created_at timestamptz) language sql security definer set search_path=public as $$ select p.lat,p.lng,p.created_at from ridez_track_points p join ridez_rides r on r.id=p.ride_id where r.public_token=p_public_token order by p.id asc limit 5000 $$;

create or replace function public.ridez_send_message(p_public_token text,p_sender_name text,p_body text) returns text language plpgsql security definer set search_path=public as $$
declare rid uuid; mv boolean; recent int; begin
 select id,moving into rid,mv from ridez_rides where public_token=p_public_token and active=true;
 if rid is null then raise exception 'ride not active'; end if;
 if char_length(trim(p_sender_name)) not between 1 and 40 or char_length(trim(p_body)) not between 1 and 240 then raise exception 'invalid message'; end if;
 select count(*) into recent from ridez_messages where ride_id=rid and created_at>now()-interval '20 seconds';
 if recent>=5 then raise exception 'too many messages'; end if;
 insert into ridez_messages(ride_id,sender_name,body) values(rid,trim(p_sender_name),trim(p_body));
 return case when mv then 'moving' else 'stopped' end; end $$;

create or replace function public.ridez_driver_messages(p_driver_token text) returns table(id bigint,sender_name text,body text,created_at timestamptz) language sql security definer set search_path=public as $$ select m.id,m.sender_name,m.body,m.created_at from ridez_messages m join ridez_rides r on r.id=m.ride_id where r.driver_token=p_driver_token order by m.created_at desc limit 100 $$;

grant execute on function public.ridez_create_ride(text,text,text) to anon;
grant execute on function public.ridez_update_location(text,double precision,double precision,double precision,boolean,double precision) to anon;
grant execute on function public.ridez_end_ride(text) to anon;
grant execute on function public.ridez_public_ride(text) to anon;
grant execute on function public.ridez_public_track(text) to anon;
grant execute on function public.ridez_send_message(text,text,text) to anon;
grant execute on function public.ridez_driver_messages(text) to anon;
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


-- RIDEZ Historik v17 migration.
-- Run this ONCE in Supabase SQL Editor AFTER the v16 migration.

create or replace function public.ridez_delete_history_ride_v17(
 p_owner_token text,
 p_ride_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare deleted_count integer;
begin
 delete from ridez_rides
 where id=p_ride_id
   and owner_token=p_owner_token
   and active=false;
 get diagnostics deleted_count = row_count;
 return deleted_count=1;
end $$;

grant execute on function public.ridez_delete_history_ride_v17(text,uuid) to anon;
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
-- RIDEZ Fartgrænse v21
-- Kør denne ÉN gang i Supabase SQL Editor.
-- Tilføjer en offentlig læsefunktion, som også returnerer fartgrænsen knyttet til topfarten.
-- Selve den rå topfart returneres fortsat aldrig til følgere, hvis den var over fartgrænsen.

create or replace function public.ridez_public_ride_v21(p_public_token text)
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
 top_speed_over_limit boolean,
 top_speed_limit_kmh double precision
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
        (r.top_speed_over_limit is true) as top_speed_over_limit,
        r.top_speed_limit_kmh
 from ridez_rides r
 where r.public_token=p_public_token
 limit 1
$$;

grant execute on function public.ridez_public_ride_v21(text) to anon;
-- RIDEZ Fartgraense v23
-- Koer denne EN gang i Supabase SQL Editor.
-- Foelgere kan nu altid se den registrerede hoejeste hastighed.
-- Frontenden markerer tallet roligt med roed puls, mens den aktuelle hastighed er over den kendte fartgraense.

create or replace function public.ridez_public_ride_v23(p_public_token text)
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
 top_speed_over_limit boolean,
 top_speed_limit_kmh double precision
)
language sql security definer set search_path=public as $$
 select r.title,
        r.active,
        r.moving,
        r.lat,
        r.lng,
        r.speed_ms,
        r.updated_at,
        r.max_speed_ms as public_top_speed_ms,
        false as top_speed_hidden,
        (r.top_speed_over_limit is true) as top_speed_over_limit,
        r.top_speed_limit_kmh
 from ridez_rides r
 where r.public_token=p_public_token
 limit 1
$$;

grant execute on function public.ridez_public_ride_v23(text) to anon;
