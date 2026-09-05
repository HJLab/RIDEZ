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


test('landscape lean calibration does not lock at 90 degrees', () => {
  const app = read('app.js');
  assert.match(app, /return normalizeDeg\(roll\)/);
  assert.doesNotMatch(app, /Math\.max\(-90,Math\.min\(90,roll\)\)/);
  assert.match(app, /localStorage\.setItem\('ridez_lean_calibration',[\s\S]*?resetLeanStats\(\);persistActiveRideSession\(true\)/);
});
