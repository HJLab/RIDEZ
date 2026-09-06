const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('UI always shows follower count including zero', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(html, /id="followerCountBadge" class="follower-count"/);
  assert.match(html, />0<\/span> følger/);
  assert.doesNotMatch(app, /badge\.classList\.toggle\('hidden',n===0\)/);
});

test('persistent link opens without username or approval', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(app, /\?follow=/);
  assert.match(html, /ingen konto, intet brugernavn og ingen godkendelse/);
  assert.doesNotMatch(html, /viewerUsernameDialog/);
  assert.doesNotMatch(html, /approveFollowerBtn/);
  assert.doesNotMatch(app, /ridez_request_follow_access_v113/);
});

test('all protected viewer data is fetched through link-scoped v115 RPCs', () => {
  const app = read('app.js');
  const sql = read('supabase-v115.sql');
  for (const fn of ['ridez_follow_ride_v115','ridez_follow_track_v115','ridez_follow_camera_photos_v115','ridez_follow_fun_facts_v115','ridez_follow_conversation_v115','ridez_follow_send_message_v115']) {
    assert.match(app, new RegExp(fn));
    assert.match(sql, new RegExp(`function public\\.${fn}`));
  }
  assert.match(sql, /c\.channel_token=p_channel_token and c\.enabled=true/);
  assert.doesNotMatch(sql, /q\.status='approved'/);
  assert.match(sql, /ph\.photo_origin='camera'/);
});

test('Android background GPS is enabled for real trips', () => {
  const app = read('app.js');
  assert.doesNotMatch(app, /ANDROID_NAVIGATION_SAFE_MODE/);
  assert.doesNotMatch(app, /stopAndroidTrackingForNavigation/);
  assert.match(app, /navigator\.geolocation\.watchPosition\(onPosition,onGeoError,options\)/);
  assert.match(app, /async function startRide\(\).*createRide\('RIDEZ live-tur'\).*startGpsWatch\('high'\)/s);
});

test('v118 Android service uploads while the WebView is paused', () => {
  const app = read('app.js');
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/LocationStore.java');
  const activity = read('android-app/app/src/main/java/dk/ridez/app/MainActivity.java');
  const bridge = read('android-app/app/src/main/assets/native_bridge.js');
  const sql = read('supabase-baggrunds-gps-v118.sql');
  assert.match(app, /configureAndroidBackgroundTracking\(\)/);
  assert.match(app, /getBridgeVersion/);
  assert.match(app, /OPDATÉR APK/);
  assert.match(app, /GPS ✓/);
  assert.match(service, /scheduleWithFixedDelay\(this::uploadPendingLocations/);
  assert.match(service, /ridez_native_location_batch_v118/);
  assert.match(store, /uploaded INTEGER NOT NULL DEFAULT 0/);
  assert.match(store, /web_delivered INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(activity, /evaluateJavascript\(javascript, ignored -> locationStore\.deleteThrough/);
  assert.match(activity, /acknowledgeWebLocations/);
  assert.match(bridge, /acknowledgeLocations\(String\(lastId\)\)/);
  assert.match(sql, /function public\.ridez_native_location_batch_v118/);
  assert.match(sql, /distance_m=greatest\(coalesce\(r\.distance_m,0\),s\.distance_m\)/);
});

test('v119 rejects stale startup fixes and exposes a safe stationary marker', () => {
  const app = read('app.js');
  const service = read('android-app/app/src/main/java/dk/ridez/app/RideLocationService.java');
  const store = read('android-app/app/src/main/java/dk/ridez/app/LocationStore.java');
  const activity = read('android-app/app/src/main/java/dk/ridez/app/MainActivity.java');
  const sql = read('supabase-frisk-position-v119.sql');
  assert.match(app, /function positionIsFreshForRide/);
  assert.match(app, /cur\.t>=startedAt-2000/);
  assert.match(app, /updateMap\(cur\.lat,cur\.lng,true,false\);warmUpGps/);
  assert.match(service, /MAX_LOCATION_AGE_MS = 15000L/);
  assert.match(service, /location\.getElapsedRealtimeNanos\(\)/);
  assert.match(service, /if \(location == null \|\| !isFreshLocation\(location\)\) return/);
  assert.match(activity, /return 119/);
  assert.match(sql, /rec<ride_created_at-interval '10 seconds'/);
  assert.match(sql, /accuracy>250/);
  assert.match(sql, /lat=presence_lat,lng=presence_lng,speed_ms=0,moving=false/);
  assert.match(sql, /rec>=now\(\)-interval '30 seconds'/);
  assert.match(sql, /where r\.id=rid and r\.active=true/);
  assert.match(store, /peekForUpload\(String sessionToken, int limit\)/);
  assert.match(service, /peekForUpload\([\s\S]*PREF_DRIVER_TOKEN/);
  assert.doesNotMatch(app, /const last=list\[list\.length-1\],lastPos=/);
});

test('one accepted distance feeds track, total, country and fuel', () => {
  const app = read('app.js');
  const sql = read('supabase-v113.sql');
  assert.match(app, /state\.distanceM\+=step/);
  assert.match(app, /recordFunSample\(cur,speed,accuracy,step,interval\)/);
  assert.match(app, /calculateFuel\(state\.distanceM/);
  assert.match(sql, /p_step_distance_m/);
  assert.match(sql, /sum\(step_distance_m\)/);
  assert.match(app, /if\(speed>=Number\(C\.MOVING_THRESHOLD_MS\|\|2\.5\)\)state\.movingMs\+=dt/);
});

test('driver chat safety text remains exact', () => {
  assert.match(read('index.html'), /Motorcyklen er i bevægelse\. Chatfunktionen er deaktiveret\./);
});

test('landscape lean calibration fix from v117 is preserved', () => {
  const app = read('app.js');
  assert.match(app, /return normalizeDeg\(roll\)/);
  assert.doesNotMatch(app, /Math\.max\(-90,Math\.min\(90,roll\)\)/);
  assert.match(app, /localStorage\.setItem\('ridez_lean_calibration',[\s\S]*?resetLeanStats\(\);persistActiveRideSession\(true\)/);
});
