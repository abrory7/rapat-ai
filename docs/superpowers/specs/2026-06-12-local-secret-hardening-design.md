# Local Secret Hardening Design

## Summary

Rapat AI is a single-user application accessed from the same computer on which
the Next.js server runs. The security design therefore does not require HTTPS,
accounts, or remote access. Instead, it prevents network exposure, keeps
provider credentials server-side, limits where credentials may be sent, and
protects secrets stored in the local SQLite database.

Success means that neither plaintext nor encrypted provider credentials appear
in browser-readable API responses, local provider integrations continue to
work, and the application listens only on the loopback interface by default.

## Threat Model

The design protects against:

- Accidental exposure of the Next.js server to the LAN.
- API keys leaking through JSON responses, client state, logs, or raw upstream
  error messages.
- A malicious compatible-provider URL receiving a saved API key.
- Secrets stored in MCP environment variables being returned to the browser.
- Accidental client imports of cryptographic or secret-access modules.
- Database theft without the matching encryption secret.

The design does not protect against:

- An attacker who already controls the user's OS account or browser.
- A compromised provider endpoint explicitly trusted by the user.
- Deliberate use of `0.0.0.0`, a tunnel, reverse proxy, or port forwarding.
- Loss of encrypted data when the database and `.secret` file are not backed up
  and restored together.

## Architecture

### Loopback-Only Runtime

The `dev` and `start` scripts explicitly pass `--hostname 127.0.0.1`. The README
documents localhost-only operation and states that LAN access, tunnels, and
public reverse proxies are outside the secure operating model.

### Server-Only Secret Boundary

Cryptographic and secret data-access modules import `server-only`. Provider
records are converted to explicit safe DTOs rather than returned with object
spreads. Prisma queries select only fields needed by each route.

The public provider DTO contains:

- `id`
- `name`
- `type`
- `baseUrl`
- `models`
- `hasApiKey`
- `createdAt`
- `updatedAt`

It never contains `apiKey`, whether plaintext, ciphertext, or a reusable masked
placeholder.

Provider API keys are write-only:

- Creating a provider requires a non-empty key.
- Editing a provider returns an empty key input and `hasApiKey: true`.
- An empty or omitted key during update preserves the existing encrypted key.
- A non-empty key replaces it after encryption.
- Validation and model discovery accept a transient key only while creating or
  replacing credentials. Tests of an existing provider use its provider ID and
  decrypt the key only on the server.

Role endpoints return a safe nested provider DTO or a minimal provider summary;
they never include the provider database record directly.

### Provider Destination Policy

All outbound provider URLs pass through one server-only validator.

Allowed destinations:

- Built-in OpenAI, Anthropic, and Google endpoints selected by provider type.
- HTTP or HTTPS loopback destinations using `localhost`, `127.0.0.0/8`, or
  `[::1]`, including custom ports.
- Public HTTPS destinations whose resolved addresses are not private,
  loopback, link-local, multicast, unspecified, or cloud metadata addresses.

Rejected destinations:

- Plain HTTP destinations outside loopback.
- URLs containing username or password credentials.
- Unsupported protocols.
- Private or LAN destinations outside loopback.
- Link-local and metadata destinations, including `169.254.169.254`.
- Redirects whose destination fails the same policy.

Outbound requests use manual redirect handling with a small redirect limit.
Every redirect is revalidated before the authorization header or API key is
sent to the next destination. DNS results are checked immediately before the
request to reduce hostname-based bypasses.

Ollama remains usable on localhost without an API key. Compatible providers on
another LAN device are intentionally unsupported.

### MCP Environment Secrets

MCP environment values are encrypted as one authenticated JSON payload before
storage. API responses expose environment variable names and a `hasValue`
indicator, but never their values or ciphertext.

During editing:

- Omitted or blank values preserve existing stored values.
- Non-empty values replace the corresponding values.
- Explicit removal uses a separate `removedEnvKeys: string[]` request field.
- MCP process startup decrypts the environment only on the server immediately
  before constructing the client configuration.

Existing plaintext MCP environment records are supported during a one-time
lazy migration: reads recognize legacy JSON, encrypt it before the next write,
and never return its values to the browser.

### Encryption and Local Files

AES-256-GCM remains the encryption primitive. Ciphertext parsing validates the
version, IV length, authentication tag length, hex encoding, and payload shape.
New ciphertext includes a version prefix so future key rotation or format
changes are possible.

The application never silently regenerates `.secret` when an existing secret is
invalid. It fails with an actionable error because regeneration would make all
existing ciphertext unrecoverable. New secret files are created with mode
`0600`; startup emits a warning if `.secret`, `.env`, or the SQLite database is
readable by group or others.

The README explains that the database and `.secret` file form one backup unit.

### Errors and Logging

Route handlers return generic errors at the HTTP boundary. Provider errors may
include status and a sanitized provider message, but never raw response bodies,
authorization headers, submitted keys, or URLs containing query parameters.
Google API keys are not placed in diagnostic URLs.

Shared redaction removes common API-key formats, authorization values, and
credential-bearing query parameters before server logging.

## Testing

Automated tests cover:

- Encryption round-trip, malformed ciphertext, tampering, invalid secret files,
  and legacy ciphertext compatibility.
- Safe provider DTOs and nested role responses containing no `apiKey`.
- Provider creation and replacement, plus updates that preserve the current key
  when the key field is empty or omitted.
- URL acceptance for official HTTPS endpoints and loopback providers.
- URL rejection for HTTP internet hosts, LAN/private addresses, metadata,
  credential-bearing URLs, unsupported protocols, and unsafe redirects.
- MCP environment encryption, safe DTO output, preservation, replacement,
  deletion, and legacy plaintext handling.
- Error redaction and absence of raw upstream responses.
- Route-level regression checks that plaintext and ciphertext never occur in
  response JSON.

Final verification runs the focused security tests, existing orchestrator
tests, ESLint, and the production build.

## Acceptance Criteria

- `npm run dev` and `npm start` listen on `127.0.0.1` by default.
- Browser network responses never contain provider keys, encrypted provider
  keys, MCP environment values, or encrypted MCP environment payloads.
- Existing provider keys continue to work after editing unrelated fields.
- Existing provider tests use saved credentials without sending them through
  the browser.
- Ollama and compatible providers on loopback remain functional.
- Unsafe provider destinations fail before any credential-bearing request.
- Invalid `.secret` content never causes silent key regeneration.
- Security tests, existing tests, lint, and production build pass.
