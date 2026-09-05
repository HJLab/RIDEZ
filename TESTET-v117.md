# RIDEZ v117 – kontrol

- Rettet hældningsmåler i landskab: sensorens `beta`-vinkel klippes ikke længere ved 90°, så målingen kan bevæge sig på begge sider af kalibreringspunktet.
- En ny kalibrering nulstiller turens tidligere hældningsmaksimummer og svingtal, så ugyldige 90°-værdier ikke bliver stående.
- Aktiv turs nulstilling sikkerhedsgemmes lokalt.
- JavaScript-syntaks kontrolleret.
- Kontrakttest tilføjet for 90°-låsen og nulstilling ved ny kalibrering.
