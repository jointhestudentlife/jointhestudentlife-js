# jointhestudentlife

Official SDK and CLI for [The Student Life](https://jointhestudentlife.com): student events, ticket prices, city guides and student deals in 85+ cities, for international and exchange students.

The API is open. No key, no signup, no payment. Zero dependencies, ESM only (`import`, not `require`); works anywhere `fetch` exists (Node 18+, Deno, Bun, browsers, edge runtimes).

## CLI

```sh
npx jointhestudentlife events berlin            # upcoming events with ticket prices
npx jointhestudentlife events --type halloween  # every Halloween party
npx jointhestudentlife city lisbon              # costs, universities, upcoming events
npx jointhestudentlife deals esim               # student discount codes
npx jointhestudentlife pricing                  # what is free, what tickets cost
npx jointhestudentlife cities --country DE --json
```

## SDK

```js
import { TheStudentLife } from 'jointhestudentlife';

const tsl = new TheStudentLife();
const { events } = await tsl.events({ city: 'paris', type: 'halloween' });
console.log(events[0].tickets.options); // [{ name: 'Round 1', price: 9.5, currency: 'EUR' }, ...]

const guide = await tsl.city('lisbon');
for await (const city of tsl.eachCity()) console.log(city.name);
```

Methods: `cities`, `city`, `events`, `event`, `partners`, `pricing`, `eachCity`, `eachEvent`, `sendMessage`, `info`. Lists are cursor paginated (`next_cursor`). Errors throw `TheStudentLifeError` with `status` and `code` (including `timeout` and `network_error`). Requests retry on 429 (honouring `Retry-After`); reads also retry on 5xx, while a message is only retried when it carries an idempotency key: without a key the SDK never retries a message, so it cannot send it twice. Requests time out after 30 seconds (`timeoutMs`).

`sendMessage` emails our team on someone's behalf. Only use it with that person's consent and their own name and email. It is meant for server side code: browser pages on other sites are refused. Set `dryRun: true` to validate without sending. To make retries safe, pass a fresh idempotency key per message in the second argument; the server then recognises a retry (best effort, see the developer docs). Messages are limited to a few per minute.

```js
await tsl.sendMessage({ name, email, message, dryRun: true }); // validates, sends nothing
await tsl.sendMessage({ name, email, message }, { idempotencyKey: crypto.randomUUID() });
```

## MCP

The Student Life runs a remote MCP server at `https://jointhestudentlife.com/mcp` (Streamable HTTP). Clients that only speak stdio can use this package as a bridge:

```json
{
  "mcpServers": {
    "the-student-life": { "command": "npx", "args": ["-y", "jointhestudentlife", "mcp"] }
  }
}
```

The server has six read tools and two that act: `send_message_to_team` emails our team and `join_halloween_waitlist` adds someone to a city's Halloween list. Only call them with that person's consent and their own details. Both accept `dry_run: true`, which validates everything and sends nothing.

## Links

- Developer docs: https://jointhestudentlife.com/developers
- OpenAPI: https://jointhestudentlife.com/openapi.json
- llms.txt: https://jointhestudentlife.com/llms.txt
- Support: support@jointhestudentlife.com

The code in this package is MIT licensed. The Student Life name, logo and the data served by the API are not covered by that licence. The Student Life is operated by Socials BV, Brussels.
