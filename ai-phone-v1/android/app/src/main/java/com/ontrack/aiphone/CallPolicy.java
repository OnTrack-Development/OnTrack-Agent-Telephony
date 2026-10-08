package com.ontrack.aiphone;
import java.time.*;
import java.util.Objects;

/** Pure-Java, deterministic schedule and routing rules. */
public final class CallPolicy {
  public enum Mode { MANUAL, AUTOMATIC, DELAYED }
  public final Mode mode;
  public final int delaySeconds;
  public final boolean afterHoursEnabled;
  public final LocalTime businessStart, businessEnd;
  public final Mode afterHoursMode;
  public final boolean announceAi;
  public CallPolicy(Mode mode,int delaySeconds,boolean afterHoursEnabled,LocalTime start,LocalTime end,Mode afterHoursMode,boolean announceAi) {
    this.mode=Objects.requireNonNull(mode);this.delaySeconds=Math.max(0,Math.min(60,delaySeconds));
    this.afterHoursEnabled=afterHoursEnabled;this.businessStart=start;this.businessEnd=end;
    this.afterHoursMode=Objects.requireNonNull(afterHoursMode);this.announceAi=announceAi;
  }
  public boolean isAfterHours(ZonedDateTime now) {
    if (!afterHoursEnabled || businessStart==null || businessEnd==null || businessStart.equals(businessEnd)) return false;
    LocalTime t=now.toLocalTime();
    boolean inBusiness=businessStart.isBefore(businessEnd)
      ? (!t.isBefore(businessStart)&&t.isBefore(businessEnd))
      : (!t.isBefore(businessStart)||t.isBefore(businessEnd));
    return !inBusiness;
  }
  public Mode effectiveMode(ZonedDateTime now) { return isAfterHours(now)?afterHoursMode:mode; }
  public int delayMillis(Mode effective) { return effective==Mode.AUTOMATIC?0:delaySeconds*1000; }
}
