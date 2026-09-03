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
    private static final int DB_VERSION = 1;

    LocationStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE locations (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "recorded_at INTEGER NOT NULL," +
                "latitude REAL NOT NULL," +
                "longitude REAL NOT NULL," +
                "accuracy REAL NOT NULL," +
                "altitude REAL," +
                "speed REAL," +
                "bearing REAL)");
        db.execSQL("CREATE INDEX locations_recorded_at ON locations(recorded_at)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Første databaseversion. Fremtidige ændringer migreres her.
    }

    synchronized void add(long recordedAt, double latitude, double longitude,
                          float accuracy, Double altitude, Float speed, Float bearing) {
        ContentValues values = new ContentValues();
        values.put("recorded_at", recordedAt);
        values.put("latitude", latitude);
        values.put("longitude", longitude);
        values.put("accuracy", accuracy);
        if (altitude == null) values.putNull("altitude"); else values.put("altitude", altitude);
        if (speed == null) values.putNull("speed"); else values.put("speed", speed);
        if (bearing == null) values.putNull("bearing"); else values.put("bearing", bearing);
        getWritableDatabase().insertOrThrow("locations", null, values);
    }

    synchronized Batch peek(int limit) throws JSONException {
        JSONArray items = new JSONArray();
        long lastId = 0;
        try (Cursor cursor = getReadableDatabase().query(
                "locations",
                new String[]{"id", "recorded_at", "latitude", "longitude", "accuracy", "altitude", "speed", "bearing"},
                null, null, null, null, "id ASC", Integer.toString(limit))) {
            while (cursor.moveToNext()) {
                lastId = cursor.getLong(0);
                JSONObject item = new JSONObject();
                item.put("timestamp", cursor.getLong(1));
                item.put("latitude", cursor.getDouble(2));
                item.put("longitude", cursor.getDouble(3));
                item.put("accuracy", cursor.getDouble(4));
                item.put("altitude", cursor.isNull(5) ? JSONObject.NULL : cursor.getDouble(5));
                item.put("speed", cursor.isNull(6) ? JSONObject.NULL : cursor.getDouble(6));
                item.put("heading", cursor.isNull(7) ? JSONObject.NULL : cursor.getDouble(7));
                items.put(item);
            }
        }
        return new Batch(items, lastId);
    }

    synchronized void deleteThrough(long lastId) {
        if (lastId > 0) getWritableDatabase().delete("locations", "id <= ?", new String[]{Long.toString(lastId)});
    }

    static final class Batch {
        final JSONArray items;
        final long lastId;

        Batch(JSONArray items, long lastId) {
            this.items = items;
            this.lastId = lastId;
        }

        boolean isEmpty() {
            return items.length() == 0;
        }
    }
}
