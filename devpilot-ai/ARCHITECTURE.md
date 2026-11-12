# Architecture

ChatViewProvider owns session history, modes, cancellation and workspace-scoped tools. React displays streamed Markdown/code, selectors and a task timeline. OllamaService makes local-only host requests and parses bounded NDJSON.

AgentService uses JSON-schema constrained tool/final decisions with Zod validation. Recent results are bounded; the whole repository is never assembled into a prompt. Step limits, duplicate detection and deadlines constrain work. Host-generated execution records distinguish actual edits/test exits from model prose.

WorkspaceService enforces paths, device-name restrictions, nested ignores, text limits and link exclusions. Search/listing run in-process with strict limits. Symbols use VS Code language providers. Tasks target one root.

ToolSchemas describes 16 tools, schemas and policies. ToolRegistry validates and dispatches calls. Plan blocks mutations/processes independently of model output. FileEditor previews virtual diffs, checks hashes/document versions/dirty state, applies WorkspaceEdit, saves and keeps 20 session revert records. Patches are exact and single-file.

Terminal restricts commands, previews npm scripts/hooks and terminates process trees on timeout/cancellation. Git output is filtered; external diff/textconv/fsmonitor are disabled.

Optional SemanticIndex uses local embeddings, stale hashes and cosine ranking. A validated, atomic local JSON store in VS Code extension storage retains up to 100 conversations per workspace, bounded semantic vectors per workspace/model and the last 20 workspace-scoped undo records. Drafts still use VS Code state. Data is unencrypted and remains on the local machine. SQLite, Tree-sitter grammars and ripgrep acceleration remain deferred scale improvements. No syntax-aware whole-repository database is claimed.
