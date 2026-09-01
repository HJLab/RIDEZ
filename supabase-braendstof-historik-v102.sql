-- RIDEZ v102 - Blyfri 95 dagspris og fast pris-snapshot i Historik.
-- Koer denne fil EN GANG i Supabase SQL Editor EFTER v97.

create extension if not exists http with schema extensions;

create table if not exists public.ridez_fuel_price_cache (
  id smallint primary key check (id = 1),
  price numeric(6,2),
  station_count integer not null default 0,
  source text not null default 'OK',
  updated_at timestamptz not null default now()
);
alter table public.ridez_fuel_price_cache enable row level security;

alter table public.ridez_rides add column if not exists fuel95_price_dkk_l double precision;
alter table public.ridez_rides add column if not exists fuel95_price_updated_at timestamptz;
alter table public.ridez_rides add column if not exists fuel95_station_count integer;
alter table public.ridez_rides add column if not exists fuel95_source text;
alter table public.ridez_rides add column if not exists estimated_fuel_liters double precision;
alter table public.ridez_rides add column if not exists estimated_fuel_cost_dkk double precision;

create or replace function public.ridez_fuel95_price_v102()
returns table(price numeric, station_count integer, updated_at timestamptz, source text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_status integer;
  v_content text;
  v_price numeric;
  v_count integer;
  v_cached public.ridez_fuel_price_cache%rowtype;
begin
  select * into v_cached from public.ridez_fuel_price_cache where id = 1;
  if found and v_cached.price is not null and v_cached.updated_at > now() - interval '30 minutes' then
    return query select v_cached.price, v_cached.station_count, v_cached.updated_at, v_cached.source;
    return;
  end if;

  begin
    select h.status, h.content into v_status, v_content
    from extensions.http_get('https://mobility-prices.ok.dk/api/v1/fuel-prices') as h;
    if v_status <> 200 then raise exception 'OK API returned HTTP %', v_status; end if;

    with fuel_prices as (
      select (price_item.value ->> 'price')::numeric as p
      from jsonb_array_elements((v_content::jsonb) -> 'items') as station(value)
      cross join lateral jsonb_array_elements(station.value -> 'prices') as price_item(value)
      where lower(coalesce(price_item.value ->> 'product_name','')) like '%blyfri 95%'
        and (price_item.value ->> 'price') ~ '^[0-9]+([.][0-9]+)?$'
        and (price_item.value ->> 'price')::numeric between 5 and 40
    )
    select percentile_disc(0.5) within group (order by p), count(*)::integer
      into v_price, v_count from fuel_prices;
    if v_price is null or v_count = 0 then raise exception 'Ingen gyldige Blyfri 95-priser'; end if;

    insert into public.ridez_fuel_price_cache(id,price,station_count,source,updated_at)
    values(1,round(v_price,2),v_count,'OK',now())
    on conflict(id) do update set price=excluded.price,station_count=excluded.station_count,source=excluded.source,updated_at=excluded.updated_at;
    return query select round(v_price,2),v_count,now(),'OK'::text;
  exception when others then
    if v_cached.price is not null then
      return query select v_cached.price,v_cached.station_count,v_cached.updated_at,v_cached.source;
      return;
    end if;
    raise;
  end;
end;
$$;
revoke all on function public.ridez_fuel95_price_v102() from public;
grant execute on function public.ridez_fuel95_price_v102() to anon, authenticated;

create or replace function public.ridez_store_fuel_snapshot_v102(
  p_driver_token text,
  p_price_dkk_l double precision,
  p_price_updated_at timestamptz,
  p_station_count integer,
  p_source text,
  p_estimated_liters double precision,
  p_estimated_cost_dkk double precision
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
  if p_price_dkk_l is null or p_price_dkk_l < 5 or p_price_dkk_l > 40 then raise exception 'invalid fuel price'; end if;
  update public.ridez_rides r set
    fuel95_price_dkk_l=round(p_price_dkk_l::numeric,2),
    fuel95_price_updated_at=coalesce(p_price_updated_at,now()),
    fuel95_station_count=greatest(0,coalesce(p_station_count,0)),
    fuel95_source=left(coalesce(nullif(trim(p_source),''),'OK'),40),
    estimated_fuel_liters=case when p_estimated_liters between 0 and 10000 then p_estimated_liters else null end,
    estimated_fuel_cost_dkk=case when p_estimated_cost_dkk between 0 and 1000000 then p_estimated_cost_dkk else null end,
    updated_at=now()
  where r.driver_token=p_driver_token returning r.id into rid;
  if rid is null then raise exception 'ride not found'; end if;
  return rid;
end $$;
revoke all on function public.ridez_store_fuel_snapshot_v102(text,double precision,timestamptz,integer,text,double precision,double precision) from public;
grant execute on function public.ridez_store_fuel_snapshot_v102(text,double precision,timestamptz,integer,text,double precision,double precision) to anon, authenticated;

create or replace function public.ridez_history_v102(p_owner_token text)
returns table(
 ride_id uuid,title text,created_at timestamptz,ended_at timestamptz,distance_m double precision,duration_s integer,
 avg_speed_ms double precision,avg_moving_speed_ms double precision,max_speed_ms double precision,moving_s integer,stopped_s integer,photo_count bigint,
 accel_0_80_s double precision,accel_0_100_s double precision,accel_best_80_s double precision,accel_best_80_start_kmh double precision,accel_best_80_end_kmh double precision,
 accel_slowest_80_s double precision,accel_slowest_80_start_kmh double precision,accel_slowest_80_end_kmh double precision,
 max_lean_left_deg double precision,max_lean_right_deg double precision,turn_left_count integer,turn_right_count integer,
 vehicle_type text,vehicle_name text,vehicle_make text,vehicle_model text,vehicle_year integer,vehicle_consumption_l100 double precision,
 fuel95_price_dkk_l double precision,fuel95_price_updated_at timestamptz,fuel95_station_count integer,fuel95_source text,
 estimated_fuel_liters double precision,estimated_fuel_cost_dkk double precision,
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
        r.fuel95_price_dkk_l,r.fuel95_price_updated_at,r.fuel95_station_count,r.fuel95_source,r.estimated_fuel_liters,r.estimated_fuel_cost_dkk,
        r.max_elevation_m,r.min_elevation_m,coalesce(r.elevation_sample_count,0),coalesce(r.trip_length_code,'day'),
        greatest(1,coalesce((select max(p.day_number) from public.ridez_track_points p where p.ride_id=r.id),1))::integer,
        coalesce((select count(distinct (p.day_number,p.segment_number)) from public.ridez_track_points p where p.ride_id=r.id),0)::integer,
        coalesce((select count(*) from public.ridez_track_points p where p.ride_id=r.id),0)::bigint
 from public.ridez_rides r where r.owner_token=p_owner_token and r.active=false
 order by r.created_at desc limit 250
$$;
revoke all on function public.ridez_history_v102(text) from public;
grant execute on function public.ridez_history_v102(text) to anon, authenticated;

-- Kontrol: Skal returnere en pris, når filen er kørt.
select * from public.ridez_fuel95_price_v102();
