package dk.ridez.app;

public final class RideMathTest {
    public static void main(String[] args) {
        RideMath.Segment moving = RideMath.assessSegment(
                1_000L, 10f, 2_000L, 10f, 5f, 10f);
        require(moving.accepted && moving.moving, "normal movement must be accepted");
        require(moving.distanceM >= 9.9f && moving.distanceM <= 10.1f, "distance must be retained");

        RideMath.Segment stopped = RideMath.assessSegment(
                1_000L, 0f, 2_000L, 0f, 5f, 1.2f);
        require(stopped.accepted && !stopped.moving && stopped.distanceM == 0f,
                "stationary drift must add no distance");

        RideMath.Segment jump = RideMath.assessSegment(
                1_000L, 5f, 2_000L, 60f, 5f, 1000f);
        require(!jump.accepted, "impossible acceleration must be rejected");

        RideMath.Segment inaccurate = RideMath.assessSegment(
                1_000L, 10f, 2_000L, 10f, 80f, 10f);
        require(!inaccurate.accepted, "inaccurate GPS must be rejected");

        require(Math.abs(RideMath.leanReferenceDegrees(new float[]{
                1, 0, 0, 0, 1, 0, 0, -1, 0})) < 0.01f,
                "upright portrait reference must be zero");
        require(Math.abs(RideMath.leanReferenceDegrees(new float[]{
                1, 0, 0, 0, 1, 0, 1, 0, 0}) - 90f) < 0.01f,
                "quarter-turn reference must remain measurable");

        require(RideMath.leanDegrees(20f, 0f, false) < 0f,
                "default left lean must be negative");
        require(RideMath.leanDegrees(20f, 0f, true) > 0f,
                "side swap must reverse the lean direction");

        System.out.println("RideMathTest: 8 checks passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
