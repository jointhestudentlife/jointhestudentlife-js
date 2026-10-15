#!/usr/bin/env node
/**
 * The Student Life CLI.
 *
 *   npx jointhestudentlife cities [query]
 *   npx jointhestudentlife city <slug>
 *   npx jointhestudentlife events [city] [--type halloween]
 *   npx jointhestudentlife event <id>
 *   npx jointhestudentlife deals [category]
 *   npx jointhestudentlife pricing [city]
 *   npx jointhestudentlife mcp          MCP stdio bridge to https://jointhestudentlife.com/mcp
 *
 * Add --json to any read command for the raw JSON. No key needed.
 */
import { createInterface } from 'node:readline';
import { TheStudentLife, DEFAULT_BASE_URL, VERSION } from './index.js';

const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) flags[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--') && ['type', 'base-url', 'limit', 'country'].includes(k)) flags[k] = argv[++i];
    else flags[k] = true;
  } else args.push(a);
}
const baseUrl = flags['base-url'] || process.env.TSL_BASE_URL || DEFAULT_BASE_URL;
const tsl = new TheStudentLife({ baseUrl, userAgent: 'jointhestudentlife-cli/' + VERSION });
const cmd = args.shift();

const HELP = `The Student Life CLI ${VERSION}: student events, ticket prices, city guides and deals.

Usage:
  jointhestudentlife cities [query] [--country DE]   search cities
  jointhestudentlife city <slug>                     student guide for one city
  jointhestudentlife events [city] [--type halloween] upcoming events with prices
  jointhestudentlife event <id>                      one event, e.g. berlin-hw26
  jointhestudentlife deals [category]                student discount codes
  jointhestudentlife pricing [city]                  what is free, what tickets cost
  jointhestudentlife mcp                             MCP stdio bridge to ${baseUrl}/mcp

Options:
  --json        print raw JSON
  --base-url    API host (default ${DEFAULT_BASE_URL}, or set TSL_BASE_URL)

Docs: https://jointhestudentlife.com/developers`;

const out = (s) => process.stdout.write(s + '\n');
const money = (o) => Number(o.price).toFixed(2) + ' ' + o.currency;

