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
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;

public final class RideLocationService extends Service implements LocationListener {
    static final String ACTION_START = "dk.ridez.app.START_TRACKING";
    static final String ACTION_STOP = "dk.ridez.app.STOP_TRACKING";
    private static final String CHANNEL_ID = "ridez_tracking";
    private static final int NOTIFICATION_ID = 103;
    private static final String PREFS = "ridez_native";
    private static final String PREF_TRACKING = "tracking";

    private LocationManager locationManager;
    private LocationStore store;
    private PowerManager.WakeLock wakeLock;
    private boolean listening;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        store = new LocationStore(getApplicationContext());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            setTrackingPreference(false);
            stopTracking();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
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
        if (location == null) return;
        Double altitude = location.hasAltitude() ? location.getAltitude() : null;
        Float speed = location.hasSpeed() ? location.getSpeed() : null;
        Float bearing = location.hasBearing() ? location.getBearing() : null;
        store.add(location.getTime(), location.getLatitude(), location.getLongitude(),
                location.getAccuracy(), altitude, speed, bearing);
    }

    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }

    @Override
    public void onDestroy() {
        stopTracking();
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
        channel.setDescription("Vises mens RIDEZ registrerer turen i baggrunden");
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_ridez)
                .setContentTitle("RIDEZ registrerer turen")
                .setContentText("GPS fortsætter, selv om Kurviger er fremme eller skærmen er slukket.")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void setTrackingPreference(boolean tracking) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_TRACKING, tracking).apply();
    }

    static boolean wasTracking(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        return prefs.getBoolean(PREF_TRACKING, false);
    }
}
