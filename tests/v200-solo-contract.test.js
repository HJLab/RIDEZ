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
  const combined = html + js + service;
  assert.doesNotMatch(combined, /supabase|follower|leaflet|mapbox|\?follow=|shareRide|routePoints|latitude|longitude/i);
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

test('v202 auto-pauses after two minutes and resumes on movement', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.match(service, /AUTO_PAUSE_AFTER_MS = 120_000L/);
  assert.match(service, /requestPausedLocationUpdates/);
  assert.match(service, /resumeFromAutoPause/);
  assert.match(service, /sensorManager\.unregisterListener/);
  assert.match(store, /paused_ms/);
});

test('v202 records altitude but persists no coordinates', () => {
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.match(service, /recordAltitude/);
  assert.match(store, /max_altitude_m/);
  assert.match(store, /min_below_sea_m/);
  assert.doesNotMatch(store, /latitude|longitude/i);
});
