import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

/**
 * Accesso al modello con tre garanzie:
 *  - output strutturato e validato (structured outputs + schema zod): niente testo libero da interpretare;
 *  - ogni chiamata registrata in `ai_usage` con token e costo stimato (controllo del budget, §18);
 *  - nessuno strumento a disposizione del modello: può solo leggere e rispondere, non agire.
 */

// Modelli che accettano il fallback lato server `fallbacks: "default"` (beta server-side-fallback-2026-07-01).
// Claude Haiku 5.5 non lo prevede: per quel modello un rifiuto resta un rifiuto e viene gestito qui.
const SERVER_FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export class AiUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AiUnavailableError';
    }
}

export class AiResponseError extends Error {
    constructor(message, { stopReason = null } = {}) {
        super(message);
        this.name = 'AiResponseError';
        this.stopReason = stopReason;
    }
}

export function loadPricing(filePath) {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8')).models ?? {};
}

export function estimateCostUsd(pricing, model, usage) {
    const p = pricing[model];
    if (!p) return null;
    const perToken = (rate) => (rate ?? 0) / 1_000_000;
    return (usage.input_tokens ?? 0) * perToken(p.input)
        + (usage.output_tokens ?? 0) * perToken(p.output)
        + (usage.cache_read_input_tokens ?? 0) * perToken(p.cache_read)
        + (usage.cache_creation_input_tokens ?? 0) * perToken(p.cache_write);
}

/**
 * @param {object} deps
 * @param {object} deps.db
 * @param {object} deps.pricing  da loadPricing()
 * @param {object} [deps.anthropic]  client iniettabile (test); di default `new Anthropic()`, che risolve le
 *   credenziali da ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN o dal profilo di `ant auth login`.
 * @param {boolean} [deps.enabled]
 */
export function createAi({ db, pricing, anthropic = null, enabled = true }) {
    let client = anthropic;
    let unavailableReason = enabled ? null : 'AI disattivata (AI_ENABLED=false)';

    async function recordUsage({ runId, purpose, model, usage, stopReason }) {
        const cost = estimateCostUsd(pricing, model, usage ?? {});
        await db.query(
            `INSERT INTO ai_usage (run_id, purpose, model, input_tokens, output_tokens, cache_read_tokens,
                                   cache_write_tokens, cost_usd, stop_reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [runId ?? null, purpose, model, usage?.input_tokens ?? 0, usage?.output_tokens ?? 0,
                usage?.cache_read_input_tokens ?? 0, usage?.cache_creation_input_tokens ?? 0, cost, stopReason ?? null],
        );
        return cost;
    }

    /**
     * Chiamata con output strutturato. Il system prompt è stabile e marcato per la cache dei prompt.
     * @returns {Promise<{ output: object, model: string, costUsd: number|null }>}
     */
    async function structured({ purpose, model, system, user, schema, effort, maxTokens = 16000, runId = null }) {
        if (unavailableReason) throw new AiUnavailableError(unavailableReason);
        client ??= new Anthropic();

        const params = {
            model,
            max_tokens: maxTokens,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: user }],
            output_config: { effort, format: betaZodOutputFormat(schema) },
        };
        if (SERVER_FALLBACK_MODELS.has(model)) {
            params.betas = ['server-side-fallback-2026-07-01'];
            params.fallbacks = 'default';
        }

        let response;
        try {
            response = await client.beta.messages.parse(params);
        } catch (err) {
            if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
                unavailableReason = `credenziali Anthropic non valide (${err.status})`;
                throw new AiUnavailableError(unavailableReason);
            }
            if (!(err instanceof Anthropic.APIError) && /authentication method/i.test(String(err?.message))) {
                unavailableReason = 'credenziali Anthropic non configurate (ANTHROPIC_API_KEY o `ant auth login`)';
                throw new AiUnavailableError(unavailableReason);
            }
            throw err;
        }

        const servedModel = response.model ?? model;
        const costUsd = await recordUsage({
            runId, purpose, model: servedModel, usage: response.usage, stopReason: response.stop_reason,
        });

        if (response.stop_reason === 'refusal') {
            const category = response.stop_details?.category ?? 'non specificata';
            throw new AiResponseError(`Il modello ha rifiutato la richiesta (categoria: ${category})`, { stopReason: 'refusal' });
        }
        if (response.stop_reason === 'max_tokens') {
            throw new AiResponseError('Risposta troncata: limite di token raggiunto', { stopReason: 'max_tokens' });
        }
        if (!response.parsed_output) {
            throw new AiResponseError('Risposta non conforme allo schema atteso', { stopReason: response.stop_reason });
        }
        return { output: response.parsed_output, model: servedModel, costUsd };
    }

    return {
        structured,
        /** false solo se l'AI è stata disattivata di proposito nella configurazione. */
        enabled,
        get available() {
            return unavailableReason === null;
        },
        get unavailableReason() {
            return unavailableReason;
        },
    };
}
