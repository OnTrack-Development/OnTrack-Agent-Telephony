# OnTrack Media Gateway

This service is the media plane for OnTrack Agent Telephony.

The shared-hosting dashboard remains the control plane. The Media Gateway must run on a VPS because SIP/RTP requires long-running services and UDP ports.

## Call flow

1. Customer calls the Android SIM.
2. OnTrack Android answers according to the dashboard policy.
3. Android dials the configured Media Bridge DID using the same PhoneAccount/SIM.
4. The gateway answers and waits for an 8-digit session PIN.
5. Android sends that PIN using DTMF.
6. Android waits until Telecom exposes both cellular calls as conferenceable and requests a merge.
7. Asterisk receives the carrier-conference audio and records it.
8. The gateway reports connected / recording / ended to the dashboard.
9. When the bridge leg ends, the WAV file is uploaded to protected dashboard storage.
10. Call History exposes the recording through the authenticated audio endpoint.

## Requirements

- Linux VPS with Docker / Docker Compose.
- Public IPv4.
- UDP 5060 plus UDP 10000-20000 reachable.
- SIP trunk with a real PSTN DID that the Android SIM can call.
- Provider must support inbound voice to the Asterisk endpoint.
- Prefer G.711 u-law or A-law.

## Setup

1. Copy media-gateway/.env.example to media-gateway/.env.
2. In the dashboard open Bridge Status -> Media Gateway.
3. Copy Gateway API secret into ONTRACK_MEDIA_SECRET.
4. Fill the SIP trunk host, username, password and public DID.
5. Run: docker compose up -d --build
6. Verify registration: docker exec -it ontrack-media-gateway asterisk -rx "pjsip show registrations"
7. Put the same public DID into Bridge phone number in the dashboard.
8. Enable Media Bridge and Automatic carrier merge.
9. Make one inbound test call.

## Expected dashboard states

- REQUESTED: server allocated a media session.
- WAITING FOR ADD CALL: Android is waiting for Telecom/carrier to permit a second call.
- BRIDGE LEG DIALING: Android dialed the gateway DID.
- BRIDGE LEG ANSWERED: Asterisk answered.
- DTMF SENT: the 8-digit media PIN was transmitted.
- MERGE WAITING / MERGE REQUESTED: Android is waiting for or requested carrier conference.
- CONNECTED: the gateway itself confirmed the media leg.
- RECORDING: Asterisk started MixMonitor.
- READY recording: the WAV was uploaded to protected dashboard storage.

## Firewall

Restrict SIP UDP 5060 to the provider signaling IPs when possible. RTP UDP 10000-20000 must allow the provider media ranges.

## Phase boundary

This phase proves that live carrier audio reaches the server and can be recorded. It does not yet stream audio to the AI model. The next phase adds Asterisk External Media to the Voice Agent adapter.
