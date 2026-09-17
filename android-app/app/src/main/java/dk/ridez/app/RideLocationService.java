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

public final class RideLocationService extends Service implements LocationListener, SensorEventListener {
    static final String ACTION_START = "dk.ridez.app.START_RIDE";
    static final String ACTION_STOP = "dk.ridez.app.STOP_RIDE";
    static final String ACTION_CALIBRATE = "dk.ridez.app.CALIBRATE_LEAN";
    private static final String CHANNEL_ID = "ridez_solo_tracking";
    private static final int NOTIFICATION_ID = 200;
    private static final String PREFS = "ridez_solo";
    private static final String PREF_TRACKING = "tracking";
    private static final String PREF_RIDE_ID = "ride_id";
    private static final String PREF_LEAN_ZERO = "lean_zero";
    private static final String PREF_SWAP_SIDES = "swap_sides";

    private static volatile String latestSnapshot = "{\"tracking\":false}";
    private static volatile float latestRawRoll;
    private static volatile boolean rawRollReady;

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
            if (rawRollReady) preferences().edit().putFloat(PREF_LEAN_ZERO, latestRawRoll).apply();
            return START_STICKY;
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
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 0f, this);
            }
            if (rotationSensor != null) {
                sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_GAME);
                state.sensorReady = true;
            }
        } catch (SecurityException ignored) { }
    }

    private void finishRide() {
        if (state == null) {
            state = store.latestActive();
        }
        stopSensors();
        if (state != null) {
            state.tracking = false;
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
        state.updatedAt = System.currentTimeMillis();
        publish(false);
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
        if (state == null || !state.tracking || event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
        float[] matrix = new float[9];
        float[] orientation = new float[3];
        SensorManager.getRotationMatrixFromVector(matrix, event.values);
        SensorManager.getOrientation(matrix, orientation);
        float rawRoll = (float) Math.toDegrees(orientation[2]);
        latestRawRoll = rawRoll;
        rawRollReady = true;
        float zero = preferences().getFloat(PREF_LEAN_ZERO, rawRoll);
        if (!preferences().contains(PREF_LEAN_ZERO)) {
            preferences().edit().putFloat(PREF_LEAN_ZERO, rawRoll).apply();
        }
        float lean = normalizeDegrees(rawRoll - zero);
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

    private static float normalizeDegrees(float degrees) {
        while (degrees > 180f) degrees -= 360f;
        while (degrees < -180f) degrees += 360f;
        return degrees;
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

    static boolean wasTracking(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_TRACKING, false);
    }

    static void setSwapSides(Context context, boolean swap) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_SWAP_SIDES, swap).apply();
    }

    static boolean getSwapSides(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_SWAP_SIDES, false);
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
                .setContentTitle("RIDEZ registrerer turen")
                .setContentText("Afstand, fart og sving gemmes lokalt – også med skærmen slukket.")
                .setContentIntent(pending)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
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
