package com.ontrack.aiphone;
import java.time.*;
public class PolicyTest {
  private static void eq(Object actual,Object expected,String label){if(!actual.equals(expected))throw new AssertionError(label+" expected "+expected+" got "+actual);}
  static void testRules(){
    CallPolicy p=new CallPolicy(CallPolicy.Mode.DELAYED,10,true,LocalTime.of(9,0),LocalTime.of(17,0),CallPolicy.Mode.AUTOMATIC,true);
    eq(p.effectiveMode(ZonedDateTime.parse("2026-10-09T11:00:00+03:00")),CallPolicy.Mode.DELAYED,"business");
    eq(p.effectiveMode(ZonedDateTime.parse("2026-10-09T22:00:00+03:00")),CallPolicy.Mode.AUTOMATIC,"afterhours");
    eq(p.delayMillis(CallPolicy.Mode.DELAYED),10000,"delay");
    CallPolicy notConfigured=new CallPolicy(CallPolicy.Mode.DELAYED,10,true,null,null,CallPolicy.Mode.AUTOMATIC,true);
    eq(notConfigured.effectiveMode(ZonedDateTime.now()),CallPolicy.Mode.DELAYED,"no schedule");
    CallPolicy overnight=new CallPolicy(CallPolicy.Mode.DELAYED,10,true,LocalTime.of(20,0),LocalTime.of(6,0),CallPolicy.Mode.MANUAL,true);
    eq(overnight.isAfterHours(ZonedDateTime.parse("2026-10-09T22:00:00+03:00")),false,"overnight business");
    eq(overnight.isAfterHours(ZonedDateTime.parse("2026-10-09T12:00:00+03:00")),true,"overnight afterhours");
  }
  static void testRaces(){
    AnswerDecision d=new AnswerDecision(); d.humanAnswered();eq(d.shouldCheckAi(),false,"human first");
    d=new AnswerDecision();eq(d.shouldCheckAi(),true,"checking");d.humanAnswered();eq(d.shouldAnswerAi(true),false,"human during async readiness");
    d=new AnswerDecision();d.ended();eq(d.shouldCheckAi(),false,"hangup before timer");
    d=new AnswerDecision();d.shouldCheckAi();eq(d.shouldAnswerAi(false),false,"unready");eq(d.state(),AnswerDecision.State.RINGING,"still ring");
    d=new AnswerDecision();d.shouldCheckAi();eq(d.shouldAnswerAi(true),true,"ready");d.telecomActive();eq(d.state(),AnswerDecision.State.AI_ACTIVE,"AI active");d.takeover();eq(d.state(),AnswerDecision.State.HUMAN_ACTIVE,"takeover state");
    d=new AnswerDecision();d.telecomActive();eq(d.state(),AnswerDecision.State.HUMAN_ACTIVE,"external answer");
  }
  public static void main(String[]args){testRules();testRaces();System.out.println("PASS: policy / midnight / unconfigured / human race / hangup / bridge gate / AI state");}
}
