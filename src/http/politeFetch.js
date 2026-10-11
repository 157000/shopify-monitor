import robotsParser from 'robots-parser';

/**
 * Client HTTP "educato" per la raccolta da fonti pubbliche.
 *
 * Scelte deliberate (vedi docs/PROGETTO.md §3.2 e §17):
 *  - rispetta robots.txt (RFC 9309): 4xx → nessuna restrizione; 5xx o rete irraggiungibile → accesso negato;
 *  - si identifica con uno User-Agent esplicito;
 *  - una richiesta alla volta per host, con pausa minima configurabile;
 *  - su 429/503 rispetta Retry-After, con un numero limitato di tentativi;
 *  - nessuna rotazione di proxy o tecnica per aggirare blocchi: se una fonte non vuole essere letta,
 *    il sistema lo registra e lo segnala, non insiste.
 */

export class HttpError extends Error {
    constructor(message, { status = null, url, code = 'http_error' } = {}) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.url = url;
        this.code = code;
    }
}

export class RobotsDisallowedError extends HttpError {
    constructor(url) {
        super(`robots.txt non consente l'accesso a ${url}`, { url, code: 'robots_disallowed' });
        this.name = 'RobotsDisallowedError';
    }
}

const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createHttpClient(options) {
    const {
        userAgent,
        delayPerHostMs = 3000,
        timeoutMs = 20000,
        maxRetries = 2,
        maxRetryAfterMs = 120000,
        fetchImpl = globalThis.fetch,
    } = options;

    const nextSlotByHost = new Map();   // host → timestamp del prossimo slot disponibile
    const robotsCache = new Map();      // origin → { robots|null, denyAll, fetchedAt }

    async function throttle(host) {
        const now = Date.now();
        const slot = Math.max(now, nextSlotByHost.get(host) ?? 0);
        nextSlotByHost.set(host, slot + delayPerHostMs);
        if (slot > now) await sleep(slot - now);
    }

    async function rawGet(url, accept) {
        const { host } = new URL(url);
        for (let attempt = 0; ; attempt++) {
            await throttle(host);
            let response;
            try {
                response = await fetchImpl(url, {
                    headers: { 'user-agent': userAgent, accept },
                    redirect: 'follow',
                    signal: AbortSignal.timeout(timeoutMs),
                });
            } catch (err) {
                const code = err?.name === 'TimeoutError' ? 'timeout' : 'network_error';
                throw new HttpError(`Richiesta fallita (${code}) per ${url}: ${err?.message ?? err}`, { url, code });
            }

            if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
                const waitMs = parseRetryAfter(response.headers.get('retry-after')) ?? 30000 * (attempt + 1);
                if (waitMs > maxRetryAfterMs) {
                    throw new HttpError(`${url} chiede di attendere ${Math.round(waitMs / 1000)}s: rinvio alla prossima esecuzione`,
                        { url, status: response.status, code: 'rate_limited' });
                }
                await response.body?.cancel();
                await sleep(waitMs);
                continue;
            }
            return response;
        }
    }

    async function loadRobots(origin) {
        const cached = robotsCache.get(origin);
        if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) return cached;

        const robotsUrl = `${origin}/robots.txt`;
        let entry;
        try {
            const response = await rawGet(robotsUrl, 'text/plain,*/*;q=0.5');
            if (response.ok) {
                entry = { robots: robotsParser(robotsUrl, await response.text()), denyAll: false };
            } else if (response.status >= 400 && response.status < 500) {
                await response.body?.cancel();
                entry = { robots: null, denyAll: false };     // robots.txt assente: nessuna restrizione
            } else {
                await response.body?.cancel();
                entry = { robots: null, denyAll: true };      // server in errore: per prudenza non si procede
            }
        } catch {
            entry = { robots: null, denyAll: true };
        }
        entry.fetchedAt = Date.now();
        robotsCache.set(origin, entry);
        return entry;
    }

    async function isAllowed(url) {
        const { origin } = new URL(url);
        const entry = await loadRobots(origin);
        if (entry.denyAll) return false;
        if (!entry.robots) return true;
        return entry.robots.isAllowed(url, userAgent) !== false;
    }

    async function get(url, { accept = '*/*' } = {}) {
        if (!(await isAllowed(url))) throw new RobotsDisallowedError(url);
        const response = await rawGet(url, accept);
        const body = await response.text();
        if (!response.ok) {
            throw new HttpError(`HTTP ${response.status} per ${url}`, { url, status: response.status });
        }
        return { url: response.url || url, status: response.status, headers: response.headers, body };
    }

    async function getJson(url) {
        const res = await get(url, { accept: 'application/json' });
        try {
            return { ...res, json: JSON.parse(res.body) };
        } catch {
            throw new HttpError(`Risposta non JSON da ${url}`, { url, status: res.status, code: 'invalid_json' });
        }
    }

    return { get, getJson, isAllowed };
}

export function parseRetryAfter(value) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
