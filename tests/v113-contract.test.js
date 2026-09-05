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

test('Android navigation-safe mode stops RIDEZ native GPS', () => {
  const app = read('app.js');
  assert.match(app, /const ANDROID_NAVIGATION_SAFE_MODE=!!window\.RidezAndroid/);
  assert.match(app, /window\.RidezAndroid\.stopTracking\(\)/);
  assert.match(app, /RIDEZ GPS er midlertidigt slået fra for at sikre, at Kurviger virker/);
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
