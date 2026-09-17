package dk.ridez.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class RideStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "ridez_solo.db";
    private static final int DB_VERSION = 1;

    RideStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE rides (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "started_at INTEGER NOT NULL," +
                "ended_at INTEGER," +
                "distance_m REAL NOT NULL DEFAULT 0," +
                "active_ms INTEGER NOT NULL DEFAULT 0," +
                "max_speed_ms REAL NOT NULL DEFAULT 0," +
                "max_accel_ms2 REAL NOT NULL DEFAULT 0," +
                "max_brake_ms2 REAL NOT NULL DEFAULT 0," +
                "max_left_deg REAL NOT NULL DEFAULT 0," +
                "max_right_deg REAL NOT NULL DEFAULT 0," +
                "left_turns INTEGER NOT NULL DEFAULT 0," +
                "right_turns INTEGER NOT NULL DEFAULT 0," +
                "zero_50_ms INTEGER," +
                "zero_80_ms INTEGER," +
                "zero_100_ms INTEGER)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

    synchronized long createRide(long startedAt) {
        ContentValues values = new ContentValues();
        values.put("started_at", startedAt);
        return getWritableDatabase().insertOrThrow("rides", null, values);
    }

    synchronized void save(long rideId, Snapshot s, boolean finished) {
        ContentValues v = new ContentValues();
        if (finished) v.put("ended_at", s.updatedAt);
        v.put("distance_m", s.distanceM);
        v.put("active_ms", s.activeMs);
        v.put("max_speed_ms", s.maxSpeedMs);
        v.put("max_accel_ms2", s.maxAccelMs2);
        v.put("max_brake_ms2", s.maxBrakeMs2);
        v.put("max_left_deg", s.maxLeftDeg);
        v.put("max_right_deg", s.maxRightDeg);
        v.put("left_turns", s.leftTurns);
        v.put("right_turns", s.rightTurns);
        putNullable(v, "zero_50_ms", s.zero50Ms);
        putNullable(v, "zero_80_ms", s.zero80Ms);
        putNullable(v, "zero_100_ms", s.zero100Ms);
        getWritableDatabase().update("rides", v, "id=?", new String[]{Long.toString(rideId)});
    }

    synchronized JSONObject history() throws JSONException {
        JSONArray rides = new JSONArray();
        double totalDistance = 0;
        long totalActive = 0;
        try (Cursor c = getReadableDatabase().query("rides", null, "ended_at IS NOT NULL",
                null, null, null, "started_at DESC", "200")) {
            while (c.moveToNext()) {
                Snapshot s = fromCursor(c);
                rides.put(s.toJson());
                totalDistance += s.distanceM;
                totalActive += s.activeMs;
            }
        }
        return new JSONObject()
                .put("rides", rides)
                .put("totalDistanceM", totalDistance)
                .put("totalActiveMs", totalActive);
    }

    synchronized Snapshot latestActive() {
        try (Cursor c = getReadableDatabase().query("rides", null, "ended_at IS NULL",
                null, null, null, "started_at DESC", "1")) {
            return c.moveToFirst() ? fromCursor(c) : null;
        }
    }

    private Snapshot fromCursor(Cursor c) {
        Snapshot s = new Snapshot();
        s.id = getLong(c, "id");
        s.startedAt = getLong(c, "started_at");
        s.updatedAt = nullableLong(c, "ended_at", System.currentTimeMillis());
        s.distanceM = getDouble(c, "distance_m");
        s.activeMs = getLong(c, "active_ms");
        s.maxSpeedMs = getDouble(c, "max_speed_ms");
        s.maxAccelMs2 = getDouble(c, "max_accel_ms2");
        s.maxBrakeMs2 = getDouble(c, "max_brake_ms2");
        s.maxLeftDeg = getDouble(c, "max_left_deg");
        s.maxRightDeg = getDouble(c, "max_right_deg");
        s.leftTurns = (int) getLong(c, "left_turns");
        s.rightTurns = (int) getLong(c, "right_turns");
        s.zero50Ms = nullableLongObject(c, "zero_50_ms");
        s.zero80Ms = nullableLongObject(c, "zero_80_ms");
        s.zero100Ms = nullableLongObject(c, "zero_100_ms");
        return s;
    }

    private static long getLong(Cursor c, String name) { return c.getLong(c.getColumnIndexOrThrow(name)); }
    private static double getDouble(Cursor c, String name) { return c.getDouble(c.getColumnIndexOrThrow(name)); }
    private static long nullableLong(Cursor c, String name, long fallback) {
        int i = c.getColumnIndexOrThrow(name); return c.isNull(i) ? fallback : c.getLong(i);
    }
    private static Long nullableLongObject(Cursor c, String name) {
        int i = c.getColumnIndexOrThrow(name); return c.isNull(i) ? null : c.getLong(i);
    }
    private static void putNullable(ContentValues values, String key, Long value) {
        if (value == null) values.putNull(key); else values.put(key, value);
    }

    static final class Snapshot {
        long id;
        long startedAt;
        long updatedAt;
        double distanceM;
        long activeMs;
        double currentSpeedMs;
        double maxSpeedMs;
        double maxAccelMs2;
        double maxBrakeMs2;
        double currentLeanDeg;
        double maxLeftDeg;
        double maxRightDeg;
        int leftTurns;
        int rightTurns;
        Long zero50Ms;
        Long zero80Ms;
        Long zero100Ms;
        boolean tracking;
        boolean gpsReady;
        boolean sensorReady;
        float gpsAccuracyM;

        JSONObject toJson() throws JSONException {
            JSONObject o = new JSONObject()
                    .put("id", id).put("startedAt", startedAt).put("updatedAt", updatedAt)
                    .put("distanceM", distanceM).put("activeMs", activeMs)
                    .put("elapsedMs", Math.max(0, updatedAt - startedAt))
                    .put("currentSpeedMs", currentSpeedMs).put("maxSpeedMs", maxSpeedMs)
                    .put("maxAccelMs2", maxAccelMs2).put("maxBrakeMs2", maxBrakeMs2)
                    .put("currentLeanDeg", currentLeanDeg)
                    .put("maxLeftDeg", maxLeftDeg).put("maxRightDeg", maxRightDeg)
                    .put("leftTurns", leftTurns).put("rightTurns", rightTurns)
                    .put("tracking", tracking).put("gpsReady", gpsReady)
                    .put("sensorReady", sensorReady).put("gpsAccuracyM", gpsAccuracyM);
            o.put("zero50Ms", zero50Ms == null ? JSONObject.NULL : zero50Ms);
            o.put("zero80Ms", zero80Ms == null ? JSONObject.NULL : zero80Ms);
            o.put("zero100Ms", zero100Ms == null ? JSONObject.NULL : zero100Ms);
            return o;
        }
    }
}
