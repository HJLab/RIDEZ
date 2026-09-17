package dk.ridez.app;

import android.webkit.JavascriptInterface;

final class RidezJavascriptBridge {
    private final MainActivity activity;

    RidezJavascriptBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface public void startRide() {
        activity.runOnUiThread(activity::startRide);
    }

    @JavascriptInterface public void stopRide() {
        activity.runOnUiThread(activity::stopRide);
    }

    @JavascriptInterface public boolean calibrateLean() {
        return activity.calibrateLean();
    }

    @JavascriptInterface public boolean isLeanSensorReady() {
        return activity.isLeanSensorReady();
    }

    @JavascriptInterface public String getSnapshot() {
        return activity.snapshot();
    }

    @JavascriptInterface public String getHistory() {
        return activity.history();
    }

    @JavascriptInterface public int deleteRides(String rideIdsJson) {
        return activity.deleteRides(rideIdsJson);
    }

    @JavascriptInterface public boolean isTracking() {
        return activity.isTracking();
    }

    @JavascriptInterface public void setSwapSides(boolean swap) {
        activity.setSwapSides(swap);
    }

    @JavascriptInterface public boolean getSwapSides() {
        return activity.getSwapSides();
    }

    @JavascriptInterface public int getBridgeVersion() {
        return 207;
    }
}
