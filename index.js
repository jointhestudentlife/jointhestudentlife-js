/**
 * jointhestudentlife: the official JavaScript SDK for The Student Life
 * (https://jointhestudentlife.com/developers).
 *
 * Zero dependencies. Works in Node 18+, Deno, Bun, browsers and edge runtimes
 * (anything with fetch). The API is open: no key, no signup.
 */

export const DEFAULT_BASE_URL = 'https://jointhestudentlife.com';
export const VERSION = '1.0.0';

export class TheStudentLifeError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, body?: unknown }} [info]
   */
  constructor(message, info = {}) {
    super(message);
    this.name = 'TheStudentLifeError';
    this.status = info.status;
    this.code = info.code;
    this.body = info.body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? '?' + s : '';
}

export class TheStudentLife {
  /**
   * @param {{ baseUrl?: string, fetch?: typeof fetch, maxRetries?: number, timeoutMs?: number, userAgent?: string }} [options]
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetch = options.fetch || globalThis.fetch;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries == null ? 2 : Number(options.maxRetries) || 0, 5));
    this.timeoutMs = options.timeoutMs || 30000;
    this.userAgent = options.userAgent || 'jointhestudentlife-js/' + VERSION;
    if (typeof this.fetch !== 'function') throw new TheStudentLifeError('No fetch available. Pass options.fetch.');
  }

  /** Low level request. Retries 429 (Retry-After) always, and 5xx only for GET/HEAD or a request
      with an Idempotency-Key, so a POST is never sent twice by accident. */
  async request(path, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    let attempt = 0;
    for (;;) {
      const headers = Object.assign({ Accept: 'application/json' }, init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers || {});
      // a custom User-Agent only from Node: in browsers and workers it would force a CORS preflight
      if (typeof process !== 'undefined' && process.versions && process.versions.node) headers['User-Agent'] = this.userAgent;
      const safe = method === 'GET' || method === 'HEAD' || !!headers['Idempotency-Key'];
      let res;
      try {
        res = await this.fetch(this.baseUrl + path, Object.assign({ signal: AbortSignal.timeout(this.timeoutMs) }, init, { headers }));
      } catch (e) {
        throw new TheStudentLifeError('Could not reach ' + this.baseUrl + ': ' + (e && e.message), { code: e && e.name === 'TimeoutError' ? 'timeout' : 'network_error' });
      }
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
      if (res.ok) return body;
      const retryable = res.status === 429 || (res.status >= 500 && safe);
      if (retryable && attempt < this.maxRetries) {
        const after = parseInt(res.headers.get('retry-after') || '', 10);
        await sleep(Number.isFinite(after) && after >= 0 ? Math.min(after, 30) * 1000 : Math.min(500 * 2 ** attempt, 8000));
        attempt++;
        continue;
      }
      const err = body && body.error ? body.error : {};
      throw new TheStudentLifeError(err.message || (body && body.code) || 'Request failed with status ' + res.status, { status: res.status, code: err.code || (body && body.code), body });
    }
  }

  /** Index of the API: endpoints, version, policies. */
  info() { return this.request('/api/v1'); }

  /**
   * Search the cities The Student Life covers.
   * @param {{ q?: string, country?: string, limit?: number, cursor?: string }} [params]
   */
  cities(params = {}) { return this.request('/api/v1/cities' + query(params)); }

  /** Full student guide for one city (slug or name). */
  city(slug) { return this.request('/api/v1/cities/' + encodeURIComponent(String(slug).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, ''))); }

  /**
   * Events with ticket prices and status.
   * @param {{ city?: string, type?: 'all'|'halloween'|'welcome_festival'|'semester_kickoff'|'orientation_week', upcoming?: boolean, limit?: number, cursor?: string }} [params]
   */
  events(params = {}) { return this.request('/api/v1/events' + query(params)); }

  /** One event by id, for example "berlin-hw26". */
  event(id) { return this.request('/api/v1/events/' + encodeURIComponent(String(id).trim().toLowerCase())); }

  /** Student discount codes from partners. */
  partners(params = {}) { return this.request('/api/v1/partners' + query(params)); }

  /** What is free and what tickets cost, optionally for one city. */
  pricing(params = {}) { return this.request('/api/v1/pricing' + query(params)); }

  /** Iterate every city across pages. */
  async *eachCity(params = {}) {
    let cursor;
    do {
      const page = await this.cities(Object.assign({}, params, { cursor }));
      for (const c of page.cities) yield c;
      cursor = page.next_cursor;
    } while (cursor);
  }

  /** Iterate every event across pages. */
  async *eachEvent(params = {}) {
    let cursor;
    do {
      const page = await this.events(Object.assign({}, params, { cursor }));
      for (const e of page.events) yield e;
      cursor = page.next_cursor;
    } while (cursor);
  }

  /**
   * Email the team on someone's behalf. Only with their consent and their own details.
   * @param {{ name: string, email: string, message: string, subject?: string, city?: string, dryRun?: boolean }} msg
   * @param {{ idempotencyKey?: string }} [options]
   */
  sendMessage(msg, options = {}) {
    const body = { name: msg.name, email: msg.email, message: msg.message, subject: msg.subject, city: msg.city, form_type: 'agent-sdk' };
    if (msg.dryRun) body.dry_run = true;
    const headers = { 'Content-Type': 'application/json' };
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    return this.request('/api/contact', { method: 'POST', headers, body: JSON.stringify(body) });
  }
}

export default TheStudentLife;
