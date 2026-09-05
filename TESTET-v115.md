# RIDEZ v115 – kontrol

- JavaScript-syntaks kontrolleret med `node --check app.js`.
- 12 automatiske tests bestået.
- Ét fast følgelink genbruges på alle ture.
- Følgeren skal ikke oprette konto, skrive brugernavn eller godkendes.
- Linket viser automatisk den aktive tur eller beskeden "Ingen aktiv tur lige nu".
- Følgertallet tæller aktive følgesider inden for 15 sekunder.
- Kun billeder med `photo_origin='camera'` udleveres; galleri og ukendt oprindelse forbliver private.
- RIDEZ Android-GPS forbliver midlertidigt deaktiveret, så Kurviger prioriteres.
