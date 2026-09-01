---
name: Gmail SMTP authentication
description: Durable Gmail email-delivery guidance for this app's OTP and password-reset flows.
---

Use explicit SMTP authentication with the Gmail account and an App Password, reading `EMAIL_PASSWORD` directly. Keep `EMAIL_PASS` only as a migration fallback for older deployments; do not use OAuth2 refresh tokens for these transactional messages.

**Why:** Gmail OAuth failures surface as `invalid_grant` after a token expires or is revoked, while incorrect App Password credentials surface as SMTP `535 BadCredentials`. Treating both as a generic send failure makes the repair path unclear.

**How to apply:** Store `EMAIL_USER` and `EMAIL_PASSWORD` as Replit Secrets, restart the backend after changing them, and map `invalid_grant`, `535`, DNS, and timeout errors to explicit user-safe messages. Production Cloud Run must receive the same secrets during its deployment.