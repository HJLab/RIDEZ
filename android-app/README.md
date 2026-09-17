# RIDEZ Solo v207

RIDEZ Solo er en lokal Android-app til Hennings egne motorcykelture.

v207 gør distance, aktiv køretid, samlet turtid, gennemsnitsfart og topfart tydeligt levende under en aktiv tur. Tid vises i sekunder, distance med 10 meters opløsning og hastigheder med én decimal. Beregningerne og historikken er uændrede.

## Registrering

- Aktuel fart, topfart og gennemsnitsfart.
- Kilometer, samlet tid, aktiv køretid og stilstand.
- Kraftigste acceleration og bremsning – både live og på hver gemt tur.
- Markering og samlet sletning af flere gemte ture, når ingen tur er aktiv.
- Aktuel og maksimal GPS-højde samt laveste punkt under havets overflade.
- Automatisk strømbesparende pause efter to minutters stilstand og automatisk fortsættelse ved bevægelse.
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

Hældningen beregnes ud fra tyngderetningen i telefonens skærmplan. Derfor virker
kalibreringen også, når telefonen er monteret næsten lodret. Kalibrering kan
foretages før eller under en tur og nulstiller turens lean-maksima og svingtal.

## Byg

```bash
gradle -p android-app --no-daemon assembleDebug
```
