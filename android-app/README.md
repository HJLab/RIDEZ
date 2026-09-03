# RIDEZ Android

Denne Android-app viser den eksisterende RIDEZ-webapp og erstatter browserens GPS med en Android foreground location service.

## Det løser Android-versionen

- GPS fortsætter, når Kurviger er fremme.
- GPS fortsætter, når skærmen slukkes.
- Punkter gemmes lokalt i SQLite, mens RIDEZ er i baggrunden.
- Gemte punkter afleveres kronologisk til RIDEZ, når skærmbilledet igen er aktivt.
- En fast Android-notifikation viser tydeligt, at turregistreringen kører.
- Stop tur i RIDEZ stopper også Androids GPS-tjeneste.

Android-appen indlæser `https://hjlab.github.io/RIDEZ/`, så webfunktioner, Supabase, historik, Replay og deling fortsat bruger samme løsning som v103.

## Byg

```bash
gradle -p android-app assembleDebug
```

APK-filen oprettes som:

`android-app/app/build/outputs/apk/debug/app-debug.apk`

GitHub Actions-workflowet `Build RIDEZ Android APK` bygger desuden APK-filen automatisk og gemmer den som artefaktet `RIDEZ-Android-debug`.

## Første test

1. Installer APK-filen på Android-telefonen.
2. Tillad notifikationer og præcis placering.
3. Start en RIDEZ-tur, og kontrollér at notifikationen `RIDEZ registrerer turen` vises.
4. Åbn Kurviger eller sluk skærmen i mindst 3 minutter.
5. Åbn RIDEZ igen, afslut turen, og kontrollér hele sporet i Historik.

Debug-APK'en er kun til den første feltprøve. En senere udgivelse skal signeres med en privat release-nøgle, før den distribueres bredt eller lægges i Google Play.
