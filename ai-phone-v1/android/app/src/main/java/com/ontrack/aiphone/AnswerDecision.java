package com.ontrack.aiphone;
/** Pure-Java decision logic, shared by runtime and JVM tests; all operations serialized on Android main thread. */
public final class AnswerDecision {
  public enum State { RINGING, CHECKING, AI_ANSWERING, AI_ACTIVE, HUMAN_ACTIVE, ENDED }
  private State state=State.RINGING;
  private boolean aiRequested=false;
  public State state(){return state;}
  public boolean shouldCheckAi(){if(state!=State.RINGING)return false;state=State.CHECKING;return true;}
  public boolean shouldAnswerAi(boolean bridgeReady){
    if(state!=State.CHECKING)return false;
    if(!bridgeReady){state=State.RINGING;return false;}
    state=State.AI_ANSWERING;aiRequested=true;return true;
  }
  public void humanAnswered(){if(state!=State.ENDED){state=State.HUMAN_ACTIVE;aiRequested=false;}}
  public void telecomActive(){if(state==State.ENDED)return;state=(aiRequested&&state==State.AI_ANSWERING)?State.AI_ACTIVE:State.HUMAN_ACTIVE;}
  public void ended(){state=State.ENDED;aiRequested=false;}
  public void takeover(){if(state==State.AI_ACTIVE){state=State.HUMAN_ACTIVE;aiRequested=false;}}
}
