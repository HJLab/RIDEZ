const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../ridez-core.js');

function point(lat, lng, t, accuracy = 6) { return { lat, lng, t, accuracy }; }

test('stationary GPS drift contributes zero distance', () => {
  let previous = point(55.676100, 12.568300, 0);
  let total = 0;
  for (let i = 1; i <= 1200; i++) {
    const wobble = ((i % 11) - 5) * 0.000002;
    const current = point(55.676100 + wobble, 12.568300 - wobble, i * 1000);
    const result = core.assessGpsSegment(previous, current, 0, { previousSpeedMs: 0 });
    assert.equal(result.ok, true);
    total += result.distanceM;
    previous = current;
  }
  assert.equal(total, 0);
});

test('ordinary movement is accepted and uses the measured route distance', () => {
  const previous = point(55.6761, 12.5683, 1000);
  const current = point(55.67619, 12.5683, 2000);
  const result = core.assessGpsSegment(previous, current, 10, { previousSpeedMs: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.moving, true);
  assert.ok(result.distanceM > 9 && result.distanceM < 11);
});

test('impossible jump and impossible reported speed are rejected', () => {
  const previous = point(55.6761, 12.5683, 1000);
  const jump = point(55.7761, 12.5683, 2000);
  assert.equal(core.assessGpsSegment(previous, jump, 10, { previousSpeedMs: 10 }).ok, false);
  assert.equal(core.assessGpsSegment(previous, point(55.6762, 12.5683, 2000), 100, { previousSpeedMs: 10 }).ok, false);
});

test('a GPS gap starts a new segment and never bridges the missing route', () => {
  const result = core.assessGpsSegment(point(55.6, 12.5, 0), point(55.7, 12.6, 60000), 15);
  assert.equal(result.ok, false);
  assert.equal(result.restart, true);
  assert.equal(result.gapMs, 60000);
});

test('inconsistent farthest-from-start fact is suppressed', () => {
  assert.equal(core.safeFarthestDistance(21300, 25100), null);
  assert.equal(core.safeFarthestDistance(30000, 25100), 25100);
});

test('altitude waits for stable samples and rejects a wild window', () => {
  let values = [];
  for (const altitude of [20, 21, 20, 22]) values = core.stableElevation(values, altitude, 8).values;
  const stable = core.stableElevation(values, 21, 8);
  assert.equal(stable.accepted, true);
  const noisy = core.stableElevation([20, 21, 19, 22], 120, 8);
  assert.equal(noisy.accepted, false);
  assert.equal(core.stableElevation(values, 21, 80).accepted, false);
});

