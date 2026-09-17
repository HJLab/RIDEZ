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
    'leftTurns','rightTurns','maxAccel','maxBrake','zero50','zero80','zero100','standstill']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test('coordinates are not persisted in the Solo database', () => {
  const store = read('android-app/app/src/main/java/dk/ridez/app/RideStore.java');
  assert.doesNotMatch(store, /latitude|longitude|bearing|altitude/i);
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
