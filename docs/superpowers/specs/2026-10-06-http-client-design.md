# An HTTP client in ADE

**Status:** design, awaiting approval
**Date:** 2026-10-06

## Why

Building against several third-party APIs means a loop ADE cannot close today:
change the integration, switch to another application to fire a request, read the
response, come back. The agent that wrote the call never sees whether it worked.

The ask is a personal tool, not a team one: your own Postman, living beside the
terminal that is building the integration.

## Decisions

Settled in design, in the order they were made:

1. **Any API, including third-party.** Not just the API this project serves.
2. **Requests execute in Rust.** A consequence of (1), not a preference. Browser
   `fetch` is CORS-bound, so most third-party hosts would simply fail, and the
   browser refuses to set `Host`, `Origin` or `Cookie` at all.
3. **Collections are local and private.** Not files in the project, nothing
   committable, nothing a teammate sees. They live in ADE's own state and ride
   the existing sync to the user's other machines.
4. **Secrets come from the vault and are approved per host.** A secret going to
   a host for the first time prompts once, then is remembered.

## Architecture

### Execution: a Rust command

`http_send(request) -> HttpResponse`, backed by `reqwest`. Timeouts, redirect
policy and raw body bytes are all explicit, none of which the browser would
allow.

### Secrets resolve inside Rust, because they cannot resolve anywhere else

`vault.rs` exposes `vault_list`, `vault_set` and `vault_delete` to the frontend.
There is deliberately **no `vault_get`**: the UI cannot read a secret's value
today and this feature must not be the reason one appears.

`${STRIPE_KEY}` is therefore substituted inside `http_send`, between reading the
request and opening the connection. The value never crosses the IPC boundary,
never enters a store, and never appears in a response the UI renders.

### Collections live in app state

One collection per integration, in ADE's data directory beside the rest of the
saved state, so they are picked up by the existing sync. That sync already
carries notes, prompt history and settings between a user's own machines, and
already excludes API keys, which is the behaviour this needs.

```yaml
name: Stripe
base: https://api.stripe.com
auth: { type: bearer, token: ${STRIPE_KEY} }
requests:
  - name: list charges
    method: GET
    path: /v1/charges
    expect: { status: 200 }
```

`expect` is what makes a collection testable rather than merely re-sendable.
**Run all** executes a collection and reports pass or fail per request; **Run
everything** does it across collections, which is the point of the feature: after
a key rotation or a dependency bump, check six integrations in one action rather
than clicking through them.

### Importing a spec

OpenAPI 3 and Swagger 2, from a file or a URL, are parsed into a collection:
paths become requests, the declared server becomes `base`, and the declared
security scheme becomes an `auth` block with a `${NAME}` placeholder for the
user to point at a vault entry.

Import is generous about what it accepts and explicit about what it drops. A
path it cannot model is skipped and counted, and the count is shown. Silently
importing nine of twelve endpoints is worse than refusing, because the three
that vanished are invisible.

## The secret guard

Approval is keyed on **secret + host** and stored in app state, deliberately
outside any collection. A collection must not be able to grant itself permission
to send a secret, which is exactly what storing the approval alongside it would
allow.

```
This request sends a secret to a host it has not been sent to before.
  secret  STRIPE_KEY
  host    api.stripe.com
  from    collection "Stripe", request "list charges"
[ Send and remember ]   [ Send once ]   [ Cancel ]
```

Changing a collection's `base` re-prompts. That is not pedantry: keeping the
secret reference while changing the destination is the shape the attack takes,
and an imported spec is the realistic way a wrong `base` arrives.

The prompt names the collection and request that asked, because "which of these
is doing this" is the question a person actually has.

## Surface

A tab, `Tab.type: "http"`, matching the contracts workbench rather than inventing
a new kind of window. Collections on the left; request builder and response on
the right; run results inline against each request.

Responses render by content type: JSON folded, HTML and images shown, anything
else as text with its bytes and duration. Headers are shown in full, with any
value that came from a vault secret displayed as its name rather than its value.

## Out of scope

- **Pre-request scripting.** Postman's headline feature, and the largest
  security surface available: arbitrary JavaScript with access to resolved
  secrets. Not in a first release, and not without a separate design.
- GraphQL, WebSockets, gRPC.
- OAuth redirect flows. Bearer, basic, header and query-parameter auth cover the
  integrations this is for; an OAuth dance needs a browser and a callback server.
- Mock servers, contract testing, load testing.

## Testing

- **Spec fixtures are real vendor documents**, not hand-written ones. The BMAD
  gate work established why: hand-written fixtures are written to match the
  parser, so they confirm it rather than test it, and three real bugs hid behind
  them.
- A resolved secret never appears in a rendered response, a saved run result, or
  an error message.
- An approval cannot be read or written from a collection.
- `${NAME}` with no matching vault entry fails loudly. It must never send the
  literal string `${NAME}`, which would otherwise reach the host as a
  recognisable marker that a real key was meant to be there.
- Import: a spec with no servers block, a path with no method, a security scheme
  ADE does not model, and a 404 on a spec URL.
- Run all: a collection where one request fails reports that one as failed and
  still runs the rest.

## Open questions

Neither blocking:

1. Whether a failing request should be dispatchable to a role the way a review
   finding is. It is the obvious tie to the rest of ADE, but this is a personal
   tool and the connection may be unwanted.
2. Whether run results are worth keeping as history. They are the kind of thing
   that is useful twice and clutter thereafter.
