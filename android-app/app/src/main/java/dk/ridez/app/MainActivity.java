package dk.ridez.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity implements SensorEventListener {
    private static final int LOCATION_PERMISSION_REQUEST = 4201;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4202;
    private WebView webView;
    private boolean pendingStart;
    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private volatile float calibrationReference;
    private volatile boolean calibrationSensorReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.addJavascriptInterface(new RidezJavascriptBridge(this), "RidezAndroid");
        webView.setWebViewClient(new WebViewClient());
        webView.loadUrl("file:///android_asset/index.html");
        requestNotificationPermissionIfNeeded();
    }

    void startRide() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingStart = true;
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, LOCATION_PERMISSION_REQUEST);
            return;
        }
        pendingStart = false;
        Intent intent = new Intent(this, RideLocationService.class)
                .setAction(RideLocationService.ACTION_START);
        startForegroundService(intent);
    }

    void stopRide() {
        Intent intent = new Intent(this, RideLocationService.class)
                .setAction(RideLocationService.ACTION_STOP);
        startService(intent);
    }

    boolean calibrateLean() {
        if (!calibrationSensorReady) {
            runOnUiThread(() -> Toast.makeText(this,
                    "Sensoren er ikke klar endnu. Vent et øjeblik og prøv igen.",
                    Toast.LENGTH_SHORT).show());
            return false;
        }
        RideLocationService.calibrate(getApplicationContext(), calibrationReference);
        runOnUiThread(() -> Toast.makeText(this,
                "Kalibreret: motorcyklen er nu 0°.",
                Toast.LENGTH_SHORT).show());
        return true;
    }

    String snapshot() { return RideLocationService.snapshot(getApplicationContext()); }
    String history() { return RideLocationService.history(getApplicationContext()); }
    int deleteRides(String rideIdsJson) {
        return RideLocationService.deleteHistoryRides(getApplicationContext(), rideIdsJson);
    }
    boolean isTracking() { return RideLocationService.wasTracking(getApplicationContext()); }
    void setSwapSides(boolean swap) { RideLocationService.setSwapSides(getApplicationContext(), swap); }
    boolean getSwapSides() { return RideLocationService.getSwapSides(getApplicationContext()); }
    boolean isLeanSensorReady() { return calibrationSensorReady; }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ROTATION_VECTOR) return;
        float[] matrix = new float[9];
        SensorManager.getRotationMatrixFromVector(matrix, event.values);
        float reference = RideMath.leanReferenceDegrees(matrix);
        if (Float.isFinite(reference)) {
            calibrationReference = reference;
            calibrationSensorReady = true;
        }
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            boolean granted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            if (granted && pendingStart) startRide();
            else {
                pendingStart = false;
                Toast.makeText(this,
                        "Præcis placering er nødvendig for fart og kilometer.",
                        Toast.LENGTH_LONG).show();
            }
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (rotationSensor != null) {
            sensorManager.registerListener(this, rotationSensor, SensorManager.SENSOR_DELAY_UI);
        }
    }

    @Override
    protected void onPause() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("RidezAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
