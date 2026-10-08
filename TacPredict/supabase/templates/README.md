# Production email branding

Apply `verification.html` to **both** Authentication → Email → Templates →
**Magic Link** and **Confirm signup**. Supabase `signInWithOtp` uses those templates,
and existing users and newly created accounts may use different ones.

- Magic Link subject: `Your TacPredict verification code`
- Confirm signup subject: `Verify your email — TacPredict`
- Both bodies display `{{ .Token }}` only, **not** `{{ .ConfirmationURL }}`.
- Backend OTP length: 6; expiration: 600 seconds.
- Template logo: `https://tacpredict.fun/brand/favicon.png` (PNG for mail-client compatibility).

The visible **From** address/name is independent of the HTML template.
Authentication → Email → SMTP must use an authenticated delivery provider:
- Sender email: `support@tacpredict.fun`
- Sender name: `TacPredict`
- Host, port, username and password: real SMTP credentials for an authorized sender.
- Verify sender/domain with the delivery provider and its required SPF/DKIM records.
  Preserve all existing mail MX and DNS configuration; do not replace it blindly.

A mailbox or forwarding address alone is not an outbound SMTP service. Do not
claim the From address has changed until the hosted SMTP settings are saved and
a user-approved delivery test confirms the actual message headers.

Hosted template and SMTP application is pending dashboard access, not completed
by committing this local template file.
