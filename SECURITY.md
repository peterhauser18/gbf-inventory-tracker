# Security Policy

GBF Tracker is intentionally read-only and may process data observed from a user's own Granblue Fantasy session. Treat authentication and session material as secrets.

## Do not post secrets or raw account captures

Do not include any of the following in a public GitHub issue, pull request, discussion, log, fixture, screenshot, or attachment:

- GBF session cookies or cookie headers;
- `Authorization` headers, tokens, credentials, or session identifiers;
- browser profiles or exported browser storage containing authentication data;
- raw HAR files, unredacted request/response dumps, or debugger/network captures;
- `.env` files or other local secret/configuration files;
- unredacted account exports or dumps that contain identifiers or private account data.

If a bug report needs network or account evidence, provide only the smallest sanitized excerpt needed to reproduce the problem. Prefer GBF Tracker's sanitized export paths where available and remove unrelated account identifiers before sharing.

## Reporting a security issue

Do not publish exploit details, credentials, session material, or sensitive account data in a public issue.

If GitHub's private vulnerability reporting option is available for this repository, use it from the repository's **Security** tab. Otherwise, open a minimal public issue that contains no sensitive details and only states that you need a private channel for a security report.

If you believe a secret was exposed, revoke or rotate it before doing anything else. Removing it from the latest commit is not sufficient because Git history and external clones may retain it.

## Product security boundary

Contributions must preserve the read-only product boundary. Do not add automated gameplay, request replay, account-changing actions, or unknown/unverified GBF endpoint calls against real accounts. New write-capable behavior requires an explicitly approved product goal and separate security review.
