package dk.ridez.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST = 4103;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4104;
    private static final String APP_URL = "https://hjlab.github.io/RIDEZ/";
    private static final String APP_HOST = "hjlab.github.io";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable drainTask = new Runnable() {
        @Override public void run() {
            drainStoredLocations();
            handler.postDelayed(this, 1000L);
        }
    };

    private WebView webView;
    private LocationStore locationStore;
    private boolean pageReady;
    private boolean webWatchActive;
    private boolean pendingTrackingStart;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        locationStore = new LocationStore(getApplicationContext());
        configureWebView();
        requestNotificationPermissionIfNeeded();
        webView.loadUrl(APP_URL);
    }

    private void configureWebView() {
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new RidezJavascriptBridge(this), "RidezAndroid");
        installNativeGeolocationBridge();
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = url != null && url.startsWith(APP_URL);
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    view.evaluateJavascript(readAsset("native_bridge.js"), null);
                }
                drainStoredLocations();
            }
        });
    }

    private void installNativeGeolocationBridge() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                    webView,
                    readAsset("native_bridge.js"),
                    Collections.singleton("https://hjlab.github.io"));
        }
    }

    private String readAsset(String name) {
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                getAssets().open(name), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line).append('\n');
        } catch (IOException e) {
            throw new IllegalStateException("Kunne ikke indlæse " + name, e);
        }
        return result.toString();
    }

    void startNativeTracking(String mode) {
        webWatchActive = true;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            pendingTrackingStart = true;
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
            }, LOCATION_PERMISSION_REQUEST);
            return;
        }
        pendingTrackingStart = false;
        Intent intent = new Intent(this, RideLocationService.class).setAction(RideLocationService.ACTION_START);
        startForegroundService(intent);
        drainStoredLocations();
    }

    void stopNativeTracking() {
        webWatchActive = false;
        pendingTrackingStart = false;
        Intent intent = new Intent(this, RideLocationService.class).setAction(RideLocationService.ACTION_STOP);
        startService(intent);
    }

    private void drainStoredLocations() {
        if (!pageReady || !webWatchActive || webView == null) return;
        try {
            LocationStore.Batch batch = locationStore.peek(250);
            if (batch.isEmpty()) return;
            long lastId = batch.lastId;
            String javascript = "window.__ridezNativeDeliverBatch&&window.__ridezNativeDeliverBatch(" +
                    batch.items.toString() + ");";
            webView.evaluateJavascript(javascript, ignored -> locationStore.deleteThrough(lastId));
        } catch (JSONException ignored) {
            sendNativeError(2, "Gemte GPS-punkter kunne ikke læses.");
        }
    }

    private void sendNativeError(int code, String message) {
        if (!pageReady || webView == null) return;
        String safeMessage = org.json.JSONObject.quote(message);
        webView.evaluateJavascript("window.__ridezNativeGeoError&&window.__ridezNativeGeoError(" +
                code + "," + safeMessage + ");", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            boolean granted = grantResults.length > 0 &&
                    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (granted && pendingTrackingStart) startNativeTracking("high");
            else {
                pendingTrackingStart = false;
                webWatchActive = false;
                sendNativeError(1, "Præcis placering skal tillades for at registrere turen.");
            }
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) { }
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(drainTask);
        handler.post(drainTask);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(drainTask);
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(drainTask);
        if (webView != null) {
            webView.removeJavascriptInterface("RidezAndroid");
            webView.destroy();
            webView = null;
        }
        locationStore.close();
        super.onDestroy();
    }
}
