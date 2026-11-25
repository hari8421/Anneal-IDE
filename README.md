# Anneal

![CI](https://github.com/hari8421/genieIDE/actions/workflows/ci.yml/badge.svg)

A local-first, spec-driven agentic IDE. Model calls go to **your own LM Studio server** by
default; hosted providers such as OpenCode are available only when you explicitly select them.
No telemetry either way.

```
requirements.md  →  design.md  →  tasks.md  →  agent executes task-by-task
```

## Why it exists

The value is not the text editor; it is the workflow around the model: a spec that forces
requirements before code, hooks that automate the boring parts, steering files that keep the
model aligned with your conventions, checkpoints you can roll back, and an agent loop that
does not fall over when one run goes wrong. `anneal` implements that workflow against a local
OpenAI-compatible endpoint.

## Feature map

| Capability | Status | Where |
| --- | --- | --- |
| Spec generation (requirements → design → tasks) | ✅ | `server/spec/generator.ts` |
| Task-by-task execution with checkbox tracking | ✅ | `server/service.ts`, `server/spec/spec.ts` |
| LM Studio models (list, switch, context length) | ✅ | `server/llm/client.ts` |
| OpenCode inference provider (manual opt-in, free model catalog) | ✅ | `server/providers/opencode.ts`, `server/config.ts` |
| External OpenAI-compatible APIs (optional) | ✅ | `server/config.ts`, `server/llm/client.ts` |
| Skills: reusable `SKILL.md` workflow packs | ✅ | `server/skills/skills.ts`, `src/components/SkillsTab.tsx` |
| Streaming chat + streaming agent events (SSE) | ✅ | `server/llm/client.ts`, `server/index.ts` |
| One-pass codebase explanations (no tool loop) | ✅ | `server/context/explain.ts`, `server/service.ts` |
| Attach workspace files in Ask / Agent / Spec | ✅ | `src/components/AttachmentPicker.tsx`, `src/App.tsx` |
| Tool use: read, write, patch, list, search, run | ✅ | `server/tools/index.ts` |
| Resumable runs after a crash or cancel | ✅ | `server/agent/journal.ts`, `server/agent/loop.ts` |
| Self-healing with an on/off control and “Self heal” resume | ✅ | `server/agent/loop.ts`, `server/llm/retry.ts` |
| Checkpoints + diff + restore before every write | ✅ | `server/agent/checkpoints.ts` |
| Agent hooks (file/task/stop events → agent or shell) | ✅ | `server/hooks/hooks.ts` |
| Steering files (`always` / `auto` / `manual`) | ✅ | `server/steering/steering.ts` |
| MCP client (stdio, tools/list, tools/call) | ✅ | `server/mcp/client.ts` |
| Context budgeting, history compaction, retrieval | ✅ | `server/context/*` |
| Agent memory: pinned facts + run journal | ✅ | `server/memory/*` |
| Desktop executables (Linux, macOS, Windows) | ✅ | `scripts/build-desktop.mjs` |
| Debugger: breakpoints, stepping, locals, evaluate | ✅ | `server/debug/session.ts`, `src/components/DebugPanel.tsx` |
| Peek definition/usages, hover, outline, diagnostics | ✅ | `src/editor/intel.ts` (Monaco TS service) |
| Autopilot vs supervised tool approval | ✅ | `server/agent/loop.ts` |
| Quick open (Ctrl/Cmd+P), per-file editor state, unsaved-close guard | ✅ | `src/components/QuickOpen.tsx`, `src/App.tsx` |
| Local Monaco editor with bundled workers (works offline) | ✅ | `src/monaco-setup.ts` |
| LSP, debugger, extension marketplace, inline ghost text | ❌ | out of scope (needs Code OSS fork) |

Full parity notes and known gaps: [docs/DESIGN.md](docs/DESIGN.md). Build status:
[PROGRESS.md](PROGRESS.md).

## Requirements

- Node.js 20 or newer (tested on 24)
- [LM Studio](https://lmstudio.ai) with a tool-calling capable model (e.g. Qwen2.5-Coder,
  Llama 3.1/3.3 Instruct, Devstral)

## Quick start

```bash
npm install

# 1. In LM Studio: load a model, then start the local server (default port 1234).

# 2. Point Anneal at it (defaults already match LM Studio).
cp .anneal.example/config.json .anneal/config.json        # optional, edit model id
mkdir -p .anneal/hooks .anneal/steering
cp -r .anneal.example/hooks/* .anneal/hooks/              # optional
cp -r .anneal.example/steering/* .anneal/steering/        # optional

# 3. Run it
npm run dev        # API on :8787, UI on :5173
```

Open <http://127.0.0.1:5173>. The status bar shows whether LM Studio is reachable; the model
dropdown is populated from `GET /v1/models`.

Production mode (single process serving the built UI):

```bash
npm run build
npm start          # http://127.0.0.1:8787
```

### Standalone macOS app

`npm run build` only produces the web assets in `dist/`; it is not the desktop build. To build the
real standalone app:

```bash
npm run build-app
open "app-out/Anneal IDE.app"
```

`app-out/Anneal IDE.app` is a native macOS app: it embeds the local server and UI, opens its own
window, and does **not** depend on Chrome or a browser. On first launch it shows a native folder
picker; the chosen folder is remembered in `~/.anneal/workspace.json`. It can also be launched with
an explicit folder:

```bash
open "app-out/Anneal IDE.app" --args --workspace /path/to/project
```

The app uses a free loopback port automatically, so multiple copies/projects can run side by side.
Server output is written to `~/Library/Logs/Anneal IDE/server.log`. You can change the workspace at
any time from **Settings → Workspace** in the IDE.

### Headless / CLI binaries

If you want the server without a native window, `npm run build-desktop` produces standalone
executables that bundle the server *and* the UI:

```bash
npm run build-desktop     # typecheck + vite build + three binaries in pkg-out/anneal/
./pkg-out/anneal/anneal-ide-linux-x64
```

One `pkg` run produces `anneal-ide-linux-x64`, `anneal-ide-macos-arm64` and
`anneal-ide-win-x64.exe`. Those binaries serve the app on <http://127.0.0.1:8787> and open your
default browser at it; set `ANNEAL_NO_OPEN=1` to keep them headless for servers and CI.

For the CLI binaries the workspace can be specified with a positional path, `--workspace`, or
`ANNEAL_WORKSPACE`:

```bash
./pkg-out/anneal/anneal-ide-macos-arm64 /path/to/project
./pkg-out/anneal/anneal-ide-macos-arm64 --workspace /path/to/project
ANNEAL_WORKSPACE=/path/to/project ./pkg-out/anneal/anneal-ide-macos-arm64
```

They never silently fall back to the launch directory; on a fresh double-click macOS shows a native
folder picker. `ANNEAL_DESKTOP_TARGETS=node24-linux-x64` narrows the build,
`ANNEAL_DESKTOP_SKIP_PKG=1` stops after staging the bundle, and `ANNEAL_PORT` behaves as it does in
dev. `ANNEAL_APP_SKIP_PKG=1` skips the pkg stage when rebuilding only the native app wrapper.

Each target needs a Node base binary that `@yao-pkg/pkg` can still download; if one is missing from
its cache, pkg quietly falls back to *compiling Node from source* (tens of minutes). Check the
`pkg-fetch` release assets if a build seems to hang there.

#### `spawn Unknown system error -86` while packaging

On macOS this is `EBADARCH`: a binary built for the other CPU tried to run. `pkg` compiles V8
bytecode by *spawning* the target-architecture Node binary, so one run that cross-builds several
arches — the default target list does — hits it as soon as a target differs from the host (for
example linux-x64 or win-x64 from an arm64 Mac, or macOS-arm64 from an Intel one).

The packer passes `--no-bytecode`, which turns the step into pure file copying and removes the spawn
entirely, so all three binaries build from any host. Keep it in place rather than re-enabling
bytecode for speed: the binaries are slightly larger, and in exchange cross-arch builds stop crashing.
If pkg is still wedged, clear a half-written base binary with `rm -rf ~/.pkg-cache` and rerun.

### Using a different host/port for LM Studio

`.anneal/config.json`:

```json
{ "lmStudioBaseUrl": "http://192.168.1.20:1234/v1", "model": "qwen2.5-coder-14b-instruct" }
```

or environment variables: `LMSTUDIO_BASE_URL`, `ANNEAL_MODEL`, `ANNEAL_CONTEXT_BUDGET`,
`ANNEAL_AUTONOMY=supervised`, `ANNEAL_MAX_STEPS`, `ANNEAL_MAX_ATTEMPTS`, `ANNEAL_ALLOW_COMMANDS`.

### Using an external model API (optional)

Local models stay the default, but any OpenAI-compatible API can be used instead — handy when one
task needs more reasoning than your machine can serve. Set it in the **Models** tab, or in
`.anneal/config.json`:

```json
{
  "provider": "external",
  "externalBaseUrl": "https://api.openai.com/v1",
  "externalModel": "gpt-4o-mini",
  "externalApiKey": "sk-…"
}
```

Environment equivalents: `ANNEAL_PROVIDER=external`, `ANNEAL_EXTERNAL_BASE_URL`,
`ANNEAL_EXTERNAL_MODEL`, `ANNEAL_EXTERNAL_API_KEY`. The client only speaks `/chat/completions` with
SSE and tool calls, so OpenAI, Groq, OpenRouter, Together, DeepSeek and self-hosted gateways all
work — you need a base URL, a model name and a key, nothing vendor-specific. `.anneal/` is
git-ignored, and `ANNEAL_EXTERNAL_API_KEY` keeps the key out of any file entirely.

### Using OpenCode models (optional, manual selection)

OpenCode is **never used automatically**. Choose it in the first-run provider step or the Models
tab:

```json
{
  "provider": "opencode",
  "opencodeBaseUrl": "https://opencode.ai/inference/openai/v1",
  "opencodeModel": "mimo-v2.6-flash-free",
  "opencodeApiKey": ""
}
```

Environment equivalents: `ANNEAL_PROVIDER=opencode`, `ANNEAL_OPENCODE_BASE_URL`,
`ANNEAL_OPENCODE_MODEL`, `ANNEAL_OPENCODE_API_KEY`. The Models tab loads the public catalog from
`https://opencode.ai/inference/v1/models`, shows which entries are free, and falls back to a typed
model id if the catalog is unreachable. Free-tier chat models are restricted to the OpenCode app:
from another client you may get a 403/429. Supply an OpenCode Console/Go key or use a different
endpoint in that case — the error message says so explicitly. Setting the provider back to
`lmstudio` restores the local-only behaviour.

### Explaining a codebase quickly

Read-only questions such as “explain the codebase”, “how does the agent loop work?” or “give me a
codebase overview” no longer enter the tool loop. `server/context/explain.ts` gathers a small
workspace map, conventional entry points, files matching the question and any attachments in one
pass, then the model answers in a single streamed call. The result shows **1 step · 0 tools** and
cannot consume a 24–200 step budget or leave a resumable run behind.

Goals with an action attached (“explain the codebase and add tests”, “fix the parser”) still use the
full Agent loop. Ask mode is also codebase-aware: without attachments it sends the same compact
context, so questions get grounded answers in one call instead of a list of files to open by hand.
Memory, steering and skills remain pinned in both paths.

### Creating skills

The **Skills** panel creates reusable instruction packs in `.anneal/skills/<id>/SKILL.md`, in the
same format OpenCode uses:

```markdown
---
name: Release check
description: Prepare a release
auto: true
---

# Workflow
1. Summarise merged changes.
2. Propose a version bump.
3. Run the release script.
```

Skills with `auto: true` are injected into every agent prompt and spec-generation request;
`auto: false` keeps a pack available in the workspace without loading it. CRUD is available through
`GET/POST/DELETE /api/skills`.

## Debugging and navigation

The editor is wired to real analysis, not name matching:

| Action | Shortcut | Source |
| --- | --- | --- |
| Go to definition | F12 | Monaco TypeScript service |
| Peek definition | Alt+F12 | same result, in the peek widget |
| Find usages (peek) | Shift+F12 | same |
| Go to implementation | Ctrl/Cmd+F12 | same |
| Quick info / hover | hover | same |
| File outline | Ctrl/Cmd+Shift+O | same |
| Problems | inline squiggles | same |

`GET /api/intel/sources` hands the workspace's JS/TS files to Monaco's bundled TypeScript
service, so symbols resolve across files. The bundle is capped (600 files, 3 MB total, 400 KB per
file) and reports `truncated` when it stops early.

The **Debug** tab runs a real Node debugger over the inspector protocol:

- click the gutter (or press F9) to toggle a breakpoint; breakpoints survive reloads
- Debug/Stop, continue, pause, step over / into / out
- call stack with clickable frames, per-scope locals, console + stdout/stderr
- evaluate any expression in the paused frame

Scripts start under `node --inspect-brk`: `.js` works out of the box, `.ts` uses Node 23.6+ type
stripping (or `--experimental-strip-types` on 22.x). The debugger is Node-only — there is no DAP
adapter layer for Python, Go or browser targets, and source maps are not applied.

## Using the app

The screenshots below are captured from the running app with this repository as the workspace. The
demo run used a small local OpenAI-compatible stub endpoint (no cloud calls, no API key), so the
model's wording is canned; everything else — tools, journal, checkpoints, transcript — is real.

### 1. Open a workspace and a file

![The Anneal workspace: file tree, Monaco editor, agent panel and status bar](docs/images/01-workspace.png)

The status bar tells you whether the model endpoint answers, which workspace is open, and how much
of the context budget the last prompt used. Tick the checkbox beside a file to pin it to the agent's
context without opening it.

### 2. Jump to any file with Ctrl/Cmd+P

![Quick open filtering the workspace by file name](docs/images/02-quick-open.png)

Type a few characters of the path; `↑`/`↓` moves, `Enter` opens, `Esc` closes. Tabs keep their own
undo history, cursor and scroll position when you switch between them.

### 3. Ask the agent

![An agent run with tool calls and a completed result](docs/images/03-agent-run.png)

Describe a goal and press **Run agent** (or Ctrl/Cmd+Enter). Every step is shown as it happens:
the model's text, each tool call with its arguments and result, self-heal notices, and the final
result with step and tool-call counts. **Autopilot** edits immediately; **Supervised** asks before
each tool call. A write is always preceded by a checkpoint, so nothing is lost.

### 4. Specs: requirements → design → tasks

![The Specs tab with generated documents and a task checklist](docs/images/04-specs.png)

Create a spec, describe the feature, and hit **Generate spec**. You get `requirements.md`,
`design.md` and `tasks.md` in `.anneal/specs/<id>/` — plain markdown you can edit, which the agent
treats as high-priority context. **Run next task** implements the first unchecked task and checks
it off only when the run succeeds; **Run** on a row implements just that task.

### 5. Undo: diff and restore

![The Undo tab listing a checkpoint and the files it would change](docs/images/05-undo.png)

A snapshot is taken before every mutating tool call, and you can take one by hand with
**Snapshot now**. Open a checkpoint to see which files differ, then **Restore** to put the workspace
back — including deleting files that did not exist yet.

### 6. Models and memory

![The Models tab with the provider switch and pinned agent memory](docs/images/06-models.png)

Switch between LM Studio, OpenCode, and any external OpenAI-compatible API without editing files;
hosted providers are opt-in. Facts under *Agent memory* are pinned into every prompt (the agent also
writes its own with the `remember` tool), which is how conventions survive across runs and restarts.

### 7. Runs never lose finished work

![The Runs tab with journaled runs and a resume action](docs/images/07-runs.png)

Every run is journaled under `.anneal/runs/<id>/journal.jsonl`. **Resume** continues an interrupted
run from its last completed step instead of replaying the tools it already ran. A run that paused at
its step budget gets a fresh budget on every resume. **Self heal** resumes with a repair directive
that tells the model to fix the last failure instead of repeating it.

Click the paperclip in the chat composer, an explorer row, or the active editor tab to attach files.
Attachments are read from the workspace and sent with Ask, Agent and Spec requests; type `@` in the
composer to filter files by name.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+P | Quick open: jump to any file in the workspace |
| Ctrl/Cmd+S | Save the active file |
| Ctrl/Cmd+Enter | Run the agent on the current goal |
| F9 | Toggle a breakpoint on the current line |
| F12 / Alt+F12 / Shift+F12 | Go to / peek definition, find usages |
| Ctrl/Cmd+Shift+O | File outline |

## How the self-healing works

Self-healing is on by default. Turn it off under **Settings → Agent settings** or with the
**Self-heal** button in the chat composer (also available in the command palette). With it off,
transport retries, context shrinking, tool-call rescue and repeated tool repair are skipped; a
failed step stops immediately. `ANNEAL_SELF_HEAL=0` overrides the saved setting for that launch.
“Self heal” on a paused run enables the repairs for that resume even when the global switch is off.

| Failure | Behaviour |
| --- | --- |
| LM Studio 5xx / 429 / socket error | Exponential backoff + jitter, up to `maxAttempts`, then a circuit breaker fails fast |
| Tokens already streamed | Never retried, so output is not duplicated |
| Prompt exceeds the context window | Context is trimmed to 40%, the budget shrinks, the same step retries (max 3) |
| Tool returns an error | The error is fed back to the model with a repair budget (`maxToolRepairs`) |
| Tool arguments are not JSON | Rejected with a precise message instead of crashing the step |
| Model emits a tool call as fenced JSON | Rescued into a real tool call |
| Process crash / cancel | Step and tool results are fsync'd to `journal.jsonl`; resume skips finished work |
| Agent run fails | Status is `failed` with `resumable: true`, never a silent partial success |

## Repository layout

```
server/
  agent/        loop.ts (the agent), journal.ts (durability), checkpoints.ts, patch.ts, prompts.ts
  context/      builder.ts (budgeting), retrieval.ts (lexical search)
  llm/          client.ts (LM Studio or any OpenAI-compatible API), retry.ts, structured.ts
  providers/    opencode.ts (public model catalog)
  memory/       store.ts (facts.jsonl, core.md, events.jsonl)
  skills/       SKILL.md workflow packs
  intel/        sources.ts (workspace bundle for the language service)
  debug/        session.ts (Node inspector debugger over CDP)
  tools/        sandboxed file/shell tools
  spec/         spec store + three-stage generator
  hooks/        event → action engine
  steering/     project convention files
  mcp/          minimal stdio MCP client
  service.ts    orchestration
  http.ts       HTTP + SSE API (single router, shared by dev and desktop)
  index.ts      dev entrypoint; boots http.ts
scripts/        dev.mjs, build-desktop.mjs
src/            React + Monaco UI (src/editor/intel.ts wires the TS service)
tests/          vitest suite (144 tests)
docs/DESIGN.md  detailed design
docs/contributing/  setup, architecture notes and the pull-request guide
docs/images/    screenshots used by this README
.github/        pull request template
PROGRESS.md     what is done, what is not
```

## Tests

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run build     # typecheck + vite production build
```

The suite covers retry/backoff/circuit breaking, token budgeting invariants, history
compaction, patch atomicity, path-escape rejection (including symlinks), journal durability with
torn writes, checkpoint restore, hook dispatch isolation, spec task parsing, LM Studio SSE
streaming and tool-call assembly, agent resume without replaying tools, context-overflow
healing, MCP stdio round-trips, agent memory (fact dedup, core line cap, event pruning), provider
resolution, OpenCode catalog normalization, skill parsing/loading, the SSE transcript reducer
(wrapped agent events vs unwrapped results), and two live
HTTP integration tests against a temp workspace: one for the API surface,
and one that drives a stub OpenAI-compatible server and asserts against the actual request bodies
that completions reach the configured provider with its key and that stored facts reach the prompt.

## Contributing

Setup, architecture notes and the full pull-request flow live in
[docs/contributing](docs/contributing/README.md): start with
[development.md](docs/contributing/development.md) for the dev loop, then
[pull-requests.md](docs/contributing/pull-requests.md) for branching, commits, the review checklist
and what to do when a branch falls behind. The short version:

```bash
npm ci && npm run dev     # work
npm test && npm run typecheck && npm run build   # gates
```

No LM Studio is needed to run the tests or build; one concern per pull request, a regression test
with every fix, and no secrets or `.anneal/` state in the diff.

## Safety

- The API binds to `127.0.0.1` by default; it is meant to run on your machine.
- All file paths are resolved inside the workspace; `..`, absolute paths and escaping symlinks
  are rejected.
- Shell commands run only when `allowCommands` is true, with a timeout, and destructive
  patterns (`git push`, `git reset --hard`, `rm -rf /`, `sudo`, piping downloads into a shell)
  are blocked. The agent cannot push your code.
- Checkpoints are taken before writes, so an unwanted edit can be reverted from the UI.
