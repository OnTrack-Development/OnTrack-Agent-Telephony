# Android persistent signing

The release keystore is stored in this public repository only as an AES-256 encrypted Base64 blob:

- `ontrack-release.jks.enc.b64`

The decryption/password value is **not** committed.

GitHub Actions expects one repository secret:

- `ANDROID_SIGNING_PASSWORD`

When that secret is present, the workflow decrypts the keystore at build time and signs every release APK with the same long-lived key.

Signing certificate SHA-256:

`B0:41:6E:4B:92:66:7A:10:DD:06:E4:CF:C5:A7:CC:5B:2A:E9:D4:42:20:69:24:01:1F:19:92:15:49:74:C2:AC`

Never commit the decrypted `.jks` file or the password.
