# Security

No telemetry or automatic model downloads. Chat sends messages to local Ollama; Plan/Agent can send allowed source excerpts and approved command output. Only localhost/127.0.0.1/::1 HTTP(S) origins are accepted without credentials, paths, query strings or redirects. Ollama's own routing/storage is managed separately.

Tools require a trusted local folder. Plan cannot mutate or spawn. Decisions/arguments are schema-validated. Unknown tools, traversal, Windows device names/alternate streams, secret filename patterns, ignored files and symbolic/hard links are rejected. Filename exclusions do not guarantee arbitrary source or command output is free of credentials.

Each file change opens a native diff and requires a matching sidebar approval card. Approval IDs and cancellation prevent stale decisions. Dirty/hash/version checks reject stale edits. Stop does not undo earlier edits. Revert requires approval and retains the last 20 workspace-scoped records across restarts. A save failure may leave an unsaved editor change. Approval is for a complete one-file proposal; partial-hunk selection is not implemented. Keep Git backups.

Commands are allowlisted, previewed and approved separately. Approved scripts/tests execute project code and can modify files or use networks: this is not an OS sandbox. npm scripts/hooks are previewed. Git commit/push/reset and destructive commands are unavailable. Git output is filtered to allowed files.

CSP uses a random nonce. Raw model HTML is not executed; links/images are inert. The local audit log stores bounded tool/approval events and summaries (not file contents or search queries); it can be viewed or cleared from the Command Palette. Conversation history (up to 100 sessions per workspace), semantic vectors, undo contents and audit events persist as unencrypted local JSON in VS Code extension storage; deleting a conversation does not remove undo records, vectors or audit events. Drafts persist in VS Code state. Heuristic secret redaction is not exhaustive; do not store secrets in prompts or approved files.

Known limit: checks cannot guarantee race-free access against another malicious local process swapping directory entries. Concurrent edits, root switching and process termination need wider platform testing. This preview is not a hardened sandbox for adversarial repositories or a deployment tool.
