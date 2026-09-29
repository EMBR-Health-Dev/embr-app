# Registration consent: decisions for counsel

EMBR stores self-reported health information (symptoms, severity, cycle
details, daily context such as sleep and stress, treatments, free-text
notes) and produces summaries from it. Users are in the EU/UK and Japan.
Engineering has built the consent **infrastructure** so that each answer
below is a configuration or wording change, not a code change. Nothing
here goes to production until these are answered.

## The five questions

| #   | Question                                                                                                     | What the code does until answered                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What is the legal basis for processing EMBR health information for EU/UK users (Art. 6 and Art. 9 GDPR)?     | Records facts only: which document versions were shown, in which language, what the user ticked, when. The code never labels the processing as consent-based.                                                                                           |
| 2   | Is explicit consent required, and if so, may creating an account be conditional on it?                       | Configurable: `CONSENT_HEALTH_REQUIRED_AT_REGISTRATION` (default `false`). Either way, health features are blocked server-side until the health item is current, so no health data is processed without it.                                             |
| 3   | What is the appropriate withdrawal mechanism, and what happens to data already recorded?                     | A withdrawal endpoint exists (`POST /consents/withdraw`) that keeps the account active: health features stop, while export, settings and account deletion remain available. Existing data is kept, not processed, until the user deletes it. No UI yet. |
| 4   | What consent evidence may EMBR keep after account deletion, in what form, and for how long?                  | Consent records are currently deleted with the account. The consent record stores no IP address or user agent. **Must be confirmed or changed before merge.**                                                                                           |
| 5   | What additional APPI requirements apply to acquiring and using health information (要配慮個人情報) in Japan? | Consent is captured by an unchecked checkbox per item, in the user's language (EN/JA), with the language recorded.                                                                                                                                      |

## Wording counsel needs to supply (EN and JA)

1. Terms: "I agree to the Terms of Use." (contractual acceptance)
2. Privacy: "I have read and understood the Privacy Policy." (acknowledgement, not agreement)
3. Health information: explanation sentence and checkbox text. Current
   placeholder: "I acknowledge and, where required, consent to EMBR
   processing the health information I provide as described above and in
   the Privacy Policy."
4. Settings text on managing choices. Current placeholder: "You can manage
   your privacy choices in your account settings. Where processing is based
   on consent, you can withdraw that consent at any time."

## Versions

Each item is versioned independently (`TERMS`, `PRIVACY`,
`HEALTH_PROCESSING`) in `packages/validation/src/index.ts` (`LEGAL_DOCUMENT_VERSIONS`). Current
values are `0.1-draft`. When the documents are final, each gets a version
and effective date shown on the published page (for example "Version 1.0,
effective 1 October 2026"), and the same string is set in code. Raising a
version asks every existing user to review the item again at next sign-in.

## Related open items

- Whether historical aggregate employer statistics may remain after a
  member withdraws (future calculations already exclude them).
- Retention period for the security audit log, which does record IP
  address and user agent for sign-in events.
