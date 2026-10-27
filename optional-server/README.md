# Optional Gemini integration — disabled stub

Backstory’s extension works without an account, API key, server, or paid API.
Its practice questions are deterministic local templates, not AI-generated.

This directory is a **future server-side boundary**, not a working Gemini
integration. It contains no HTTP server and makes no network requests.
`requestGeminiQuestions(request)` always rejects with
`GeminiAdapterDisabledError` (`GEMINI_ADAPTER_DISABLED`). It does not inspect
the request, read environment variables, load credentials, or log user content.
The extension neither imports nor invokes it. Setting an environment variable
cannot activate this stub.

`.env.example` contains placeholders only; do not place a real key in the
extension, this repository, an export, or a shared ZIP. A previously supplied
key is not permission to configure persistent credentials or send code to a
provider. No existing credentials were sought or used for this scaffold.

## Before implementing a real adapter

Obtain separate approval for credential configuration and an explicit choice
to send particular evidence to Gemini. Then:

1. Choose a trusted server and authenticated, authorized request boundary; do
   not expose an unauthenticated endpoint or give browser code the API key.
2. Keep secrets in server-side secret management, exclude local `.env` files
   from source control, and define rotation and deletion procedures.
3. Show exactly what will leave the device before each request. Default to
   excluding source snippets; allow review and redaction. Never transmit a
   whole repository or saved-card collection implicitly.
4. Review provider data-handling terms, private-repository restrictions, and
   expected costs. Set request-size limits, rate limits, timeouts, and a spend
   ceiling. Do not log code, notes, keys, or raw provider responses.
5. Treat code and notes as untrusted data, not model instructions. Validate
   the response format and render it as text. Label generated questions and
   distinguish suggestions from independently verified facts.
6. Test with a mocked transport first, including authentication, consent,
   denied requests, quota failures, redaction, and provider errors. Preserve
   the local-only path whenever AI is disabled or unavailable.

There is no server to start in this MVP. Adapter tests run with the rest of
the project’s Node test suite and require no credentials or network.
