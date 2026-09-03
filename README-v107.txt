RIDEZ v107 – delte kamerabilleder

Formaal
Modtagere med turens delingslink kan se billeder taget med RIDEZ-knappen "Tag billede".
Billeder valgt via "Vaelg fra galleri" er private og vises kun til ejeren i Historik.

Sikkerhed
- Supabase filtrerer billederne, foer de sendes til modtageren.
- Kun photo_origin = camera udleveres af den offentlige funktion.
- Galleri-billeder udleveres aldrig.
- Alle gamle billeder har standardvaerdien private og udleveres aldrig.
- Ukendte eller ugyldige oprindelser gemmes som private.

Installation
1. Koer supabase-delingsbilleder-v107.sql i Supabase SQL Editor.
2. Flet derefter v107 ind i main.
3. Vent paa GitHub Pages-udgivelsen.
4. Start en rigtig tur, tag et billede via "Tag billede", og aabn delingslinket paa en anden enhed.
