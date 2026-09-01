# Security Policy

## Supported Versions

EMBR is currently under active development and does not yet maintain
versioned public releases.

Security fixes are applied to the current production deployment and the
current `main` branch. Older commits, branches, and unreleased development
versions are not guaranteed to receive security updates.

| Version                    | Supported          |
| -------------------------- | ------------------ |
| Current production release | :white_check_mark: |
| `main`                     | :white_check_mark: |
| Older commits / branches   | :x:                |

## Reporting a Vulnerability

Please **do not report security vulnerabilities through public GitHub
issues, pull requests, or discussions**.

If you discover a potential security vulnerability in EMBR, please use
GitHub's **Private Vulnerability Reporting** feature to submit a confidential
report through the repository's Security tab.

When reporting a vulnerability, please include:

* A clear description of the vulnerability.
* The affected component, endpoint, or functionality.
* Steps required to reproduce the issue.
* The potential security or privacy impact.
* Any relevant logs, screenshots, proof of concept, or other supporting
  information.
* Your suggested mitigation, if known.

Please avoid including real user data, credentials, API keys, health
information, or other sensitive information in your report.

## What to Expect

We will acknowledge receipt of a vulnerability report as soon as reasonably
possible and will investigate the report based on its severity and potential
impact.

If the vulnerability is confirmed, we will work to remediate it and may
publish a security advisory when appropriate.

If the report is determined not to represent a security vulnerability, we
will provide an explanation where appropriate.

Please allow reasonable time for investigation and remediation before
publicly disclosing a vulnerability.

## Scope

Security reports concerning the following are particularly relevant:

* Authentication and authorization.
* Exposure of user or organization data.
* Clinical or health related data privacy.
* API security.
* Organization and administrator permissions.
* Payment and billing functionality.
* Encryption and secrets management.
* Database access and data retention.
* File uploads, exports, and generated documents.
* Cross site scripting, injection, or other application security issues.
* Infrastructure, deployment, and CI/CD security.

## Responsible Disclosure

Please act in good faith and avoid:

* Accessing, modifying, or deleting data belonging to other users.
* Disrupting production services.
* Performing denial of service attacks.
* Social engineering or phishing attacks against EMBR users or personnel.
* Publicly disclosing a vulnerability before there has been reasonable
  opportunity to investigate and remediate it.

Thank you for helping us keep EMBR and its users' data secure.
