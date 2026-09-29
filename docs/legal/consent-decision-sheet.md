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

The strings live in `apps/web/messages/en.json` and `ja.json` (`Consent`).
Current placeholders, revised for native Japanese register (calm, plain,
precise; 「取り扱い」 rather than a literal 「処理」 in the UI):

| Item                | English placeholder                                                                                                                                                                                                                                                                                | Japanese placeholder                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terms               | I agree to the Terms of Use.                                                                                                                                                                                                                                                                       | 利用規約に同意します。                                                                                                                                                                                           |
| Privacy             | I have read and understood the Privacy Policy.                                                                                                                                                                                                                                                     | プライバシーポリシーを読み、内容を理解しました。                                                                                                                                                                 |
| Health explanation  | EMBR stores and uses the health information you enter, such as symptoms, cycle details, daily context and treatments, to build your record, show your patterns and create your EMBR BRIEF.                                                                                                         | EMBRでは、あなたが入力した症状、周期、日々の状況、治療などの健康情報を、記録の作成、パターンの表示、EMBR BRIEFの作成のために保存・利用します。                                                                   |
| Health checkbox     | I acknowledge that EMBR handles the health information I provide, such as symptoms, cycle details and treatments, for the purposes described in the Privacy Policy, including building my record, showing my patterns and creating my EMBR BRIEF, and, where required, I consent to that handling. | EMBRが、私が提供する症状、周期、治療などの健康情報を、記録の作成、パターンの表示、EMBR BRIEFの作成など、プライバシーポリシーに記載された目的のために取り扱うことを確認し、必要な場合はその取り扱いに同意します。 |
| Managing choices    | You can manage your privacy choices in your account settings. Where the handling of your information is based on consent, you can withdraw that consent at any time.                                                                                                                               | プライバシーに関する設定は、アカウント設定から管理できます。同意に基づく情報の取り扱いについては、いつでも同意を撤回できます。                                                                                   |
| Item not yet ticked | Please review this item to continue.                                                                                                                                                                                                                                                               | 続けるには、この項目を確認してください。                                                                                                                                                                         |

**Do not finalize the health checkbox wording until counsel confirms
whether the final text should use 「同意」 (consent) or an
acknowledgement formulation.** This is where translation and legal
characterization meet. The "item not yet ticked" message is deliberately
"review", not "required", for the same reason.

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
- The Japanese Privacy Policy should list the health information EMBR
  collects explicitly, for example: 症状、症状の重症度、月経・周期に関する
  情報、睡眠、ストレス、治療・服薬等に関する情報、メモその他ユーザーが入力す
  る健康関連情報. The English and Japanese documents must carry the same
  legal meaning.
