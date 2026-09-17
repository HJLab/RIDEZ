# RIDEZ Solo v200

RIDEZ Solo er en lokal Android-app til Hennings egne motorcykelture.

## Registrering

- Aktuel fart, topfart og gennemsnitsfart.
- Kilometer, samlet tid, aktiv køretid og stilstand.
- Kraftigste acceleration og bremsning.
- Bedste 0–50, 0–80 og 0–100 km/t.
- Aktuel hældning, maksimal venstre/højre hældning og antal sving.
- Lokal historik over afsluttede ture.

## Bevidst fjernet

- Deling, følgere, følgelinks og beskeder.
- Kort, rutelinje, Replay og billeder på en rute.
- Supabase, login og internetafhængighed.

GPS-koordinater bruges kun i hukommelsen mellem to målinger for at beregne afstand.
De gemmes ikke i databasen. Alle resultater gemmes lokalt på telefonen.

## Svinglogik

- Mindst cirka 10 km/t.
- Starter omkring 14°.
- Skal nå mindst cirka 17° og vare mindst 0,65 sekund.
- Motorcyklen skal tilbage under cirka 8°, før et nyt sving kan tælle.

## Byg

```bash
gradle -p android-app --no-daemon assembleDebug
```
