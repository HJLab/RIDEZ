# RIDEZ v113 – kontroller

Automatiske kontroller dækker GPS-stilstand, normal rute, GPS-spring, huller i GPS-data, højdestøj, konsistens i “længst fra start”, fast følgelink, godkendelse/afvisning, følgertal ved 0 og serverfiltrering af billeder og live-data.

Kør lokalt med:

```text
node --test tests/*.test.js
```

Vigtigt: En rigtig køretur er stadig den afsluttende kontrol af telefonens GPS og Androids baggrundsdrift. v113 kræver ikke en ny APK; den eksisterende Android-app henter webopdateringen automatisk.
