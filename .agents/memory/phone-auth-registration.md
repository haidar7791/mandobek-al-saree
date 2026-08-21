---
name: Firebase phone registration
description: Phone registration must use the same Firebase JS Phone Auth and custom reCAPTCHA flow as phone verification elsewhere.
---

Phone-based account creation uses Firebase JS SDK Phone Auth directly; server OTP transports and third-party messaging providers are not part of the registration contract.

**Why:** Firebase test phone numbers and their fixed verification codes are handled by Firebase Phone Auth, while custom server OTP flows bypass that behavior and caused conflicting registration paths.

**How to apply:** Keep the phone registration flow aligned with the working Firebase Phone Auth flow, including the custom reCAPTCHA verifier, confirmation result, and a finite timeout with loading cleanup.