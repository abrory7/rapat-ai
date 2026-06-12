# Provider Test Prompt Presets Design

## Goal

Prevent users from submitting arbitrary provider-test prompts that can request
large or expensive responses. Provider tests must use a small, server-approved
set of short prompts and must apply a consistent output limit.

## Scope

This change affects only the provider response test in Settings. It does not
change prompts used by discussions, roles, orchestration, or setup validation.

## Prompt Presets

Create one server-safe preset catalog with stable IDs and user-facing labels:

| ID | Label | Provider prompt |
| --- | --- | --- |
| `ping` | Ping | `Ping. Reply with "pong" only.` |
| `hello` | Hello | `Hello. Reply with one short greeting.` |
| `connection-test` | Connection test | `Confirm the connection works in one short sentence.` |
| `model-check` | Model check | `State your model name only. If unavailable, reply "unknown".` |

The catalog is the only source of provider-test prompt text. The client may
display preset labels and IDs, but it must not submit arbitrary prompt text.

## Request Contract

The browser sends:

```json
{
  "providerId": "provider-id",
  "modelId": "model-id",
  "promptId": "ping"
}
```

The API no longer accepts `prompt` for this route. It validates `promptId`
against the preset catalog, resolves the associated prompt on the server, and
returns HTTP `400` for missing or unknown IDs. This ensures a direct request
cannot bypass the UI restriction.

## User Interface

Replace the free-form textarea and existing fill-template buttons with a compact
single-choice preset control. The first preset, `ping`, is selected by default.
Each option shows its short label and the exact prompt preview so users know
what will be sent.

The submit button remains disabled when no provider model is selected or while
a test is running. Provider and model selection, failure markers, result
rendering, and loading behavior remain unchanged.

The controls use native radio inputs or buttons with equivalent keyboard and
screen-reader semantics. Selected, hover, focus, disabled, and loading states
follow the existing settings design system.

## Provider Output Limits

Use a shared test output limit of 128 tokens. Apply the provider-specific
parameter in every outbound path:

- OpenAI Responses: `max_output_tokens`
- OpenAI Chat and compatible chat: `max_tokens`
- OpenAI completion fallback: `max_tokens`
- Anthropic Messages: `max_tokens`
- Google Generate Content: `generationConfig.maxOutputTokens`
- Ollama Chat: `options.num_predict`

The limit is deliberately small because these requests verify connectivity and
basic model behavior, not response quality. The API will also truncate returned
text to a bounded character length as a defensive measure when a compatible
provider ignores token limits.

## Structure

Add a focused provider-test policy module under `src/lib/providers/`. It owns:

- The immutable prompt preset catalog.
- The `promptId` type and lookup function.
- The output-token and returned-character limits.
- Defensive response truncation.

The API route consumes this policy. The client imports only safe preset metadata
or uses a client-safe companion export; the module must not contain credentials
or server-only dependencies.

## Error Handling

- Missing `providerId`, `modelId`, or `promptId`: HTTP `400`.
- Unknown `promptId`: HTTP `400` with a generic invalid-preset message.
- Unsupported provider type and provider lookup behavior remain unchanged.
- Provider errors remain diagnosed through the existing error path.

No rejected prompt text is logged or echoed because arbitrary prompt text is no
longer part of the request contract.

## Testing

Unit tests cover:

- Every known preset resolves to its exact short prompt.
- Unknown preset IDs are rejected.
- Returned text below the character limit is unchanged.
- Oversized returned text is truncated with a clear suffix.
- The output token limit remains the expected constant.

Route-level request construction tests or extracted request-builder tests cover
the correct provider-specific output-limit property for OpenAI Responses,
OpenAI Chat, completion fallback, Anthropic, Google, and Ollama.

UI verification covers:

- No free-form prompt input is rendered.
- A preset is selected by default.
- Submitting sends `promptId` and does not send `prompt`.
- Presets remain keyboard accessible.

## Acceptance Criteria

- Users cannot enter custom text in the provider response test.
- Requests with arbitrary prompt text cannot make the server forward that text.
- Only approved preset IDs can trigger provider calls.
- Every provider test request has a 128-token output limit.
- Excess response text is bounded before being returned to the browser.
- Existing provider/model selection and response display continue to work.
