package dk.ridez.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
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
import android.webkit.ValueCallback;
import android.provider.MediaStore;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST = 4103;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4104;
    private static final int FILE_CHOOSER_REQUEST = 4105;
    private static final String MESSAGE_CHANNEL_ID = "ridez_messages";
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
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCameraUri;

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
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                pendingCameraUri = null;

                final boolean cameraOnly = params != null && params.isCaptureEnabled();
                Intent intent;
                try {
                    if (cameraOnly) {
                        File image = File.createTempFile("ridez-camera-", ".jpg", getCacheDir());
                        pendingCameraUri = FileProvider.getUriForFile(
                                MainActivity.this, getPackageName() + ".fileprovider", image);
                        intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
                        intent.setClipData(ClipData.newRawUri("RIDEZ kamera", pendingCameraUri));
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
                                Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        if (intent.resolveActivity(getPackageManager()) == null) {
                            throw new ActivityNotFoundException("Intet kamera fundet");
                        }
                    } else {
                        intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("image/*");
                    }
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (IOException | ActivityNotFoundException error) {
                    Toast.makeText(MainActivity.this,
                            cameraOnly ? "Kameraet kunne ikke åbnes." : "Galleriet kunne ikke åbnes.",
                            Toast.LENGTH_LONG).show();
                    filePathCallback.onReceiveValue(null);
                    filePathCallback = null;
                    pendingCameraUri = null;
                }
                return true;
            }
        });
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
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (pendingCameraUri != null) result = new Uri[]{pendingCameraUri};
            else result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        }
        if (filePathCallback != null) filePathCallback.onReceiveValue(result);
        filePathCallback = null;
        pendingCameraUri = null;
    }

    void showNativeMessageNotification(String title, String body) {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    MESSAGE_CHANNEL_ID, "RIDEZ beskeder", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Beskeder fra personer, der følger din tur");
            manager.createNotificationChannel(channel);
        }

        Intent openIntent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_ridez)
                .setContentTitle(title == null || title.trim().isEmpty() ? "RIDEZ · Ny besked" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), notification.build());
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
        if (filePathCallback != null) { filePathCallback.onReceiveValue(null); filePathCallback = null; }
        if (webView != null) {
            webView.removeJavascriptInterface("RidezAndroid");
            webView.destroy();
            webView = null;
        }
        locationStore.close();
        super.onDestroy();
    }
}
