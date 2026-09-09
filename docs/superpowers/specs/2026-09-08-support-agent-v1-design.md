# Support Agent v1 Design

## Goal

Deliver a Vietnamese, module-aware Support Agent inside the existing PQG Application Shell. Version 1 helps the user work with the Task module through its registered Makers tools and requires the existing DSH approval flow before a write operation continues.

## Scope

The Agent appears in the existing `Hỗ trợ` surface. It accepts free-form text and executable module suggestions, shows an in-progress state, lets the user stop an in-progress request, and renders the current DSH conversation rather than persisting a second chat history.

Task is the only business capability in v1. The existing `pqg_task_list`, `pqg_task_create`, and `pqg_task_update` tools remain the only way the Agent accesses Task data. Read access is read-only; create and update continue to use the existing permission and Approval carrier.

## Architecture

`application-shell` owns presentation, active-module context assembly, prompt submission, conversation rendering, error presentation, and lifecycle controls. Business modules remain independent: a module supplies declarative support context and suggestions, and its Makers adapter supplies the tools the runtime can invoke. The Shell does not import a module's data service or adapter.

The Shell reuses the active DSH session and its standard prompt/stream/cancellation APIs. It does not add an AI proxy endpoint, a custom persistence store, an MCP transport, a new agent runtime, or a dedicated database. If the pinned DSH client API cannot submit/cancel/render a session from the Shell, implementation pauses for a separate adapter decision rather than inventing an unsupported transport.

## Interface Changes

`ShellSupportSuggestion` gains an optional executable callback contract owned by the Shell, so a visible suggestion can place its prompt into the Agent flow. The support context contract adds optional system instruction text for module-scoped guidance; it cannot provide a direct data accessor or arbitrary tool callback.

`ShellSystemServices` exposes a small Agent-facing session adapter: obtain the current session state, submit a prompt with active-module context, and request cancellation. The adapter is a thin wrapper over `ISessions`; it must not duplicate DSH session state.

## Agent Behavior

The system instruction identifies the assistant as the Vietnamese PQG work assistant. It uses the active module context only when relevant, does not claim an action succeeded unless a tool result confirms it, and asks a brief follow-up when a Task create/update request lacks an essential value. It treats user data as private and does not present Makers, MCP, runtime, or plugin terminology in primary UI.

For Task context, suggestions are: summarize today's tasks, create a task, and complete a task. Clicking a suggestion submits its associated prompt. The user can also type any request. The Shell displays generated assistant content and tool-progress status supplied by the DSH session; raw internal tool payloads are not primary content.

## Approval, Errors, and Stop

No new approval mechanism is introduced. When a DSH pending approval exists, the existing Approval view remains the sole decision surface and its allow-once/reject response is reused unchanged. The Agent panel directs the user to the approval surface rather than duplicating decision buttons.

The Send control is disabled when no usable session is selected or the prompt is blank. A Stop control is visible only while the current prompt is running and delegates to DSH cancellation. Session, submit, stream, or cancellation errors are surfaced as concise Vietnamese error states and notification events; the panel remains usable for a later request.

## UX and Accessibility

The desktop right panel retains its existing compact/expanded states. Tablet and mobile retain the existing Drawer behavior. Expanded mode contains context, suggestions, scrollable conversation content, composer, and stop/send controls. Focus remains in the existing panel/Drawer semantics; interactive suggestions and controls use native Mantine buttons with clear labels.

## Non-goals

No Calendar, Writing, Document, Data, global knowledge base/RAG, uploads, web browsing, memory profile, multi-agent orchestration, scheduled automation, custom tool schema, or new data store belongs to v1. The Agent does not bypass DSH permissions or transform the Task module into a Shell-owned data model.

## Acceptance Criteria

1. On Production at the verified post-#102 SHA, Task navigation and its Home card load after a fresh reload on desktop and iPad.
2. The user can open Hỗ trợ, submit Vietnamese text, and see the active DSH conversation update.
3. The Task module supplies context and three clickable suggestions without the Shell importing Task storage code.
4. The Agent can list, create, and update Tasks solely through the three existing registered tools.
5. A write request exposes the existing Approval flow; denying it leaves Task data unchanged.
6. Stop delegates to the DSH cancellation path; a submit or stream failure leaves the panel responsive.
7. Focused contract tests, relevant module tests, typecheck, and exact Makers build pass. Production smoke covers desktop and iPad.
