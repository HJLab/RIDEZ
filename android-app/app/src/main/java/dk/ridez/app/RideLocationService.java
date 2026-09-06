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
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public final class RideLocationService extends Service implements LocationListener {
    static final String ACTION_START = "dk.ridez.app.START_TRACKING";
    static final String ACTION_STOP = "dk.ridez.app.STOP_TRACKING";
    private static final String CHANNEL_ID = "ridez_tracking";
    private static final int NOTIFICATION_ID = 119;
    private static final long MAX_LOCATION_AGE_MS = 15000L;
    private static final long MAX_LOCATION_FUTURE_MS = 5000L;
    private static final String PREFS = "ridez_native";
    private static final String PREF_TRACKING = "tracking";
    private static final String PREF_SUPABASE_URL = "supabase_url";
    private static final String PREF_SUPABASE_KEY = "supabase_key";
    private static final String PREF_DRIVER_TOKEN = "driver_token";

    private LocationManager locationManager;
    private LocationStore store;
    private PowerManager.WakeLock wakeLock;
    private ScheduledExecutorService uploadExecutor;
    private boolean listening;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        store = new LocationStore(getApplicationContext());
        uploadExecutor = Executors.newSingleThreadScheduledExecutor();
        uploadExecutor.scheduleWithFixedDelay(this::uploadPendingLocations,
                1L, 5L, TimeUnit.SECONDS);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            setTrackingPreference(false);
            stopTracking();
            uploadExecutor.execute(() -> {
                uploadPendingLocations();
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelfResult(startId);
            });
            return START_NOT_STICKY;
        }

        setTrackingPreference(true);
        startForeground(NOTIFICATION_ID, buildNotification());
        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        if (listening || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        acquireWakeLock();
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000L, 0f, this);
            }
            listening = true;
        } catch (SecurityException ignored) {
            stopSelf();
        }
    }

    private void stopTracking() {
        if (locationManager != null && listening) locationManager.removeUpdates(this);
        listening = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null || !isFreshLocation(location)) return;
        Double altitude = location.hasAltitude() ? location.getAltitude() : null;
        Float speed = location.hasSpeed() ? location.getSpeed() : null;
        Float bearing = location.hasBearing() ? location.getBearing() : null;
        String driverToken = preferences().getString(PREF_DRIVER_TOKEN, null);
        store.add(driverToken, location.getTime(), location.getLatitude(), location.getLongitude(),
                location.getAccuracy(), altitude, speed, bearing);
    }

    private boolean isFreshLocation(Location location) {
        long elapsedLocationNanos = location.getElapsedRealtimeNanos();
        if (elapsedLocationNanos > 0L) {
            long ageNanos = SystemClock.elapsedRealtimeNanos() - elapsedLocationNanos;
            if (ageNanos < -TimeUnit.SECONDS.toNanos(1L) ||
                    ageNanos > TimeUnit.MILLISECONDS.toNanos(MAX_LOCATION_AGE_MS)) return false;
        }
        long wallAgeMs = System.currentTimeMillis() - location.getTime();
        return wallAgeMs >= -MAX_LOCATION_FUTURE_MS && wallAgeMs <= MAX_LOCATION_AGE_MS;
    }

    private void uploadPendingLocations() {
        SharedPreferences prefs = preferences();
        String supabaseUrl = prefs.getString(PREF_SUPABASE_URL, null);
        String anonKey = prefs.getString(PREF_SUPABASE_KEY, null);
        if (!validConfiguration(supabaseUrl, anonKey)) return;

        try {
            for (int batchNumber = 0; batchNumber < 8; batchNumber++) {
                // Upload altid den aktive tur først. En gammel, afsluttet tur i den
                // lokale kø må aldrig blokere den aktuelle live-position.
                LocationStore.Batch batch = store.peekForUpload(
                        prefs.getString(PREF_DRIVER_TOKEN, null), 250);
                if (batch.isEmpty()) return;
                if (!uploadBatch(supabaseUrl, anonKey, batch)) return;
                store.markUploaded(batch);
            }
        } catch (Exception ignored) {
            // Køen beholdes urørt og forsøges automatisk igen fem sekunder senere.
        }
    }

    private boolean uploadBatch(String supabaseUrl, String anonKey, LocationStore.Batch batch) {
        HttpURLConnection connection = null;
        try {
            URL endpoint = new URL(supabaseUrl.replaceAll("/+$", "") +
                    "/rest/v1/rpc/ridez_native_location_batch_v118");
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", anonKey);
            connection.setRequestProperty("Authorization", "Bearer " + anonKey);

            JSONObject payload = new JSONObject();
            payload.put("p_driver_token", batch.sessionToken);
            payload.put("p_points", batch.items);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            InputStream response = status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream();
            if (response != null) {
                try (InputStream input = response) {
                    byte[] buffer = new byte[1024];
                    while (input.read(buffer) != -1) { }
                }
            }
            return status >= 200 && status < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean validConfiguration(String supabaseUrl, String anonKey) {
        if (supabaseUrl == null || anonKey == null || anonKey.length() < 32) return false;
        try {
            URL url = new URL(supabaseUrl);
            String host = url.getHost();
            return "https".equalsIgnoreCase(url.getProtocol()) && host != null &&
                    (host.endsWith(".supabase.co") || host.endsWith(".supabase.in"));
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }

    @Override
    public void onDestroy() {
        stopTracking();
        if (uploadExecutor != null) uploadExecutor.shutdownNow();
        if (store != null) store.close();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RIDEZ:TripTracking");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void createNotificationChannel() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Aktiv tur", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Vises mens RIDEZ registrerer turen og deler positionen i baggrunden");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_ridez)
                .setContentTitle("RIDEZ registrerer og deler turen")
                .setContentText("GPS fortsætter, mens Kurviger er fremme eller skærmen er slukket.")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private SharedPreferences preferences() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private void setTrackingPreference(boolean tracking) {
        preferences().edit().putBoolean(PREF_TRACKING, tracking).apply();
    }

    static void configure(Context context, String supabaseUrl, String anonKey,
                          String driverToken, long rideStartedAt) {
        if (driverToken == null || driverToken.length() < 32) return;
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(PREF_SUPABASE_URL, supabaseUrl)
                .putString(PREF_SUPABASE_KEY, anonKey)
                .putString(PREF_DRIVER_TOKEN, driverToken)
                .apply();
        try (LocationStore store = new LocationStore(context.getApplicationContext())) {
            store.adoptUnassigned(driverToken, rideStartedAt);
        }
    }

    static boolean wasTracking(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        return prefs.getBoolean(PREF_TRACKING, false);
    }
}
