# 0002 — Custom email/password auth with admin approval queue

## Status
Accepted — 2026-07-03

## Context
The reference product (`platform.simtryx.com/admin`) gates every new account behind manual admin review before it can log in and do anything. The product owner wants the same pattern here, plus the simplest possible credential model (email + password, no SSO/social login needed for the target user base of museum/institution staff).

## Decision
- Registration creates a `users` row with `status = 'pending'`, no role, no organization.
- Pending users cannot authenticate into the app proper (login succeeds only far enough to show a "waiting for approval" screen, or is blocked outright — see `apps/api/src/domain/auth.ts`).
- An Admin assigns `role` + `organization` and flips `status → 'active'`; only then can the account fully log in.
- Sessions are a signed JWT in an httpOnly, Secure, SameSite=Lax cookie, verified on every request server-side (role/org are re-read from the token payload but must also be re-validated against current DB state for destructive actions, since an admin may have disabled the account after the token was issued).
- Passwords are hashed (never stored/logged in plaintext).

## Consequences
- **Positive:** no third-party auth vendor bill or dependency; matches the exact approval-gated UX the product owner already validated with Simtryx; simple to reason about and test as pure domain logic (`canLogin(user)`, `canActivate(actor, target)`).
- **Negative:** we own password hashing, session issuance/rotation, and reset-flow security — more surface area than delegating to a vendor. Mitigated by keeping the auth module small, pure-function-first, and unit-tested (0008), and by never rolling custom crypto (use WebCrypto/battle-tested hashing primitives only).

## Alternatives considered
- **Magic link (passwordless):** removes password-management risk but still needed the same approval gate; rejected only because email+password was the explicit preference and avoids a dependency on transactional email deliverability for the *login* path (approval-notification email can still fail gracefully without blocking login).
- **Managed auth provider (Clerk/Auth0/Supabase Auth) + custom approval flag:** would reduce our security surface, but adds a paid dependency and doesn't remove the need to build the approval-queue UI/logic ourselves anyway. Rejected on cost grounds (0001).
