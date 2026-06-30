# Google Play Readiness

Last updated: June 30, 2026

This checklist is tailored to Kampasika's current web/PWA + Firebase architecture.

## Required Before Production Review

- Deploy the frontend build and verify these public URLs work:
  - `/privacy.html`
  - `/account-deletion.html`
- Deploy Cloud Functions used by OTP authentication:
  - `requestAuthOtp`
  - `verifyAuthOtp`
- Confirm Firebase function secrets exist:
  - `AFRICASTALKING_API_KEY`
  - `AFRICASTALKING_USERNAME`
- Complete Google Play Console forms:
  - App access: provide test credentials or OTP testing instructions.
  - Data safety: disclose account data, phone number, user content, photos/files, payment info, location when used, notifications/device token, and verification documents.
  - Privacy policy URL: `https://kampasika.org/privacy.html` or the final production domain.
  - Account deletion URL: `https://kampasika.org/account-deletion.html` or the final production domain.
  - Content rating questionnaire.
  - Target audience and ads declaration.
  - Financial features declaration if payment collection/order/payment proof features are enabled in the Play build.

## Android Packaging Requirements

- Publish as an Android App Bundle (`.aab`), not only APK.
- Use a current target SDK level accepted by Google Play at submission time.
- Use Play App Signing.
- If wrapping the PWA, prefer Trusted Web Activity or Capacitor with minimal permissions.
- Do not request Android SMS permissions. OTP is sent server-side, so the app should not need `READ_SMS`, `RECEIVE_SMS`, or `SEND_SMS`.
- Request only permissions that the app actually uses:
  - Camera only for QR scanning / image capture.
  - Location only for room/location features and only after user action.
  - Notifications only after a clear opt-in prompt.
  - Photos/files only when the user uploads content.

## Security Baseline

- Keep Firebase Auth as the source of identity.
- Keep OTP verification server-side; do not expose Africa's Talking API keys to the client.
- Keep Firestore and Storage rules deployed with every release.
- Avoid broad Android permissions in the wrapper app.
- Use HTTPS only.
- Add app integrity checks later if abuse becomes a real risk. For a first launch, do not block legitimate students on older devices without a clear abuse signal.

## Data Safety Draft

Likely data categories to disclose in Play Console:

- Personal info: name/username, phone number, optional ID-verification name.
- Photos and videos: profile pictures, listing photos, room photos, payment proof, verification ID photos.
- Files and docs: group resources, assignment files, payment proof files.
- App activity: listings, chats, groups, registrations, collection/payment status, notification preferences.
- Location: user-entered location and optional precise location when using GPS features.
- Financial info: payment amount, payment reference, payment proof, payment phone number, transaction status.
- Device or other IDs: Firebase Cloud Messaging token, Firebase Auth UID.

Mark data as encrypted in transit when served over HTTPS/Firebase. Account deletion is available in-app from Profile > menu > Delete account, and also through the public deletion request page.

## Current Gaps To Close Before Submission

- Create the Android App Bundle (`.aab`) with Trusted Web Activity/Bubblewrap or Capacitor.
- If using Trusted Web Activity, publish a valid `/.well-known/assetlinks.json` after you know the final Android package name and Play signing SHA-256 fingerprint.
- Prepare Play Store screenshots and feature graphic.
- Prepare a tester account / OTP testing process for Play review.
- Decide whether the Play build includes payment features. If yes, review Google Play financial services/payment policy text before submission.
