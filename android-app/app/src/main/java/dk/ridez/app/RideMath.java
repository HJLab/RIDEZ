package dk.ridez.app;

final class RideMath {
    static final float MIN_MOVING_SPEED_MS = 2.5f;       // 9 km/t
    static final float MAX_ACCURACY_M = 35f;
    static final float MAX_SPEED_MS = 70f;               // 252 km/t
    static final float MAX_ACCELERATION_MS2 = 14f;
    static final long MAX_SEGMENT_MS = 15_000L;

    private RideMath() { }

    static Segment assessSegment(
            long previousTime, float previousSpeed,
            long currentTime, float currentSpeed,
            float accuracy, float measuredDistance) {
        long dtMs = currentTime - previousTime;
        if (dtMs < 400L || dtMs > MAX_SEGMENT_MS || accuracy <= 0f || accuracy > MAX_ACCURACY_M) {
            return Segment.rejected();
        }
        if (!Float.isFinite(currentSpeed) || currentSpeed < 0f || currentSpeed > MAX_SPEED_MS) {
            return Segment.rejected();
        }

        float seconds = dtMs / 1000f;
        float acceleration = (currentSpeed - Math.max(0f, previousSpeed)) / seconds;
        if (Math.abs(acceleration) > MAX_ACCELERATION_MS2) return Segment.rejected();

        boolean moving = currentSpeed >= MIN_MOVING_SPEED_MS || previousSpeed >= MIN_MOVING_SPEED_MS;
        if (!moving) return new Segment(true, false, 0f, acceleration, dtMs);

        float expected = ((Math.max(0f, previousSpeed) + currentSpeed) / 2f) * seconds;
        float maxReasonable = Math.max(accuracy * 1.5f, expected * 2.2f + 8f);
        if (!Float.isFinite(measuredDistance) || measuredDistance < 0f || measuredDistance > maxReasonable) {
            return Segment.rejected();
        }
        float minimum = Math.max(2.0f, accuracy * 0.18f);
        float distance = measuredDistance >= minimum ? measuredDistance : expected;
        return new Segment(true, true, Math.max(0f, distance), acceleration, dtMs);
    }

    static final class Segment {
        final boolean accepted;
        final boolean moving;
        final float distanceM;
        final float accelerationMs2;
        final long durationMs;

        Segment(boolean accepted, boolean moving, float distanceM, float accelerationMs2, long durationMs) {
            this.accepted = accepted;
            this.moving = moving;
            this.distanceM = distanceM;
            this.accelerationMs2 = accelerationMs2;
            this.durationMs = durationMs;
        }

        static Segment rejected() {
            return new Segment(false, false, 0f, 0f, 0L);
        }
    }
}