async function main() {
  if (cmd === 'version' || flags.version) return out(VERSION);
  if (!cmd || cmd === 'help' || cmd === '-h' || flags.help || flags.h) return out(HELP);
  if (cmd === 'mcp') return bridge();

  let data;
  switch (cmd) {
    case 'cities': data = await tsl.cities({ q: args.join(' '), country: flags.country, limit: flags.limit || 100 }); break;
    case 'city': if (!args[0]) throw new Error('Usage: jointhestudentlife city <slug>'); data = await tsl.city(args.join(' ')); break;
    case 'events': data = await tsl.events({ city: args.join(' ') || undefined, type: flags.type, limit: flags.limit || 50 }); break;
    case 'event': if (!args[0]) throw new Error('Usage: jointhestudentlife event <id>'); data = await tsl.event(args[0]); break;
    case 'deals': case 'partners': data = await tsl.partners({ category: args.join(' ') || undefined }); break;
    case 'pricing': data = await tsl.pricing({ city: args.join(' ') || undefined }); break;
    default: throw new Error('Unknown command "' + cmd + '". Run: jointhestudentlife help');
  }
  if (flags.json) return out(JSON.stringify(data, null, 2));

  if (cmd === 'cities') {
    for (const c of data.cities) out(c.name.padEnd(18) + c.country.padEnd(16) + c.city_guide_url);
    out('\n' + data.total + ' cities' + (data.next_cursor ? ' (more: use --json and the next_cursor)' : ''));
  } else if (cmd === 'city') {
    out(data.name + ', ' + data.country + '\n\n' + data.summary + '\n');
    for (const c of data.monthly_costs) out('  ' + c.label + ': ' + c.value);
    if (data.universities.length) out('\nUniversities: ' + data.universities.map((u) => u.name).join(', '));
    if (data.upcoming_events.length) out('\nUpcoming: ' + data.upcoming_events.map((e) => e.name + ' (' + e.url + ')').join('\n          '));
    out('\nGuide: ' + data.city_guide_url);
  } else if (cmd === 'events') {
    if (!data.events.length) out(data.note || 'No upcoming events.');
    for (const e of data.events) out(String(e.start).slice(0, 10) + '  ' + e.name.padEnd(30) + ' ' + e.tickets.status.padEnd(12) + (e.tickets.options.length ? e.tickets.options.map(money).join(' / ') : '') + '\n            ' + e.url);
  } else if (cmd === 'event') {
    out(data.name + '\n' + data.start + (data.venue ? ' at ' + data.venue.name : '') + '\n');
    for (const o of data.tickets.options) out('  ' + o.name + ': ' + money(o));
    const ea = data.tickets.early_access;
    if (ea) out('  Early access: ' + money(ea) + (ea.open_now ? '' : ' from ' + ea.opens) + ' until ' + ea.ends);
    if (data.entry_rule) out('\n' + data.entry_rule);
    out('\nTickets (' + data.tickets.status + (data.tickets.status === 'opens_soon' && data.tickets.sales_open_at ? ', sales open ' + data.tickets.sales_open_at : '') + '): ' + data.tickets.buy_url);
  } else if (cmd === 'deals' || cmd === 'partners') {
    if (!data.partners.length) out('No deals match.');
    for (const p of data.partners) out(p.name.padEnd(12) + p.deal + (p.code ? '  code ' + p.code : ''));
  } else if (cmd === 'pricing') {
    out(data.summary + '\n');
    for (const h of data.halloween_2026 || []) out('Halloween ' + h.city.padEnd(12) + ' ' + h.date + '  R1 ' + Number(h.round_1).toFixed(2) + ' / R2 ' + Number(h.round_2).toFixed(2) + ' / group ' + Number(h.group_of_5).toFixed(2) + ' ' + h.currency + (h.status === 'opens_soon' ? '  (sales open ' + h.sales_open_at + ')' : ''));
    out('\n' + (data.page || ''));
  }
}

/* MCP stdio bridge: newline delimited JSON-RPC on stdin/stdout, forwarded to the
   Streamable HTTP server. Logs go to stderr only, never stdout. */
function bridge() {
  const url = baseUrl + '/mcp';
  let protocol = null;
  const pending = new Set();
  // a client that closes the pipe early is gone: nothing left to tell it, so no EPIPE stack trace
  process.stdout.on('error', (e) => { if (!e || e.code !== 'EPIPE') throw e; });
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch (e) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      return;
    }
    const job = forward(msg).finally(() => pending.delete(job));
    pending.add(job);
  });
  // No process.exit: Node exits by itself once stdin is closed, every fetch has settled and
  // stdout has flushed. process.exit() here dropped whatever was still queued for a full pipe.

  async function forward(msg) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'User-Agent': 'jointhestudentlife-mcp-bridge/' + VERSION };
    if (protocol) headers['MCP-Protocol-Version'] = protocol;
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg), signal: AbortSignal.timeout(60000) });
      if (res.status === 202) return;
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch (e) { throw new Error('HTTP ' + res.status + ' from ' + url); }
      for (const m of [].concat(body)) {
        // HTTP level errors (429 rate limit, 400) come back with id null: give the client its own id
        if (m && m.error && m.id == null && !Array.isArray(msg) && msg && msg.id != null) m.id = msg.id;
        // a notification (no id) never gets a reply, not even an HTTP level error
        if (m && m.error && m.id == null && !Array.isArray(msg) && msg && msg.id == null) continue;
        if (m && m.result && m.result.protocolVersion) protocol = m.result.protocolVersion;
        process.stdout.write(JSON.stringify(m) + '\n');
      }
    } catch (e) {
      process.stderr.write('[jointhestudentlife mcp] ' + e.message + '\n');
      if (msg && msg.id !== undefined && msg.id !== null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Could not reach ' + url + ': ' + e.message } }) + '\n');
    }
  }
}

main().catch((e) => { process.stderr.write((e && e.message ? e.message : String(e)) + '\n'); process.exit(1); });
