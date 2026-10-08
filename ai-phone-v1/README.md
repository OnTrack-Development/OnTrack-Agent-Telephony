# OnTrack AI Phone v1.0 — New, isolated POC

> This is a **development POC**, not a deployable commercial phone answering system. It is isolated under `ai-phone-v1/` and **does not modify the existing Android/telephony module on `main`**.

## Implemented
- Android role request (`ROLE_DIALER`), `ACTION_DIAL`, `InCallService`, in-call notification/UI, manual answer/reject, 10-second default AI timer, cancel on human answer/hangup, office hours settings (disabled until explicitly configured), AI disclosure preference.
- Thread-safe background Windows readiness check through **ADB USB reverse**. The check never carries cellular call audio. A missing/unready companion causes Android to leave the call ringing for human response.
- Windows 11 local Tkinter companion: audio endpoint enumeration, Gemini Live PCM 16 kHz input / 24 kHz output, interrupt buffer flushing, locally bound token-protected readiness gate, optional manual route certification.
- Android-call-policy JVM tests and Windows bridge tests; GitHub Actions for test/debug APK/Windows EXE+Inno Setup installer.

## Explicitly NOT proven / NOT enabled
- Bluetooth HFP phone-call RX/TX on Xiaomi / Phone Link or other device routes. Selecting a sound device in Windows **does not prove SIM media is present**. The desktop has no programmatic cellular-audio takeover API.
- Android AI audio takeover or return-to-AI. Button is deliberately non-operative until real media handoff is proven.
- Full-screen call UI on every Android OEM and production release signing.
- Gemini session recovery, native Windows call-event monitoring, commercial production readiness.
- An AI model is not baked into the APK; select one your Gemini API key can access.

## Safety model
Automatic answering needs **both** a connected Gemini Live session and a deliberate operator verification of the selected phone-call audio endpoints, plus the USB ADB-reverse readiness endpoint. This is an interim POC safeguard, not a proof that phone routing works. The default is fail-closed. No VPS/SIP/Asterisk or cellular call recording APIs.

## Build
Android: Java 17, Android SDK 35, Gradle 8.9, `gradle -p android :app:assembleDebug`.
Windows: Python 3.11+, `pip install -r windows/requirements.txt`, `python windows/gui.py`.
See `docs/INSTALL_AR.md` and `docs/TEST_REPORT.md`.

## License
Original code written for this prototype. Do not import Aokie or other restricted third-party project sources. Dependencies retain their own licenses. Before commercial redistribution, verify all dependency notices and Gemini/API terms.
