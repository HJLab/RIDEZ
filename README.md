# RIDEZ

Første brugbare PWA-version af RIDEZ: live GPS-tur, delbart følgelink, kort, turspor og sikker beskedvisning.

## Opsætning
1. Opret et gratis Supabase-projekt.
2. Åbn SQL Editor i Supabase, indsæt hele `supabase.sql`, og kør den én gang.
3. I Supabase: Project Settings / Data API. Kopiér Project URL og anon/publishable key.
4. Åbn `config.js` og indsæt værdierne.
5. Upload alle filer og mapper til roden af dit GitHub repository.
6. Aktivér GitHub Pages for repositoryets main-branch.
7. Åbn GitHub Pages-linket på telefonen og tilføj siden til startskærmen.
8. Tryk `Start tur`, tillad præcis placering, og brug `Del følgelink`.

## Trafiksikker beskeder
- Når hastigheden er over ca. 9 km/t betragtes motorcyklen som i bevægelse.
- Når hastigheden er under ca. 3 km/t, starter stop-timeren.
- Først efter 3 sekunders stilstand frigives ventende beskeder i førervisningen.
- Afsenderen får straks besked om, at føreren er på farten, når status er `KØRER`.

## Vigtig begrænsning i web/PWA-versionen
Web-Geolocation kræver HTTPS og brugerens tilladelse. På Android kan browser/PWA-sporing blive begrænset, når appen er i baggrunden eller telefonen sparer strøm. Derfor er denne kode bevidst opdelt, så samme backend og UI senere kan pakkes som native Android-app med foreground location service.

## Privatliv
Følgelinket indeholder en lang tilfældig nøgle. Del kun linket med personer, der må se turen. Tryk `Afslut tur`, når delingen skal stoppe.
