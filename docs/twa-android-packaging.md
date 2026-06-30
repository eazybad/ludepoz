# TWA Android Packaging

Use this if publishing Kampasika as a Trusted Web Activity. TWA is the cleanest Android wrapper for the current PWA because it keeps the web app as the source of truth and avoids unnecessary native permissions.

## Values To Decide

- Final production URL: `https://kampasika.org`
- Android package name: choose one stable value, for example `org.kampasika.app`
- App name: `Kampasika`
- Launcher name: `Kampasika`
- Theme color: `#0f1b2d`
- Display mode: standalone

Do not change the Android package name after publishing unless you are ready to publish a new Play Store app.

## Commands

Install/use Bubblewrap on the machine where Android tooling is available:

```powershell
npx @bubblewrap/cli init --manifest https://kampasika.org/manifest.json
npx @bubblewrap/cli build
```

Bubblewrap will ask for the package name, app name, signing information, and other values.

## Permissions

Keep permissions minimal. The app should not request SMS permissions.

Expected permissions for the wrapper:

- `android.permission.INTERNET`
- `android.permission.CAMERA` only if QR scan/camera features are enabled
- `android.permission.ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` only if GPS room/location features are enabled
- `android.permission.POST_NOTIFICATIONS` for Android 13+ notifications, if push notifications are enabled

Avoid:

- `READ_SMS`
- `RECEIVE_SMS`
- `SEND_SMS`
- Contacts permissions
- Call log permissions

## Digital Asset Links

After creating the Android project and signing setup, get the SHA-256 certificate fingerprint. For Play App Signing, use the App signing key certificate from Play Console, not only your local upload key.

Then publish:

`https://kampasika.org/.well-known/assetlinks.json`

Template:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "org.kampasika.app",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_PLAY_APP_SIGNING_SHA256"
      ]
    }
  }
]
```

Only publish this file after replacing both the package name and fingerprint with the real values.
