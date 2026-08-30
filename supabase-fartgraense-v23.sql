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
