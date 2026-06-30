# Play Console Copy

Use this as a starting point when filling Google Play Console. Replace domains, email, and test account details with the final production values.

## App Access Instructions

Kampasika uses phone OTP as the primary login method. For review, use the password fallback:

1. Open the app.
2. Tap Log in.
3. Tap "Use password instead."
4. Username: `REVIEWER_USERNAME_HERE`
5. Password: `REVIEWER_PASSWORD_HERE`

If you prefer testing OTP, contact `support@kampasika.org` before review so we can provide a reachable test phone number and OTP support.

## Privacy Policy URL

`https://kampasika.org/privacy.html`

Replace with your final production domain if different.

## Account Deletion URL

`https://kampasika.org/account-deletion.html`

In-app deletion path:

Profile > menu > Delete account

## Ads Declaration

Current recommended answer: No, unless you add an ad SDK or sponsored/native ads before submission.

## Target Audience

Recommended answer: 18+ / university and college students.

Do not include children as a target audience unless you are prepared to comply with Families policy.

## Data Safety Draft

Declare collection for these categories if the Play build includes the current app features:

- Personal info:
  - Name or username
  - Phone number
  - User IDs
- Photos and videos:
  - Profile photos
  - Listing/service/room photos
  - Payment proof photos
  - Verification ID photos
- Files and docs:
  - Group resources
  - Uploaded documents
  - File names and file metadata
- App activity:
  - In-app messages/chats
  - Listings, services, rooms, group actions, registrations, searches, notification preferences
- Location:
  - User-entered location
  - Precise location only if the GPS room/location feature is enabled in the Android app
- Financial info:
  - Payment amount
  - Payment reference
  - Payment status
  - Payment phone number
  - Payment proof
- Device or other IDs:
  - Firebase Auth UID
  - Firebase Cloud Messaging token

Security practices:

- Data encrypted in transit: Yes.
- Users can request data deletion: Yes.
- Independent security review: No, unless you complete MASA or another approved review.

Sharing:

Kampasika uses service providers needed for app functionality: Firebase/Google Cloud, Africa's Talking for OTP SMS, and configured payment providers. Do not mark "sold." Mark sharing only where Play's definition requires it; service-provider processing is usually not "sharing" under Play's Data Safety definition, but you remain responsible for accurate declarations.

## Content Rating Notes

Kampasika contains user-generated content: listings, chats, groups, files, and images. Answer the questionnaire honestly for user-generated content and communication between users.

## Financial Features Notes

If payment collection/order/payment proof features remain enabled in the Android build, complete any payment or financial feature declarations requested by Play Console. If the Play build hides payment features, document that clearly in release notes and Data Safety.
