# Security

Phase 1 makes no inference requests, downloads no models, runs no terminal commands and modifies no workspace files. There is no telemetry. Task drafts are retained locally in VS Code webview state; avoid entering secrets.

Webview scripts require a random nonce. Remote resources and connections are blocked by CSP. Only bundled dist resources are accessible. Incoming message types are allowlisted; React renders draft text without HTML injection. Workspace trust is shown and updated when granted, but no privileged tools exist in this phase.

Future tools must require workspace trust, validate input/output, enforce realpath and symlink boundaries, exclude secrets, enforce limits and request explicit approval before edits or commands. Locally hosted model outputs remain untrusted. These future protections are requirements, not claims of implemented tool security.
