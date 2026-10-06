# Android persistent signing

The release keystore is stored in this public repository only as an AES-256 encrypted Base64 blob:

- `ontrack-release.jks.enc.b64`

The decryption/password value is **not** committed.

GitHub Actions expects one repository secret:

- `ANDROID_SIGNING_PASSWORD`

When that secret is present, the workflow decrypts the keystore at build time and signs every release APK with the same long-lived key.

Signing certificate SHA-256:

`61:EE:0C:F7:0A:AE:92:39:E0:96:D4:42:2D:3D:4C:3B:2D:B4:D7:67:D6:FF:B6:1A:48:66:81:2C:08:EC:7B:02`

Never commit the decrypted `.jks` file or the password.

Release signing is enabled through the repository secret configured for GitHub Actions.

Certificate validity: 2026-10-06 through 2126-09-12.
