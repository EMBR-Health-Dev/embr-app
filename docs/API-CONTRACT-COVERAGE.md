# API Contract Coverage

_Last reviewed: 30 October 2026._

## Purpose

This document tracks the relationship between the Express routes mounted by
`apps/api/src/app.ts` and the API contract documented in `docs/openapi.yaml`.

OpenAPI documents request and response contracts. It does **not** currently
generate the web or mobile clients. Those clients are maintained independently
in their respective `lib/api.ts` implementations.

This document is an engineering coverage inventory, not a substitute for the
OpenAPI schemas or endpoint-level tests.

## Current status

**OpenAPI has been restored on `main` (PR #304).** The file is approximately
53 KB with **48** distinct path entries. A CI floor check prevents another
silent truncation.

That baseline is still **not** a complete representation of the current API
(~96 method/route combinations). Remaining gaps are listed below and are the
subject of a later documentation pass (PR C). The CI path floor is a regression
guard, not a completeness claim.

## Coverage inventory

The API currently declares approximately **96** HTTP method and route
combinations across the mounted routers. Multiple methods may share a path.

The following table compares the current route implementation with the restored
OpenAPI baseline on `main`.

| Module            | Implemented route coverage                                                                                       | Restored OpenAPI coverage                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Health            | Liveness and readiness                                                                                           | Present                                               |
| Authentication    | CSRF, registration, verification, login, magic links, refresh, logout, password management, profile and sessions | Path coverage present; verify every method            |
| Symptoms          | Logs, date-based check-ins and individual log operations                                                         | Partial; date-based check-in paths missing            |
| Treatments        | CRUD and treatment impact                                                                                        | Missing                                               |
| Cycle             | Cycle-entry CRUD                                                                                                 | Partial; detail path and methods require verification |
| Context           | Daily context logs                                                                                               | Missing                                               |
| Notes             | Create, list, read, update and delete                                                                            | Missing                                               |
| MRS               | List, save and delete monthly check-ins                                                                          | Missing                                               |
| BRIEF             | Generate, list, trends, read, PDF and delete                                                                     | Partial; trends path missing                          |
| Onboarding        | Read and update onboarding state                                                                                 | Missing                                               |
| Consent           | Read, grant and withdraw consent                                                                                 | Missing                                               |
| Reflections       | Read reflections and create dismissals                                                                           | Present                                               |
| Organizations     | Organization lifecycle, membership, invitations, leave and aggregate trends                                      | Partial; leave and activation trends missing          |
| SSO               | Organization SSO configuration and authentication callbacks                                                      | Path coverage present; verify every method            |
| Billing           | Billing status, checkout and portal sessions                                                                     | Missing                                               |
| Billing webhook   | Stripe webhook                                                                                                   | Missing                                               |
| Public assessment | Unauthenticated perimenopause assessment                                                                         | Missing                                               |
| Notifications     | Read and update notification preferences                                                                         | Partial; method-level verification still needed       |
| Admin             | Users, audit logs and metrics                                                                                    | Partial; metrics missing                              |
| Trends            | Symptom frequency, history, cycle length, co-occurrence, context co-occurrence and evidence strength             | Partial; only symptom frequency and cycle length      |
| Export            | Symptom, cycle, context, notes and treatment CSVs, summary PDF and complete JSON export                          | Partial; notes, treatments and all-data JSON missing  |

## Routes requiring documentation

The following route families are absent from the restored OpenAPI path inventory
or need additional method-level verification.

### Symptoms and patient record

- `/symptom-logs/check-ins/{date}`
- `/treatments`
- `/treatments/{id}`
- `/treatments/{id}/impact`
- `/context-logs`
- `/notes`
- `/notes/{id}`
- `/mrs-check-ins`
- `/mrs-check-ins/{date}`

### BRIEF and onboarding

- `/briefs/trends`
- `/onboarding`

### Consent and notifications

- `/consents`
- `/consents/withdraw`
- `PATCH /notifications/preferences` (confirm against restored file)

### Organization and billing

- `/organizations/{organizationId}/leave`
- `/organizations/{organizationId}/trends/activation`
- `/organizations/{organizationId}/billing`
- `/organizations/{organizationId}/billing/checkout-session`
- `/organizations/{organizationId}/billing/portal-session`
- `/billing/webhook`

### Trends and administration

- `/trends/symptom-history`
- `/trends/co-occurrence`
- `/trends/context-co-occurrence`
- `/trends/evidence-strength`
- `GET /admin/metrics`

### Export

- `/export/notes.csv`
- `/export/treatments.csv`
- `/export/all-data.json`

### Public assessment

- `POST /public/perimenopause-assessment`

This list is a path-level coverage checklist. It does not imply that every method
on a path already present in OpenAPI is correctly documented.

## Contract validation requirements

The OpenAPI contract should satisfy the following checks before it is treated as
complete relative to the running API.

1. YAML parses successfully.
2. The document declares OpenAPI 3.1.
3. All `$ref` references resolve.
4. Every mounted route method and path is represented.
5. Request body schemas match the Zod validation schemas used by the route.
6. Query and path parameters match the validation schemas.
7. Success response schemas match the DTOs returned by the service.
8. Error responses match the API error envelope.
9. Authentication, CSRF, consent and role requirements are documented.
10. Feature-flagged endpoints and optional integrations are explicitly identified.

## CI protection

### Implemented (floor check on main)

Script: `apps/api/scripts/check-openapi-contract.mjs`  
Job: **OpenAPI Contract** in `.github/workflows/ci.yml`

| Check | Purpose |
| ----- | ------- |
| YAML parse | Catch malformed specifications |
| OpenAPI version | Require 3.1.x (`/^3\.1\.\d+$/`) |
| Minimum path count | Prevent another silent truncation (floor, not target) |
| File size floor | Secondary truncation signal (`Buffer.byteLength`) |
| Local `$ref` resolution | Catch broken schema references |

Raise the path floor deliberately when the documented surface grows. Do not lower
it to silence a truncation.

### Deferred (PR C and later)

- Critical-path assertions once those operations are documented
- Method/path parity against an explicit Express route inventory
- Request/response schema verification against Zod and DTOs
- Documented auth, CSRF, consent and role requirements per operation

## Ownership and update policy

The API implementation is the source of truth for runtime behavior. OpenAPI is
the documented contract.

When a route changes:

1. Update its Zod validation and DTO definitions as required.
2. Update the corresponding OpenAPI operation and schemas.
3. Update the web and mobile API clients where applicable.
4. Add or update route-level tests.
5. Run the contract validation check.

New endpoints should not be considered complete until their implementation,
contract and tests agree.

## Related documentation

- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/ENCRYPTION.md`
- `docs/MRS-CHECK-IN.md`
- `docs/LAUNCH-READINESS.md`
