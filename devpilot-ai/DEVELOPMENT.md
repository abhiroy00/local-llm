# Development

## Environment inspected

- Node.js 22.21.0; npm 10.9.4; Git 2.51.1.windows.1.
- VS Code 1.145.1 x64 available through `code`.
- CPU: 13th Gen Intel Core i5-1340P; GPU: Intel Iris Xe Graphics.
- Ollama CLI absent from PATH; `http://localhost:11434/api/tags` did not respond during inspection.
- Workspace initially empty at implementation time. No existing implementation or dependencies were replaced.

## Commands

`npm run build` bundles host, React and CSS. `npm run typecheck` checks both TypeScript projects. `npm run lint` runs ESLint. `npm test` tests the host message boundary. `npm run check` runs all four.

## Manual Extension Host verification

Open this project and press F5. Check Activity Bar icon, sidebar rendering at narrow widths, keyboard focus, both light/dark themes, and restricted workspace indicator. Type a draft, hide/reopen the view, and confirm it survives. New Conversation must clear it. Open Settings must filter to DevPilot AI. Confirm all three Command Palette commands work. Use Developer: Toggle Developer Tools to inspect CSP or runtime errors.

Automated tests do not substitute for an Extension Host smoke test. See VALIDATION.md for the actual verification status.
