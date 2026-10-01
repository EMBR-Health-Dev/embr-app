# Security Policy

EMBR handles self-reported health information. We take security reports seriously and want to hear about problems early.

## Reporting a vulnerability

Please report privately. Do not open a public issue or pull request for a suspected vulnerability.

- Preferred: use GitHub's private vulnerability reporting for this repository (Security tab, "Report a vulnerability").
- Alternative: email info@embrhealthcare.com with the subject line "Security report".

Include what you found, the steps to reproduce it, and the impact you believe it has. Please do not include real personal or health data in a report, and do not access, modify, or retain data that is not your own while testing.

## What to expect

- We aim to acknowledge a report within 3 business days.
- We will keep you informed as we investigate and fix the issue, and we will tell you when it is resolved.
- We ask for a reasonable period to fix an issue before any public disclosure.

## Scope

In scope: the EMBR API, web app, admin console, and mobile app in this repository, and the production services that run them.

Out of scope: social engineering of EMBR staff or users, physical attacks, denial of service through volume, and vulnerabilities in third-party services that EMBR uses (report those to the vendor).

## Supported versions

Only the current `main` branch and the version running in production are supported.
