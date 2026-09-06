# RIDEZ v118 – kontrol

- Fundet hovedfejl: `MainActivity.onPause()` standsede overførslen fra den lokale GPS-kø, når Kurviger kom frem.
- Android-tjenesten uploader nu GPS-batches direkte til Supabase hvert femte sekund, uafhængigt af WebViewens livscyklus.
- GPS-punkter markeres først som uploadet efter et HTTP-svar med succes; ellers bliver de i køen og forsøges igen.
- Webvisning og serverupload har hver sin kvittering, så de ikke kan slette hinandens data.
- Native GPS anvender præcisions-, hastigheds-, accelerations- og afstandsfiltre før lagring.
- Stop tur bevarer de største servermålte værdier og kan ikke overskrive dem med en ældre lokal skærmstatus.
- v117-rettelsen til hældningsmåleren er bevaret.
- JavaScript-syntaks og 14 automatiske kontrakt-/GPS-tests er bestået.
- Android APK skal kompileres af GitHub Actions og derefter prøves fysisk med RIDEZ i baggrunden bag Kurviger.
