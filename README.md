# RIDEZ

Første brugbare PWA-version af RIDEZ: live GPS-tur, delbart følgelink, kort, turspor og sikker beskedvisning.

## Opsætning
1. Opret et gratis Supabase-projekt.
2. Åbn SQL Editor i Supabase, indsæt hele `supabase.sql`, og kør den én gang.
3. Kør derefter de nyere SQL-opdateringer én gang hver i nedenstående, kronologiske rækkefølge. Det giver en komplet v102-database uden at springe mellemtrin over:
   1. `supabase-beskeder-v73.sql`
   2. `supabase-chat-v77.sql`
   3. `supabase-chat-v78.sql`
   4. `supabase-chat-v79.sql`
   5. `supabase-koeretoejer-v80.sql`
   6. `supabase-feltstabilitet-v92.sql`
   7. `supabase-flerdagsture-v96.sql`
   8. `supabase-forbrug-hoejde-v97.sql`
   9. `supabase-braendstof-historik-v102.sql`
4. De konkrete afhængigheder i filerne er: v77-v79 bruger beskedfelterne fra v73; v96 bruger køretøjsfelterne fra v80 samt tur-, spor- og fototabellerne fra `supabase.sql`; v97 er udtrykkeligt beregnet til at køre efter v96; og v102 er udtrykkeligt beregnet til at køre efter v97. `supabase-braendstof-historik-v102.sql` opretter desuden HTTP-udvidelsen, pris-cachen og historikfelterne til Blyfri 95.
5. Kontroller, at den sidste kommando i `supabase-braendstof-historik-v102.sql` returnerer en Blyfri 95-pris. Hvis Supabase-projektet ikke tillader `http`-udvidelsen eller udgående HTTP-kald, skal det løses i Supabase, før dagsprisen kan hentes server-side.
6. I Supabase: Project Settings / Data API. Kopiér Project URL og anon/publishable key.
7. Åbn `config.js` og indsæt værdierne.
8. Upload alle filer og mapper til roden af dit GitHub repository.
9. Aktivér GitHub Pages for repositoryets main-branch.
10. Åbn GitHub Pages-linket på telefonen og tilføj siden til startskærmen.
11. Tryk `Start tur`, tillad præcis placering, og brug `Del følgelink`.

## Trafiksikker beskeder
- Når hastigheden er over ca. 9 km/t betragtes motorcyklen som i bevægelse.
- Når hastigheden er under ca. 3 km/t, starter stop-timeren.
- Først efter 3 sekunders stilstand frigives ventende beskeder i førervisningen.
- Afsenderen får straks besked om, at føreren er på farten, når status er `KØRER`.

## Vigtig begrænsning i web/PWA-versionen
Web-Geolocation kræver HTTPS og brugerens tilladelse. På Android kan browser/PWA-sporing blive begrænset, når appen er i baggrunden eller telefonen sparer strøm. Derfor er denne kode bevidst opdelt, så samme backend og UI senere kan pakkes som native Android-app med foreground location service.

## Privatliv
Følgelinket indeholder en lang tilfældig nøgle. Del kun linket med personer, der må se turen. Tryk `Afslut tur`, når delingen skal stoppe.
