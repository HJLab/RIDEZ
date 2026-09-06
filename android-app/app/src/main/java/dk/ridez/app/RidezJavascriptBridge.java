package dk.ridez.app;

import android.webkit.JavascriptInterface;

final class RidezJavascriptBridge {
    private final MainActivity activity;

    RidezJavascriptBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void startTracking(String mode) {
        activity.runOnUiThread(() -> activity.startNativeTracking(mode));
    }

    @JavascriptInterface
    public void configureTracking(String supabaseUrl, String anonKey,
                                  String driverToken, double rideStartedAt) {
        activity.runOnUiThread(() -> activity.configureNativeTracking(
                supabaseUrl, anonKey, driverToken, Math.max(0L, (long) rideStartedAt)));
    }

    @JavascriptInterface
    public void acknowledgeLocations(String lastId) {
        try {
            long parsed = Long.parseLong(lastId);
            activity.runOnUiThread(() -> activity.acknowledgeWebLocations(parsed));
        } catch (NumberFormatException ignored) { }
    }

    @JavascriptInterface
    public int getBridgeVersion() {
        return activity.nativeBridgeVersion();
    }

    @JavascriptInterface
    public void stopTracking() {
        activity.runOnUiThread(activity::stopNativeTracking);
    }

    @JavascriptInterface
    public void showNotification(String title, String body) {
        activity.runOnUiThread(() -> activity.showNativeMessageNotification(title, body));
    }

    @JavascriptInterface
    public boolean isTracking() {
        return RideLocationService.wasTracking(activity.getApplicationContext());
    }
}
