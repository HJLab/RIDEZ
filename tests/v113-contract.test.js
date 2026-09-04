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

test('persistent link and explicit approval copy are present', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.match(app, /\?follow=/);
  assert.match(html, /skal godkende dig, før forbindelsen oprettes/);
  assert.match(app, /vil gerne følge din tur/);
  assert.match(html, />Godkend<\/button>/);
  assert.match(html, />Afvis<\/button>/);
});

test('all protected viewer data is fetched through approved v113 RPCs', () => {
  const app = read('app.js');
  const sql = read('supabase-v113.sql');
  for (const fn of ['ridez_follow_ride_v113','ridez_follow_track_v113','ridez_follow_camera_photos_v113','ridez_follow_fun_facts_v113','ridez_follow_conversation_v113','ridez_follow_send_message_v113']) {
    assert.match(app, new RegExp(fn));
    assert.match(sql, new RegExp(`function public\\.${fn}`));
  }
  assert.match(sql, /q\.status='approved'/);
  assert.match(sql, /ph\.photo_origin='camera'/);
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
