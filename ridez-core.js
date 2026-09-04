(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RIDEZ_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EARTH_RADIUS_M = 6371000;

  function finite(value) {
    return Number.isFinite(Number(value));
  }

  function haversine(a, b) {
    if (!a || !b || !finite(a.lat) || !finite(a.lng) || !finite(b.lat) || !finite(b.lng)) return NaN;
    const rad = value => Number(value) * Math.PI / 180;
    const dLat = rad(Number(b.lat) - Number(a.lat));
    const dLng = rad(Number(b.lng) - Number(a.lng));
    const q = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(Math.max(0, q))));
  }

  function assessGpsSegment(previous, current, reportedSpeed, options) {
    const cfg = Object.assign({
      maxAccuracyM: 50,
      hardMaxSpeedMs: 75,
      movingThresholdMs: 2.5,
      stoppedThresholdMs: 0.8,
      maxGapMs: 15000,
      maxAccelerationMs2: 18
    }, options || {});

    if (!previous || !current) return { ok: false, restart: true, reason: 'mangler referencepunkt' };
    const accuracy = Number(current.accuracy);
    const previousAccuracy = Number(previous.accuracy);
    if (!finite(current.lat) || !finite(current.lng)) return { ok: false, reason: 'ugyldig position' };
    if (!finite(accuracy) || accuracy > cfg.maxAccuracyM) return { ok: false, reason: 'lav GPS-præcision' };

    const intervalMs = Number(current.t) - Number(previous.t);
    if (!(intervalMs > 0)) return { ok: false, reason: 'GPS-punkter i forkert rækkefølge' };
    if (intervalMs > cfg.maxGapMs) {
      return { ok: false, restart: true, gapMs: intervalMs, reason: 'for langt mellem GPS-punkterne' };
    }

    const intervalS = intervalMs / 1000;
    const rawDistanceM = haversine(previous, current);
    if (!finite(rawDistanceM)) return { ok: false, reason: 'ugyldig afstand' };
    const derivedSpeedMs = rawDistanceM / intervalS;
    const hasReportedSpeed = finite(reportedSpeed);
    const reported = hasReportedSpeed ? Math.max(0, Number(reportedSpeed)) : null;
    if (reported !== null && reported > cfg.hardMaxSpeedMs) return { ok: false, reason: 'umulig GPS-hastighed' };

    const lastAccuracy = finite(previousAccuracy) ? previousAccuracy : accuracy;
    const noiseRadiusM = Math.max(8, Math.min(80, (accuracy + lastAccuracy) * 0.70));
    let speedMs = hasReportedSpeed ? reported : derivedSpeedMs;

    // A stationary phone can wander tens of metres as the GPS fix moves around.
    // Distance is therefore zero unless speed or displacement supplies real movement evidence.
    const reportedMoving = hasReportedSpeed && reported >= cfg.movingThresholdMs;
    const derivedMoving = derivedSpeedMs >= cfg.movingThresholdMs && rawDistanceM > noiseRadiusM;
    const moving = reportedMoving || (!hasReportedSpeed && derivedMoving);
    if (!moving) speedMs = 0;

    if (hasReportedSpeed && reported > 12) {
      const allowance = Math.max(8, reported * 0.45, ((accuracy + lastAccuracy) / Math.max(1, intervalS)) * 0.45);
      if (Math.abs(reported - derivedSpeedMs) > allowance) {
        return { ok: false, reason: 'hastighed passer ikke med flyttet afstand' };
      }
    }

    if (!hasReportedSpeed && derivedSpeedMs > cfg.hardMaxSpeedMs) {
      return { ok: false, reason: 'umuligt GPS-spring' };
    }

    const previousSpeed = finite(options && options.previousSpeedMs) ? Math.max(0, Number(options.previousSpeedMs)) : null;
    if (moving && previousSpeed !== null) {
      const acceleration = Math.abs(speedMs - previousSpeed) / intervalS;
      const accuracyAllowance = (accuracy + lastAccuracy) / Math.max(1, intervalS * intervalS);
      if (acceleration > cfg.maxAccelerationMs2 + accuracyAllowance && rawDistanceM > noiseRadiusM) {
        return { ok: false, reason: 'umulig ændring i GPS-hastighed' };
      }
    }

    const plausibleDistanceM = intervalS * Math.max(25, Math.min(cfg.hardMaxSpeedMs, speedMs * 1.8 + 10))
      + Math.min(accuracy, 50) + Math.min(lastAccuracy, 50);
    if (rawDistanceM > Math.max(40, plausibleDistanceM)) {
      return { ok: false, reason: 'GPS-spring uden sammenhæng' };
    }

    return {
      ok: true,
      speedMs: Math.max(0, speedMs),
      moving,
      intervalMs,
      rawDistanceM,
      distanceM: moving ? rawDistanceM : 0,
      derivedSpeedMs,
      noiseRadiusM
    };
  }

  function median(values) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function stableElevation(rawWindow, altitude, altitudeAccuracy) {
    if (!finite(altitude)) return { accepted: false, values: rawWindow || [] };
    if (finite(altitudeAccuracy) && Number(altitudeAccuracy) > 30) return { accepted: false, values: rawWindow || [] };
    const values = (rawWindow || []).map(Number).filter(Number.isFinite).slice(-6);
    values.push(Number(altitude));
    if (values.length < 5) return { accepted: false, values };
    const value = median(values);
    const deviations = values.map(v => Math.abs(v - value));
    const spread = Math.max.apply(null, deviations);
    if (spread > 35) return { accepted: false, values };
    return { accepted: true, value, values };
  }

  function safeFarthestDistance(totalDistanceM, farthestDistanceM) {
    const total = Math.max(0, Number(totalDistanceM) || 0);
    const farthest = Math.max(0, Number(farthestDistanceM) || 0);
    if (!total || farthest > total * 1.05 + 50) return null;
    return farthest;
  }

  return { haversine, assessGpsSegment, median, stableElevation, safeFarthestDistance };
});
