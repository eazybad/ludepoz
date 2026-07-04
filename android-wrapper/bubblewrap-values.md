# Kampasika Android Wrapper Values

Use these exact values when running Bubblewrap or PWABuilder for the Play Store wrapper.

## Stable Identity

- Web manifest URL: `https://kampasika.org/manifest.json`
- Web origin: `https://kampasika.org`
- Android package name: `org.kampasika.app`
- App name: `Kampasika`
- Launcher name: `Kampasika`
- Start URL: `/`
- Scope: `/`
- Display mode: `standalone`
- Orientation: `portrait`
- Theme color: `#0f1b2d`
- Background color: `#f4f6f8`

Do not change the Android package name after the first Play Store upload. Changing it creates a different Android app instead of updating the existing one.

## First Build

Run this on a machine with Java JDK and Android SDK installed:

```powershell
npx @bubblewrap/cli init --manifest https://kampasika.org/manifest.json
npx @bubblewrap/cli build
```

Choose Android App Bundle (`.aab`) for Play Store upload.

## Update Builds

For future releases:

1. Keep the same package name: `org.kampasika.app`.
2. Keep the same upload keystore created by Bubblewrap.
3. Increase the Android version code.
4. Build a new `.aab`.
5. Upload that `.aab` in Play Console.

## Digital Asset Links

After Play Console shows the app signing certificate SHA-256 fingerprint, generate the hosted asset link file:

```powershell
$env:ANDROID_SHA256_FINGERPRINTS="AA:BB:CC:REPLACE_WITH_PLAY_APP_SIGNING_SHA256"
npm run android:assetlinks
npm run build
```

Then deploy Hosting. The file must be reachable at:

```text
https://kampasika.org/.well-known/assetlinks.json
```

If you also want local sideload testing before Play signs the app, include both fingerprints separated by commas:

```powershell
$env:ANDROID_SHA256_FINGERPRINTS="LOCAL_UPLOAD_SHA256,PLAY_APP_SIGNING_SHA256"
```

