-- RIDEZ Koeretoejer v80
-- Koer denne fil EN GANG i Supabase SQL Editor.
-- Gemmer aktivt koeretoej paa hver tur og giver foelgelink/historik korrekt Bil/Motorcykel-tekst.

alter table public.ridez_rides add column if not exists vehicle_type text not null default 'motorcycle';
alter table public.ridez_rides add column if not exists vehicle_name text;
alter table public.ridez_rides add column if not exists vehicle_make text;
alter table public.ridez_rides add column if not exists vehicle_model text;
alter table public.ridez_rides add column if not exists vehicle_year integer;

create or replace function public.ridez_create_ride_v80(
 p_owner_token text,
 p_driver_token text,
 p_public_token text,
 p_title text,
 p_vehicle_type text,
 p_vehicle_name text,
 p_vehicle_make text,
 p_vehicle_model text,
 p_vehicle_year integer
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; vtype text;
begin
 if length(coalesce(p_owner_token,''))<32 or length(coalesce(p_driver_token,''))<32 or length(coalesce(p_public_token,''))<32 then raise exception 'invalid token'; end if;
 vtype:=case when p_vehicle_type='car' then 'car' else 'motorcycle' end;
 if p_vehicle_year is not null and (p_vehicle_year<1900 or p_vehicle_year>2100) then raise exception 'invalid vehicle year'; end if;
 insert into ridez_rides(owner_token,driver_token,public_token,title,vehicle_type,vehicle_name,vehicle_make,vehicle_model,vehicle_year)
 values(p_owner_token,p_driver_token,p_public_token,left(coalesce(p_title,'RIDEZ live-tur'),80),vtype,left(nullif(trim(coalesce(p_vehicle_name,'')),''),40),left(nullif(trim(coalesce(p_vehicle_make,'')),''),40),left(nullif(trim(coalesce(p_vehicle_model,'')),''),40),p_vehicle_year)
 returning id into rid;
 return rid;
end $$;

grant execute on function public.ridez_create_ride_v80(text,text,text,text,text,text,text,text,integer) to anon;

create or replace function public.ridez_public_ride_v80(p_public_token text)
returns table(
 title text, active boolean, moving boolean, lat double precision, lng double precision, speed_ms double precision, updated_at timestamptz,
 max_speed_ms double precision, distance_m double precision, moving_s integer, stopped_s integer, avg_moving_speed_ms double precision,
 accel_best_s double precision, accel_best_start_kmh double precision, accel_best_end_kmh double precision,
 accel_slowest_s double precision, accel_slowest_start_kmh double precision, accel_slowest_end_kmh double precision,
 live_lean_deg double precision, max_lean_left_deg double precision, max_lean_right_deg double precision, turn_left_count integer, turn_right_count integer,
 vehicle_type text, vehicle_name text, vehicle_make text, vehicle_model text, vehicle_year integer
)
language sql security definer set search_path=public as $$
 select r.title,r.active,r.moving,r.lat,r.lng,r.speed_ms,r.updated_at,r.max_speed_ms,r.distance_m,r.moving_s,r.stopped_s,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end,
        r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh,
        r.live_lean_deg,r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year
 from public.ridez_rides r where r.public_token=p_public_token limit 1
$$;

grant execute on function public.ridez_public_ride_v80(text) to anon;

create or replace function public.ridez_history_v80(p_owner_token text)
returns table(
 ride_id uuid,title text,created_at timestamptz,ended_at timestamptz,distance_m double precision,duration_s integer,
 avg_speed_ms double precision,avg_moving_speed_ms double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,photo_count bigint,
 accel_0_80_s double precision,accel_0_100_s double precision,accel_best_80_s double precision,accel_best_80_start_kmh double precision,accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,accel_slowest_80_start_kmh double precision,accel_slowest_80_end_kmh double precision,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer
)
language sql security definer set search_path=public as $$
 select r.id,r.title,r.created_at,r.ended_at,r.distance_m,r.duration_s,
        case when r.duration_s>0 then r.distance_m/r.duration_s else 0 end,
        case when r.moving_s>0 then r.distance_m/r.moving_s else 0 end,
        r.max_speed_ms,r.moving_s,r.stopped_s,(select count(*) from ridez_photos ph where ph.ride_id=r.id),
        r.accel_0_80_s,r.accel_0_100_s,r.accel_best_80_s,r.accel_best_80_start_kmh,r.accel_best_80_end_kmh,
        r.accel_slowest_80_s,r.accel_slowest_80_start_kmh,r.accel_slowest_80_end_kmh,
        r.max_lean_left_deg,r.max_lean_right_deg,r.turn_left_count,r.turn_right_count,
        coalesce(r.vehicle_type,'motorcycle'),r.vehicle_name,r.vehicle_make,r.vehicle_model,r.vehicle_year
 from ridez_rides r where r.owner_token=p_owner_token and r.active=false order by r.created_at desc limit 250
$$;

grant execute on function public.ridez_history_v80(text) to anon;
