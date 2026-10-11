import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { insertEvent } from './collect.js';
import { withRun } from '../runs.js';

/**
 * Importa contenuti social, inserzioni (es. Meta Ad Library) e newsletter raccolti da fonti consentite.
 *
 * Il progetto (§3.2) non dà per scontato che esista un'API per ogni piattaforma: questo importatore accetta
 * un formato unico (JSON o CSV) indipendentemente da come i dati sono stati raccolti — consultazione manuale,
 * esportazioni ufficiali o strumenti autorizzati. Il campo `collection_method` è obbligatorio, così ogni
 * dato porta con sé la propria provenienza.
 */

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);
const optionalText = z.preprocess(emptyToNull, z.string().nullable().optional());
const optionalDate = z.preprocess(emptyToNull, z.coerce.date().nullable().optional());

const RecordSchema = z.object({
    brand: z.string().min(1),
    platform: z.string().min(1).transform((s) => s.toLowerCase()),
    external_ref: optionalText,
    format: optionalText,
    url: z.preprocess(emptyToNull, z.url().nullable().optional()),
    landing_url: z.preprocess(emptyToNull, z.url().nullable().optional()),
    text: optionalText,
    media_description: optionalText,
    cta: optionalText,
    offer: optionalText,
    published_at: optionalDate,
    observed_at: optionalDate,
    collection_method: z.string().min(3, 'indicare come è stato raccolto il dato'),
    active: z.preprocess((v) => {
        if (v === '' || v === undefined || v === null) return null;
        if (typeof v === 'boolean') return v;
        return ['true', 'si', 'sì', '1', 'yes'].includes(String(v).toLowerCase());
    }, z.boolean().nullable()),
    metrics: z.record(z.string(), z.number()).optional().default({}),
});

/** Parser CSV minimale (RFC 4180): virgolette, virgole e a capo all'interno dei campi. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const input = text.replace(/^﻿/, '');
    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (quoted) {
            if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && input[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const [header, ...data] = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (!header) return [];
    const keys = header.map((h) => h.trim());
    return data.map((cells) => Object.fromEntries(keys.map((k, i) => [k, cells[i]?.trim() ?? ''])));
}

/** Le colonne CSV "metric_<nome>" diventano l'oggetto metrics. */
function csvRowToRecord(row) {
    const record = { metrics: {} };
    for (const [key, value] of Object.entries(row)) {
        if (key.startsWith('metric_')) {
            if (value !== '') record.metrics[key.slice(7)] = Number(value.replace(',', '.'));
        } else {
            record[key] = value;
        }
    }
    return record;
}

export function readContentFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (path.extname(filePath).toLowerCase() === '.csv') return parseCsv(raw).map(csvRowToRecord);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.items ?? [];
}

export function validateRecords(records) {
    const valid = [];
    const errors = [];
    records.forEach((record, index) => {
        const result = RecordSchema.safeParse(record);
        if (result.success) valid.push(result.data);
        else errors.push(`riga ${index + 1}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    });
    return { valid, errors };
}

export async function importContent(db, records) {
    const { valid, errors } = validateRecords(records);
    return withRun(db, 'import_content', async (runId) => {
        const counters = { nuovi: 0, aggiornati: 0, eventi: 0, scartati: errors.length };
        for (const r of valid) {
            await db.transaction(async (tx) => {
                const brand = await tx.one('SELECT id FROM brands WHERE slug = $1', [r.brand]);
                if (!brand) {
                    errors.push(`marchio sconosciuto "${r.brand}" (eseguire prima brands:sync)`);
                    counters.scartati++;
                    return;
                }
                const ref = r.external_ref ?? r.url;
                if (!ref) {
                    errors.push(`contenuto di ${r.brand} senza external_ref né url`);
                    counters.scartati++;
                    return;
                }
                const observedAt = r.observed_at ?? new Date();
                const existing = await tx.one('SELECT id FROM content WHERE platform = $1 AND external_ref = $2', [r.platform, ref]);
                let contentId;
                if (!existing) {
                    const row = await tx.one(
                        `INSERT INTO content (brand_id, platform, external_ref, format, url, landing_url, text_content,
                             media_description, cta_text, offer_text, published_at, first_observed_at, last_observed_at,
                             collection_method, raw)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14) RETURNING id`,
                        [brand.id, r.platform, ref, r.format, r.url, r.landing_url, r.text, r.media_description, r.cta,
                            r.offer, r.published_at, observedAt, r.collection_method, JSON.stringify(r)],
                    );
                    contentId = row.id;
                    const isAd = r.platform === 'meta_ads' || r.format === 'inserzione';
                    await insertEvent(tx, {
                        runId, brandId: brand.id, contentId, observedAt, sourceUrl: r.url,
                        type: isAd ? 'inserzione_osservata' : 'contenuto_osservato',
                        summary: `${isAd ? 'Inserzione' : 'Contenuto'} ${r.platform}${r.format ? ` (${r.format})` : ''}: `
                            + `${(r.text ?? r.media_description ?? '').slice(0, 120) || 'senza testo'}`,
                        after: { cta: r.cta, offer: r.offer, landing_url: r.landing_url },
                    });
                    counters.nuovi++;
                    counters.eventi++;
                } else {
                    contentId = existing.id;
                    await tx.query(
                        `UPDATE content SET
                            last_observed_at = GREATEST(last_observed_at, $2),
                            first_observed_at = LEAST(first_observed_at, $2),
                            landing_url = COALESCE(landing_url, $3), cta_text = COALESCE(cta_text, $4),
                            offer_text = COALESCE(offer_text, $5), media_description = COALESCE(media_description, $6)
                          WHERE id = $1`,
                        [contentId, observedAt, r.landing_url, r.cta, r.offer, r.media_description],
                    );
                    counters.aggiornati++;
                }

                const previous = await tx.one(
                    'SELECT still_active FROM content_snapshots WHERE content_id = $1 AND observed_at < $2 ORDER BY observed_at DESC LIMIT 1',
                    [contentId, observedAt],
                );
                const inserted = await tx.query(
                    `INSERT INTO content_snapshots (content_id, observed_at, metrics, still_active)
                     VALUES ($1, $2, $3, $4) ON CONFLICT (content_id, observed_at) DO NOTHING`,
                    [contentId, observedAt, JSON.stringify(r.metrics), r.active],
                );
                if (inserted.rowCount && previous?.still_active === true && r.active === false) {
                    const span = await tx.one('SELECT first_observed_at, url FROM content WHERE id = $1', [contentId]);
                    const days = Math.max(0, Math.round((observedAt - span.first_observed_at) / 86400000));
                    await insertEvent(tx, {
                        runId, brandId: brand.id, contentId, observedAt, sourceUrl: span.url,
                        type: 'inserzione_non_piu_attiva',
                        summary: `Inserzione non più attiva dopo circa ${days} giorni di osservazione `
                            + '(la durata non dimostra che la campagna fosse profittevole)',
                        after: { giorni_osservati: days },
                    });
                    counters.eventi++;
                }
            });
        }
        return { status: errors.length ? 'parziale' : 'ok', stats: { ...counters, errori: errors } };
    }).then((result) => ({ ...result, errors }));
}
