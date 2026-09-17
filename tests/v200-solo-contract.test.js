const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Solo UI has no sharing, map, follower, message, Supabase or route features', () => {
  const html = read('android-app/app/src/main/assets/index.html');
  const js = read('android-app/app/src/main/assets/app.js');
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  assert.doesNotMatch(html + js, /supabase|follower|leaflet|mapbox|\?follow=|shareRide|routePoints|latitude|longitude/i);
  assert.doesNotMatch(service, /supabase|follower|leaflet|mapbox|\?follow=|shareRide|routePoints/i);
});

test('Solo UI exposes every requested local metric', () => {
  const html = read('android-app/app/src/main/assets/index.html');
  for (const id of ['distance','activeTime','elapsedTime','averageSpeed','maxSpeed','maxLeft','maxRight',
    'leftTurns','rightTurns','maxAccel','maxBrake','zero50','zero80','zero100','standstill',
    'pausedTime','currentAltitude','maxAltitude','minBelowSea']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test('coordinates are not persisted in the Solo database', () => {
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.doesNotMatch(store, /latitude|longitude|bearing/i);
});

test('turn thresholds remain the agreed values', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  assert.match(service, /absolute >= 14f/);
  assert.match(service, /turnPeak >= 17f/);
  assert.match(service, />= 650L/);
  assert.match(service, /absolute < 8f/);
  assert.match(service, /currentSpeedMs >= 2\.78f/);
});

test('v201 calibration avoids unstable Euler roll and is available before a ride', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const activity = read('android-app/app/src/main/java/dk/ridez/app/MainActivity.java');
  const app = read('android-app/app/src/main/assets/app.js');
  assert.match(service, /leanReferenceDegrees/);
  assert.doesNotMatch(service, /getOrientation/);
  assert.match(activity, /implements SensorEventListener/);
  assert.doesNotMatch(app, /calibrate'\)\.disabled/);
});

test('v205 maps left and right consistently and applies side swapping immediately', () => {
  const math = read('android-app/app/src/main/java/dk/ridez/app/RideMath.java');
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const app = read('android-app/app/src/main/assets/app.js');
  assert.match(math, /float lean = -normalizeDegrees/);
  assert.match(service, /ACTION_SET_SWAP_SIDES/);
  assert.match(service, /applySwapSides/);
  assert.match(service, /swap_sides_v205/);
  assert.match(app, /Maksima og svingtal er nulstillet/);
});

test('v202 puts the start control before trip statistics', () => {
  const html = read('android-app/app/src/main/assets/index.html');
  assert.ok(html.indexOf('id="start"') < html.indexOf('id="status"'));
});

test('v202 history exposes all locally recorded trip measurements', () => {
  const app = read('android-app/app/src/main/assets/app.js');
  for (const field of ['distanceM','activeMs','maxSpeedMs','maxAccelMs2','maxBrakeMs2',
    'maxLeftDeg','maxRightDeg','leftTurns','rightTurns','zero50Ms','zero80Ms','zero100Ms']) {
    assert.match(app, new RegExp('r\\.' + field));
  }
  assert.match(app, /hårdeste bremsning/);
  assert.match(app, /samlet turtid/);
  assert.match(app, /stilstand/);
});

test('v202 bulk deletion is blocked during an active ride at UI and native levels', () => {
  const html = read('android-app/app/src/main/assets/index.html');
  const app = read('android-app/app/src/main/assets/app.js');
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.match(html, /id="selectRides"/);
  assert.match(html, /id="deleteRides"/);
  assert.match(app, /if\(trackingNow\)/);
  assert.match(service, /if \(wasTracking\(context\)/);
  assert.match(store, /ended_at IS NOT NULL AND id IN/);
});

test('v206 deletion ignores stale tracking preferences after restart', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  assert.match(service, /serviceActivelyTracking/);
  assert.match(service, /static boolean wasTracking\(Context context\) \{\s*return serviceActivelyTracking;/);
  assert.doesNotMatch(service, /static boolean wasTracking\(Context context\) \{\s*return context\.getSharedPreferences/);
});

test('v202 auto-pauses after two minutes and resumes on movement', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.match(service, /AUTO_PAUSE_AFTER_MS = 120_000L/);
  assert.match(service, /requestPausedLocationUpdates/);
  assert.match(service, /resumeFromAutoPause/);
  assert.match(service, /sensorManager\.unregisterListener/);
  assert.match(store, /paused_ms/);
});

test('altitude aggregates are persisted without coordinates', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.match(service, /recordTerrainAltitude/);
  assert.match(store, /max_altitude_m/);
  assert.match(store, /min_below_sea_m/);
  assert.match(store, /altitude_source/);
  assert.doesNotMatch(store, /latitude|longitude/i);
});

test('v204 uses online terrain elevation and never stores raw GPS altitude', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const manifest = read('android-app/app/src/main/AndroidManifest.xml');
  const html = read('android-app/app/src/main/assets/index.html');
  assert.match(service, /api\.open-meteo\.com\/v1\/elevation/);
  assert.match(service, /recordTerrainAltitude/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(html, /Copernicus DEM via Open-Meteo/);
  assert.doesNotMatch(service, /getAltitude\(|getMslAltitudeMeters|addMslAltitudeToLocation/);
  assert.match(service, /state\.altitudeSource != 204/);
  assert.match(read('android-app/app/src/main/java/dk/ridez/app/RideStore.java'), /UPDATE rides SET max_altitude_m=NULL/);
});

test('v203 uses an in-app confirmation dialog and reports bulk deletion result', () => {
  const html = read('android-app/app/src/main/assets/index.html');
  const app = read('android-app/app/src/main/assets/app.js');
  assert.match(html, /id="confirmDelete"/);
  assert.match(html, /id="confirmDeleteButton"/);
  assert.match(html, /id="historyFeedback"/);
  assert.match(app, /confirmDeleteSelectedRides/);
  assert.match(app, /bridge\.deleteRides\(JSON\.stringify\(ids\)\)/);
  assert.doesNotMatch(app, /\bconfirm\(/);
  assert.doesNotMatch(app, /\balert\(/);
});

test('v202 explains acceleration and braking in relatable units', () => {
  const html = read('android-app/app/src/main/assets/index.html');
  const app = read('android-app/app/src/main/assets/app.js');
  assert.match(html, /maxAccelExplain/);
  assert.match(html, /maxBrakeExplain/);
  assert.match(app, /\*3\.6/);
  assert.match(app, /km\/t pr\. sekund/);
  assert.match(app, /Meget kraftig/);
});

test('v202 color-codes force levels and safely pulses the extreme level', () => {
  const app = read('android-app/app/src/main/assets/app.js');
  const css = read('android-app/app/src/main/assets/styles.css');
  for (const className of ['force-light','force-moderate','force-strong','force-extreme']) {
    assert.match(app + css, new RegExp(className));
  }
  assert.match(css, /animation:force-alert/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
