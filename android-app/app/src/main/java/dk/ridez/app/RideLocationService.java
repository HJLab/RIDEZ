package dk.ridez.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONObject;

import org.json.JSONArray;

public final class RideLocationService extends Service implements LocationListener, SensorEventListener {
    static final String ACTION_START = "dk.ridez.app.START_RIDE";
    static final String ACTION_STOP = "dk.ridez.app.STOP_RIDE";
    static final String ACTION_CALIBRATE = "dk.ridez.app.CALIBRATE_LEAN";
    static final String EXTRA_LEAN_REFERENCE = "lean_reference";
    private static final String CHANNEL_ID = "ridez_solo_tracking";
    private static final int NOTIFICATION_ID = 200;
    private static final String PREFS = "ridez_solo";
    private static final String PREF_TRACKING = "tracking";
    private static final String PREF_RIDE_ID = "ride_id";
    private static final String PREF_LEAN_ZERO = "lean_reference_v201";
    private static final String PREF_SWAP_SIDES = "swap_sides";
    private static final long AUTO_PAUSE_AFTER_MS = 120_000L;
    private static final float STATIONARY_SPEED_MS = 1.5f;
    private static final float RESUME_SPEED_MS = RideMath.MIN_MOVING_SPEED_MS;

    private static volatile String latestSnapshot = "{\"tracking\":false}";
    private LocationManager locationManager;
    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private RideStore store;
    private PowerManager.WakeLock wakeLock;
    private RideStore.Snapshot state;
    private Location previousLocation;
    private float previousSpeed;
    private int acceptedGpsPoints;
    private long lastSaveAt;
    private long launchCandidateAt;
    private long stationarySince;
    private int turnSide;
    private long turnStartedAt;
    private float turnPeak;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        store = new RideStore(getApplicationContext());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            finishRide();
            return START_NOT_STICKY;
        }
        if (ACTION_CALIBRATE.equals(action)) {
            float reference = intent == null ? Float.NaN :
                    intent.getFloatExtra(EXTRA_LEAN_REFERENCE, Float.NaN);
            if (Float.isFinite(reference)) applyCalibration(reference);
            return state != null && state.tracking ? START_STICKY : START_NOT_STICKY;
        }
        startForeground(NOTIFICATION_ID, buildNotification());
        startOrResumeRide();
        return START_STICKY;
    }

    private void startOrResumeRide() {
        if (state != null && state.tracking) return;
        SharedPreferences prefs = preferences();
        long rideId = prefs.getLong(PREF_RIDE_ID, 0L);
        state = rideId > 0 ? store.latestActive() : null;
        if (state == null || state.id != rideId) {
            state = new RideStore.Snapshot();
            state.startedAt = System.currentTimeMillis();
            state.updatedAt = state.startedAt;
            state.id = store.createRide(state.startedAt);
            prefs.edit().putLong(PREF_RIDE_ID, state.id).apply();
        }
        state.tracking = true;
        prefs.edit().putBoolean(PREF_TRACKING, true).apply();
        acquireWakeLock();
        startSensors();
        publish(true);
    }

    private void startSensors() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            requestActiveLocationUpdates();
            registerLeanSensor();
        } catch (SecurityException ignored) { }
    }

    private void requestActiveLocationUpdates() {
        locationManager.removeUpdates(this);
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 0f, this);
        }
    }

    private void requestPausedLocationUpdates() {
        locationManager.removeUpdates(this);
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15_000L, 10f, this);
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30_000L, 20f, this);
        }
    }

    private void registerLeanSensor() {
        if (rotationSensor == null) return;
        sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_GAME);
        state.sensorReady = true;
    }

    private void finishRide() {
        if (state == null) {
            state = store.latestActive();
        }
        stopSensors();
        if (state != null) {
            accruePause(System.currentTimeMillis());
            state.tracking = false;
            state.autoPaused = false;
            state.currentSpeedMs = 0;
            state.updatedAt = System.currentTimeMillis();
            store.save(state.id, state, true);
            updateSnapshot();
        }
        preferences().edit().putBoolean(PREF_TRACKING, false).remove(PREF_RIDE_ID).apply();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onLocationChanged(Location location) {
        if (state == null || location == null || !state.tracking) return;
        if (location.getAccuracy() <= 0f || location.getAccuracy() > RideMath.MAX_ACCURACY_M) return;
        if (previousLocation != null && location.getTime() <= previousLocation.getTime()) return;

        float speed = location.hasSpeed() ? Math.max(0f, location.getSpeed()) :
                (previousLocation == null ? 0f : location.distanceTo(previousLocation) /
                        Math.max(0.4f, (location.getTime() - previousLocation.getTime()) / 1000f));
        state.gpsReady = true;
        state.gpsAccuracyM = location.getAccuracy();
        state.currentSpeedMs = speed;
        recordAltitude(location);

        long now = System.currentTimeMillis();
        if (state.autoPaused) {
            accruePause(now);
            boolean movedFarEnough = previousLocation != null &&
                    location.distanceTo(previousLocation) >= 15f;
            if (speed >= RESUME_SPEED_MS || movedFarEnough) {
                resumeFromAutoPause(now, location, speed);
            } else {
                state.currentSpeedMs = 0;
                previousLocation = new Location(location);
                previousSpeed = 0f;
                state.updatedAt = now;
                publish(false);
            }
            return;
        }

        if (speed < STATIONARY_SPEED_MS) {
            if (stationarySince == 0) stationarySince = now;
            if (now - stationarySince >= AUTO_PAUSE_AFTER_MS) {
                enterAutoPause(now, location);
                return;
            }
        } else {
            stationarySince = 0;
        }

        if (previousLocation != null) {
            RideMath.Segment segment = RideMath.assessSegment(
                    previousLocation.getTime(), previousSpeed, location.getTime(), speed,
                    location.getAccuracy(), location.distanceTo(previousLocation));
            if (segment.accepted) {
                acceptedGpsPoints++;
                if (segment.moving) {
                    state.distanceM += segment.distanceM;
                    state.activeMs += segment.durationMs;
                }
                recordAcceleration(segment.accelerationMs2);
                recordLaunches(location.getTime(), speed);
                if (acceptedGpsPoints >= 3 && System.currentTimeMillis() - state.startedAt >= 5000L) {
                    state.maxSpeedMs = Math.max(state.maxSpeedMs, speed);
                }
            }
        } else if (speed < 0.85f) {
            launchCandidateAt = location.getTime();
        }

        previousLocation = new Location(location);
        previousSpeed = speed;
        state.updatedAt = now;
        publish(false);
    }

    private void recordAltitude(Location location) {
        if (!location.hasAltitude()) return;
        boolean accurateEnough = location.hasVerticalAccuracy()
                ? location.getVerticalAccuracyMeters() <= 25f
                : location.getAccuracy() <= 20f;
        double altitude = location.getAltitude();
        if (!accurateEnough || !Double.isFinite(altitude) || altitude < -500 || altitude > 9000) return;
        state.currentAltitudeM = altitude;
        state.maxAltitudeM = state.maxAltitudeM == null
                ? altitude : Math.max(state.maxAltitudeM, altitude);
        if (altitude < 0) {
            state.minBelowSeaM = state.minBelowSeaM == null
                    ? altitude : Math.min(state.minBelowSeaM, altitude);
        }
    }

    private void enterAutoPause(long now, Location location) {
        state.autoPaused = true;
        state.pauseStartedAt = now;
        state.currentSpeedMs = 0;
        state.updatedAt = now;
        previousLocation = new Location(location);
        previousSpeed = 0f;
        resetTurnCandidate();
        sensorManager.unregisterListener(this);
        state.sensorReady = false;
        try { requestPausedLocationUpdates(); } catch (SecurityException ignored) { }
        updateNotification();
        publish(true);
    }

    private void resumeFromAutoPause(long now, Location location, float speed) {
        state.autoPaused = false;
        state.pauseStartedAt = 0;
        stationarySince = 0;
        previousLocation = new Location(location);
        previousSpeed = speed;
        state.currentSpeedMs = speed;
        state.updatedAt = now;
        try { requestActiveLocationUpdates(); } catch (SecurityException ignored) { }
        registerLeanSensor();
        updateNotification();
        publish(true);
    }

    private void accruePause(long now) {
        if (state == null || !state.autoPaused || state.pauseStartedAt <= 0) return;
        state.pausedMs += Math.max(0, now - state.pauseStartedAt);
        state.pauseStartedAt = now;
    }

    private void recordAcceleration(float acceleration) {
        if (state.currentSpeedMs < RideMath.MIN_MOVING_SPEED_MS) return;
        if (acceleration > 0) state.maxAccelMs2 = Math.max(state.maxAccelMs2, acceleration);
        else state.maxBrakeMs2 = Math.max(state.maxBrakeMs2, -acceleration);
    }

    private void recordLaunches(long time, float speed) {
        if (speed < 0.85f) {
            launchCandidateAt = time;
            return;
        }
        if (launchCandidateAt <= 0 || time - launchCandidateAt > 30_000L) return;
        long duration = time - launchCandidateAt;
        if (speed >= 13.89f) state.zero50Ms = bestTime(state.zero50Ms, duration);
        if (speed >= 22.22f) state.zero80Ms = bestTime(state.zero80Ms, duration);
        if (speed >= 27.78f) state.zero100Ms = bestTime(state.zero100Ms, duration);
        if (speed >= 30f) launchCandidateAt = 0;
    }

    private static Long bestTime(Long previous, long candidate) {
        return previous == null || candidate < previous ? candidate : previous;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (state == null || !state.tracking || state.autoPaused ||
                event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
        float[] matrix = new float[9];
        SensorManager.getRotationMatrixFromVector(matrix, event.values);
        float reference = RideMath.leanReferenceDegrees(matrix);
        if (!Float.isFinite(reference)) {
            state.sensorReady = false;
            return;
        }
        float zero = preferences().getFloat(PREF_LEAN_ZERO, reference);
        if (!preferences().contains(PREF_LEAN_ZERO)) {
            preferences().edit().putFloat(PREF_LEAN_ZERO, reference).apply();
        }
        float lean = RideMath.normalizeDegrees(reference - zero);
        if (preferences().getBoolean(PREF_SWAP_SIDES, false)) lean = -lean;
        if (!Float.isFinite(lean) || Math.abs(lean) > 75f) return;

        state.sensorReady = true;
        state.currentLeanDeg = lean;
        if (state.currentSpeedMs >= 2.78f) {
            if (lean < 0) state.maxLeftDeg = Math.max(state.maxLeftDeg, -lean);
            else state.maxRightDeg = Math.max(state.maxRightDeg, lean);
            updateTurnCounter(lean, event.timestamp / 1_000_000L);
        } else {
            resetTurnCandidate();
        }
        state.updatedAt = System.currentTimeMillis();
        publish(false);
    }

    private void updateTurnCounter(float lean, long nowMs) {
        float absolute = Math.abs(lean);
        int side = lean < 0 ? -1 : 1;
        if (turnSide == 0) {
            if (absolute >= 14f) {
                turnSide = side;
                turnStartedAt = nowMs;
                turnPeak = absolute;
            }
            return;
        }
        if (side == turnSide) turnPeak = Math.max(turnPeak, absolute);
        if (absolute < 8f || side != turnSide) {
            if (nowMs - turnStartedAt >= 650L && turnPeak >= 17f) {
                if (turnSide < 0) state.leftTurns++; else state.rightTurns++;
            }
            resetTurnCandidate();
            if (absolute >= 14f) {
                turnSide = side;
                turnStartedAt = nowMs;
                turnPeak = absolute;
            }
        }
    }

    private void resetTurnCandidate() {
        turnSide = 0;
        turnStartedAt = 0;
        turnPeak = 0;
    }

    private void applyCalibration(float reference) {
        preferences().edit().putFloat(PREF_LEAN_ZERO, reference).apply();
        resetTurnCandidate();
        if (state != null) {
            state.currentLeanDeg = 0;
            state.maxLeftDeg = 0;
            state.maxRightDeg = 0;
            state.leftTurns = 0;
            state.rightTurns = 0;
            state.sensorReady = true;
            state.updatedAt = System.currentTimeMillis();
            publish(true);
        }
    }

    private void publish(boolean forceSave) {
        updateSnapshot();
        long now = System.currentTimeMillis();
        if (forceSave || now - lastSaveAt >= 5000L) {
            store.save(state.id, state, false);
            lastSaveAt = now;
        }
    }

    private void updateSnapshot() {
        try { latestSnapshot = state == null ? "{\"tracking\":false}" : state.toJson().toString(); }
        catch (Exception ignored) { }
    }

    static String snapshot(Context context) {
        if (wasTracking(context)) return latestSnapshot;
        return "{\"tracking\":false}";
    }

    static String history(Context context) {
        try (RideStore store = new RideStore(context.getApplicationContext())) {
            return store.history().toString();
        } catch (Exception error) {
            return "{\"rides\":[],\"totalDistanceM\":0,\"totalActiveMs\":0}";
        }
    }

    static int deleteHistoryRides(Context context, String rideIdsJson) {
        if (wasTracking(context) || rideIdsJson == null) return 0;
        try {
            JSONArray input = new JSONArray(rideIdsJson);
            int length = Math.min(input.length(), 200);
            long[] ids = new long[length];
            for (int i = 0; i < length; i++) ids[i] = input.optLong(i, 0L);
            try (RideStore store = new RideStore(context.getApplicationContext())) {
                return store.deleteFinishedRides(ids);
            }
        } catch (Exception error) {
            return 0;
        }
    }

    static boolean wasTracking(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_TRACKING, false);
    }

    static void setSwapSides(Context context, boolean swap) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_SWAP_SIDES, swap).apply();
    }

    static boolean getSwapSides(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_SWAP_SIDES, false);
    }

    static void calibrate(Context context, float reference) {
        if (!Float.isFinite(reference)) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit().putFloat(PREF_LEAN_ZERO, reference).apply();
        if (prefs.getBoolean(PREF_TRACKING, false)) {
            Intent intent = new Intent(context, RideLocationService.class)
                    .setAction(ACTION_CALIBRATE)
                    .putExtra(EXTRA_LEAN_REFERENCE, reference);
            context.startService(intent);
        }
    }

    private void stopSensors() {
        if (locationManager != null) locationManager.removeUpdates(this);
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    private void acquireWakeLock() {
        PowerManager manager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RIDEZ:SoloRide");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Aktiv tur", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Vises mens RIDEZ måler turen lokalt på telefonen");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_ridez)
                .setContentTitle(state != null && state.autoPaused
                        ? "RIDEZ har sat turen på pause" : "RIDEZ registrerer turen")
                .setContentText(state != null && state.autoPaused
                        ? "Starter automatisk igen, når motorcyklen bevæger sig."
                        : "Afstand, fart, højde og sving gemmes lokalt – også med skærmen slukket.")
                .setContentIntent(pending)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void updateNotification() {
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, buildNotification());
    }

    private SharedPreferences preferences() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        if (state != null && state.tracking) {
            state.updatedAt = System.currentTimeMillis();
            store.save(state.id, state, false);
        }
        stopSensors();
        if (store != null) store.close();
        super.onDestroy();
    }
}
