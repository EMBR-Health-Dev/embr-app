# Sharing a BRIEF with a clinician

She can show one BRIEF to her clinician, read only, without the clinician
needing an account. She creates a link on the BRIEF page; the clinician
opens it and enters a 6 digit code she gives them separately.

## How it is protected

| Concern                              | How                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A link that leaks or is forwarded    | It opens nothing without the 6 digit code, which she gives separately (aloud, by phone, on paper).                                                                             |
| The link in logs, proxies, referrers | The token is in the URL fragment (`/shared#<token>`), which browsers never send to a server. The page sends it in a POST body; it has `referrer: no-referrer` and `noindex`.   |
| Guessing the code                    | A link locks after 5 wrong codes (`MAX_FAILED_CODES`). Public routes are rate limited per IP (30 per 15 minutes).                                                              |
| The database                         | Only SHA-256 hashes of the token (256 random bits) and of the code (bound to the link's id) are stored.                                                                        |
| Links living forever                 | 7 or 30 days, her choice. At most 5 live links per BRIEF.                                                                                                                      |
| She changes her mind                 | She turns a link off at any time. Withdrawing consent, deleting the BRIEF or deleting her account stops every link (consent check on each open; database cascade).             |
| Telling which failure happened       | Unknown, expired, revoked, locked, withdrawn consent and deleted all answer the same 404. Only a wrong code on a live link answers 403, so the clinician knows to re check it. |
| Knowing who looked                   | Each link shows her how often it was opened and when. Every create, view, PDF download, wrong code (a security event) and revoke is in the audit log.                          |

## What the clinician sees

The same BRIEF she sees, through the same component (`BriefContent`), and
the same PDF she would print. No notes, no other BRIEF, nothing else from
her account. The appointment follow up answer is never shown.

## What it is not

Not a portal, not an account for the clinician, and never automatic:
nothing is shared unless she creates a link. Employers can never see a
shared BRIEF. No email carries health information; if a "send to my
clinic" email is added later, it carries the link only.

## Code

- API: `apps/api/src/modules/briefs/brief-share.service.ts`, `brief-share.routes.ts`
- Web: `apps/web/src/components/brief-share.tsx` (her side), `apps/web/src/app/shared/` (the clinician's page)
- Tests: `apps/api/test/integration/brief-share.test.ts`, `apps/web/src/components/brief-share.test.tsx`, `apps/web/src/app/shared/shared.test.tsx`
