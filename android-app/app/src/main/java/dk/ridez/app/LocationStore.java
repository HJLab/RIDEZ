package dk.ridez.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class LocationStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "ridez_locations.db";
    private static final int DB_VERSION = 2;

    LocationStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE locations (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "session_token TEXT," +
                "recorded_at INTEGER NOT NULL," +
                "latitude REAL NOT NULL," +
                "longitude REAL NOT NULL," +
                "accuracy REAL NOT NULL," +
                "altitude REAL," +
                "speed REAL," +
                "bearing REAL," +
                "uploaded INTEGER NOT NULL DEFAULT 0," +
                "web_delivered INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX locations_recorded_at ON locations(recorded_at)");
        db.execSQL("CREATE INDEX locations_upload_queue ON locations(uploaded,session_token,id)");
        db.execSQL("CREATE INDEX locations_web_queue ON locations(web_delivered,session_token,id)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE locations ADD COLUMN session_token TEXT");
            db.execSQL("ALTER TABLE locations ADD COLUMN uploaded INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE locations ADD COLUMN web_delivered INTEGER NOT NULL DEFAULT 0");
            db.execSQL("CREATE INDEX IF NOT EXISTS locations_upload_queue ON locations(uploaded,session_token,id)");
            db.execSQL("CREATE INDEX IF NOT EXISTS locations_web_queue ON locations(web_delivered,session_token,id)");
        }
    }

    synchronized void add(String sessionToken, long recordedAt, double latitude, double longitude,
                          float accuracy, Double altitude, Float speed, Float bearing) {
        ContentValues values = new ContentValues();
        if (sessionToken == null || sessionToken.isEmpty()) values.putNull("session_token");
        else values.put("session_token", sessionToken);
        values.put("recorded_at", recordedAt);
        values.put("latitude", latitude);
        values.put("longitude", longitude);
        values.put("accuracy", accuracy);
        if (altitude == null) values.putNull("altitude"); else values.put("altitude", altitude);
        if (speed == null) values.putNull("speed"); else values.put("speed", speed);
        if (bearing == null) values.putNull("bearing"); else values.put("bearing", bearing);
        getWritableDatabase().insertOrThrow("locations", null, values);
    }

    synchronized void adoptUnassigned(String sessionToken, long rideStartedAt) {
        if (sessionToken == null || sessionToken.isEmpty()) return;
        ContentValues values = new ContentValues();
        values.put("session_token", sessionToken);
        getWritableDatabase().update("locations", values,
                "session_token IS NULL AND recorded_at >= ?",
                new String[]{Long.toString(Math.max(0L, rideStartedAt - 30000L))});
    }

    synchronized Batch peekForWeb(String sessionToken, int limit) throws JSONException {
        if (sessionToken == null || sessionToken.isEmpty()) return Batch.empty();
        JSONArray items = new JSONArray();
        long lastId = 0;
        try (Cursor cursor = getReadableDatabase().query(
                "locations",
                new String[]{"id", "recorded_at", "latitude", "longitude", "accuracy", "altitude", "speed", "bearing"},
                "web_delivered=0 AND session_token=?", new String[]{sessionToken},
                null, null, "id ASC", Integer.toString(limit))) {
            while (cursor.moveToNext()) {
                lastId = cursor.getLong(0);
                items.put(toJson(cursor));
            }
        }
        return new Batch(items, lastId, sessionToken);
    }

    synchronized Batch peekForUpload(String sessionToken, int limit) throws JSONException {
        if (sessionToken == null || sessionToken.isEmpty()) return Batch.empty();

        JSONArray items = new JSONArray();
        long lastId = 0;
        try (Cursor cursor = getReadableDatabase().query(
                "locations",
                new String[]{"id", "recorded_at", "latitude", "longitude", "accuracy", "altitude", "speed", "bearing"},
                "uploaded=0 AND session_token=?", new String[]{sessionToken},
                null, null, "id ASC", Integer.toString(limit))) {
            while (cursor.moveToNext()) {
                lastId = cursor.getLong(0);
                items.put(toJson(cursor));
            }
        }
        return new Batch(items, lastId, sessionToken);
    }

    private JSONObject toJson(Cursor cursor) throws JSONException {
        JSONObject item = new JSONObject();
        item.put("timestamp", cursor.getLong(1));
        item.put("latitude", cursor.getDouble(2));
        item.put("longitude", cursor.getDouble(3));
        item.put("accuracy", cursor.getDouble(4));
        item.put("altitude", cursor.isNull(5) ? JSONObject.NULL : cursor.getDouble(5));
        item.put("speed", cursor.isNull(6) ? JSONObject.NULL : cursor.getDouble(6));
        item.put("heading", cursor.isNull(7) ? JSONObject.NULL : cursor.getDouble(7));
        return item;
    }

    synchronized void markWebDelivered(Batch batch) {
        if (batch == null || batch.lastId <= 0 || batch.sessionToken == null) return;
        ContentValues values = new ContentValues();
        values.put("web_delivered", 1);
        getWritableDatabase().update("locations", values,
                "id <= ? AND session_token=?",
                new String[]{Long.toString(batch.lastId), batch.sessionToken});
        deleteCompleted();
    }

    synchronized void markUploaded(Batch batch) {
        if (batch == null || batch.lastId <= 0 || batch.sessionToken == null) return;
        ContentValues values = new ContentValues();
        values.put("uploaded", 1);
        getWritableDatabase().update("locations", values,
                "id <= ? AND session_token=?",
                new String[]{Long.toString(batch.lastId), batch.sessionToken});
        deleteCompleted();
    }

    private void deleteCompleted() {
        getWritableDatabase().delete("locations", "uploaded=1 AND web_delivered=1", null);
    }

    static final class Batch {
        final JSONArray items;
        final long lastId;
        final String sessionToken;

        Batch(JSONArray items, long lastId, String sessionToken) {
            this.items = items;
            this.lastId = lastId;
            this.sessionToken = sessionToken;
        }

        static Batch empty() {
            return new Batch(new JSONArray(), 0L, null);
        }

        boolean isEmpty() {
            return items.length() == 0;
        }
    }
}
