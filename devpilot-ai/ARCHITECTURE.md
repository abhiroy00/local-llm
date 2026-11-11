# Architecture

`src/extension.ts` registers the view and three functional commands. `ChatViewProvider` owns webview lifecycle, message validation, workspace trust reporting and static asset access. `src/types` defines the explicit host message boundary.

`webview-ui/src` contains React UI and Tailwind CSS with VS Code theme variables. The UI persists only a task draft through VS Code webview state. No secrets or source files are collected. esbuild bundles the host with `vscode` external and builds a self-contained webview; PostCSS compiles Tailwind.

The host currently performs no network calls or workspace mutations. Future service, tool, security, context and indexing modules will be added when implemented rather than populated with empty service stubs. SQLite, Tree-sitter and embedding dependencies are deferred until the associated phase has measured requirements. No model runtime or background service is started.
