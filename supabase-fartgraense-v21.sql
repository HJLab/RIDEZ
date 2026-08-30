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
