# Development

Initial environment: Windows, Node 22.21.0, npm 10.9.4, Git 2.51.1, VS Code 1.145.1, Intel i5-1340P / Iris Xe. Ollama was subsequently installed/started by the user; qwen2.5-coder:3b was installed with user authorization.

## Checks

- npm run check: TypeScript, lint, unit/protocol tests and build.
- npm run smoke:agent: real installed Qwen read-tool task against a temporary fixture.
- npm run test:host: isolated Extension Host integration. Auto-detects standard Windows Code.exe and conventional macOS Code/Electron locations, or set VSCODE_EXECUTABLE. Builds current code and tests real editor create/edit/revert with a fixture-only approval callback; this does not test clicking UI approval cards. Uses an isolated profile/workspace, leaving normal profile trust unchanged. Failure logs/status are retained under the printed temporary folder.
- npm run package: versioned VSIX, SHA-256 and inventory report in artifacts; checks required assets and development-file exclusions.
- GitHub Actions: Windows/Linux/macOS Node 22 checks, production dependency audit and packaging are configured in the repository workflow. Remote execution has not been verified; no model download or inference job runs in CI. Action usage follows the official checkout/setup-node/upload-artifact repositories.

## Manual checklist

Open the root or extension folder, select Run DevPilot AI and press F5. Open the intended local project in the host. Check narrow widths, light/dark themes, keyboard focus, draft persistence, new conversation, model refresh and settings.

Chat: Hindi/English streaming, code copy, Stop and regenerate. Plan: inspect package.json, verify file references and confirm that no changes/processes occur. Execute Plan: inspect each full diff and approve/reject in the sidebar card. Rejection must stop the agent. Edit a file while its approval is pending: applying must fail as stale. Unsaved editor changes must be rejected. Revert must preview the inverse diff and require approval.

Agent: use a throwaway project, approve a create/edit and then a relevant test command; inspect test exit/output and host execution record. Cancel during generation/approval/process execution; earlier changes remain. Verify ignored/secret/link files cannot be read. Inspect Git status/diff filtering. Test optional embeddings only with a separately installed compatible model.

Native host integration passed on Apple Silicon macOS for 0.4.0. This uses a test approval callback, not clicks on UI cards. See VALIDATION.md for evidence and remaining limits.

## Task/process acceptance (0.6.0)

`npm run smoke:coding -- qwen2.5-coder:3b --multi` selects the optional harder two-file repair fixture on both macOS and Windows. It checks failing baseline, unchanged test/manifest files, passing tests after model edits, independent rerun and grouped byte-exact undo. This acceptance currently fails with the tested small local model; see VALIDATION.md. `npm run test:host` independently exercises multi-file WorkspaceEdit undo and ephemeral HTTP server readiness/stop without inference. Every fixture is disposable; no production project is targeted.
