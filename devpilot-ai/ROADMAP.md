# Implementation plan

1. **Foundation (this delivery):** environment inspection, extension manifest, Activity Bar, React/Tailwind sidebar, settings, draft state, message validation, build and tests. Complete only after manually verifying the Extension Host.
2. **Ollama integration:** health checks, model discovery/information, compatible-model selection, streaming chat, abort/timeout/retry, history, Markdown/code rendering and connection errors. Validate against installed local models without automatic downloads.
3. **Workspace intelligence:** bounded file exploration and search, gitignore/secret exclusions, dependency/config inspection, symbols, relevant context retrieval and indexing. Verify symlink and traversal boundaries before exposing tools.
4. **Coding tools:** schema-validated registry, file creation/edit/delete, unified and side-by-side diffs, per-change approval, stale-content detection, atomic writes and revert support.
5. **Agent engine:** distinct Plan/Agent modes, structured tool calls with compatibility fallback, bounded loop, context/token budgets, cancellation, audit events and recovery.
6. **Advanced capabilities:** approved terminal/test execution with timeout and process cancellation, Git status/diff/branch inspection, debugging workflow, then measured local semantic search with SQLite and syntax-aware indexing where justified.
7. **Production readiness:** integration/security/performance tests, real model and hardware validation, Extension Host automation, packaging and VSIX verification. No parity claim with other coding agents until independently validated.

Missing dependencies beyond Phase 1 are intentionally deferred. Ollama must be installed by the user; ripgrep availability, parser support, SQLite driver and embedding model choices will be evaluated during workspace intelligence work. No ChromaDB or additional agent framework is justified yet.
