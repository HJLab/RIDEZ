(function () {
  'use strict';
  if (!window.RidezAndroid || !navigator.geolocation || window.__ridezNativeBridgeInstalled) return;
  window.__ridezNativeBridgeInstalled = true;

  var watches = new Map();
  var nextWatchId = 100000;
  var nativeGeo = navigator.geolocation;

  function startNative(options) {
    var mode = options && options.enableHighAccuracy === false ? 'low' : 'high';
    window.RidezAndroid.startTracking(mode);
  }

  function stopIfUnused() {
    if (watches.size === 0) window.RidezAndroid.stopTracking();
  }

  function watchPosition(success, error, options) {
    if (typeof success !== 'function') throw new TypeError('success callback mangler');
    var id = nextWatchId++;
    watches.set(id, { success: success, error: error, once: false });
    startNative(options);
    return id;
  }

  function getCurrentPosition(success, error, options) {
    if (typeof success !== 'function') throw new TypeError('success callback mangler');
    var id = nextWatchId++;
    watches.set(id, { success: success, error: error, once: true });
    startNative(options);
  }

  function clearWatch(id) {
    watches.delete(Number(id));
    stopIfUnused();
  }

  Object.defineProperty(nativeGeo, 'watchPosition', { configurable: true, value: watchPosition });
  Object.defineProperty(nativeGeo, 'getCurrentPosition', { configurable: true, value: getCurrentPosition });
  Object.defineProperty(nativeGeo, 'clearWatch', { configurable: true, value: clearWatch });

  window.__ridezNativeDeliverBatch = async function (items) {
    if (!Array.isArray(items) || watches.size === 0) return;
    for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
      var item = items[itemIndex];
      var position = {
        timestamp: Number(item.timestamp) || Date.now(),
        coords: {
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          accuracy: Number(item.accuracy),
          altitude: item.altitude == null ? null : Number(item.altitude),
          altitudeAccuracy: null,
          heading: item.heading == null ? null : Number(item.heading),
          speed: item.speed == null ? null : Number(item.speed)
        }
      };
      var activeWatches = Array.from(watches.entries());
      for (var index = 0; index < activeWatches.length; index++) {
        var entry = activeWatches[index];
        var id = entry[0], callback = entry[1];
        try { await callback.success(position); } catch (ignored) { }
        if (callback.once) watches.delete(id);
      }
    }
    stopIfUnused();
  };

  window.__ridezNativeGeoError = function (code, message) {
    var error = { code: Number(code) || 2, message: String(message || 'GPS-fejl') };
    Array.from(watches.values()).forEach(function (callback) {
      if (typeof callback.error === 'function') {
        try { callback.error(error); } catch (ignored) { }
      }
    });
  };
})();
