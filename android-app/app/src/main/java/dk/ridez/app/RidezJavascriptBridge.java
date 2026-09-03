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
    public void stopTracking() {
        activity.runOnUiThread(activity::stopNativeTracking);
    }

    @JavascriptInterface
    public boolean isTracking() {
        return RideLocationService.wasTracking(activity.getApplicationContext());
    }
}
