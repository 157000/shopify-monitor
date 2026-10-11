import fs from 'node:fs';
import path from 'node:path';
import { AiUnavailableError } from '../ai/client.js';
import { CLASSIFY_PROMPT_VERSION } from '../ai/classify.js';
import {
    SYNTHESIS_PROMPT_VERSION, SynthesisSchema, buildSynthesisSystemPrompt, buildSynthesisUserMessage, validateSynthesis,
} from '../ai/synthesize.js';
import { formatMoney } from '../domain/text.js';
import { log } from '../log.js';
import { withRun } from '../runs.js';

/**
 * Report settimanale (§3.6 del progetto): breve, orientato alle decisioni, con fonti.
 * Le sezioni 1-4 e 7 sono costruite in modo deterministico dai dati; le sezioni 5-6 dall'AI,
 * con ogni affermazione collegata a riferimenti verificati.
 */

const GROUP_LABELS = {
    concorrente_diretto: 'concorrente diretto',
    gastronomico_premium: 'gastronomico premium',
    lifestyle_lusso: 'lifestyle e lusso',
    operatore_commerciale: 'operatore commerciale',
};

const NEW_OFFER_TYPES = ['nuovo_prodotto', 'variante_aggiunta', 'sconto_iniziato', 'sconto_modificato', 'prodotto_ripristinato'];
const CHANGE_TYPES = ['testo_modificato', 'pagina_modificata', 'prezzo_variato', 'sconto_terminato', 'esaurito',
    'tornato_disponibile', 'prodotto_rimosso', 'variante_rimossa', 'inserzione_non_piu_attiva'];
const MAX_LINES_PER_SECTION = 40;
const MAX_EVENTS_FOR_AI = 250;

const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);

export async function gatherReportData(db, { from, to, taxonomyVersion }) {
    const params = [from, to];
    const events = (await db.query(
        `SELECT e.id, e.event_type, e.observed_at, e.summary, e.source_url, e.content_id, e.product_id,
                b.name AS brand_name, b.brand_group
           FROM events e JOIN brands b ON b.id = e.brand_id
          WHERE e.observed_at >= $1 AND e.observed_at < $2 AND NOT e.is_baseline
          ORDER BY b.name, e.observed_at`, params)).rows;

    const baselineCount = (await db.one(
        'SELECT count(*)::int AS n FROM events WHERE observed_at >= $1 AND observed_at < $2 AND is_baseline', params)).n;

    const content = (await db.query(
        `SELECT ct.id, ct.platform, ct.format, ct.url, ct.text_content, ct.cta_text, ct.offer_text,
                ct.first_observed_at, ct.last_observed_at, b.name AS brand_name, b.brand_group,
                c.id AS classification_id, c.labels, c.summary
           FROM content ct JOIN brands b ON b.id = ct.brand_id
           LEFT JOIN LATERAL (
                SELECT id, labels, summary FROM classifications
                 WHERE entity_type = 'content' AND entity_id = ct.id AND prompt_version = $3
                   AND taxonomy_version = $4 AND status <> 'rifiutato'
                 ORDER BY created_at DESC LIMIT 1) c ON true
          WHERE ct.first_observed_at >= $1 AND ct.first_observed_at < $2
          ORDER BY b.name, ct.first_observed_at`, [from, to, CLASSIFY_PROMPT_VERSION, taxonomyVersion])).rows;

    // Classificazioni delle entità osservate nel periodo (fotografie nuove, pagine, contenuti).
    const classifications = (await db.query(
        `SELECT c.id, c.entity_type, c.entity_id, c.labels, c.summary, b.name AS brand_name, b.brand_group,
                COALESCE(p.url, s.url, ct.url) AS url
           FROM classifications c
           LEFT JOIN product_snapshots ps ON c.entity_type = 'product_snapshot' AND ps.id = c.entity_id
           LEFT JOIN products p ON p.id = ps.product_id
           LEFT JOIN page_snapshots pg ON c.entity_type = 'page_snapshot' AND pg.id = c.entity_id
           LEFT JOIN sources s ON s.id = pg.source_id
           LEFT JOIN content ct ON c.entity_type = 'content' AND ct.id = c.entity_id
           JOIN brands b ON b.id = COALESCE(p.brand_id, s.brand_id, ct.brand_id)
          WHERE c.status <> 'rifiutato' AND c.prompt_version = $3 AND c.taxonomy_version = $4
            AND COALESCE(ps.observed_at, pg.observed_at, ct.last_observed_at) >= $1
            AND COALESCE(ps.observed_at, pg.observed_at, ct.last_observed_at) < $2`,
        [from, to, CLASSIFY_PROMPT_VERSION, taxonomyVersion])).rows;

    const rejectedLabels = (await db.one(
        `SELECT COALESCE(sum(jsonb_array_length(rejected_labels)), 0)::int AS rejected,
                COALESCE(sum(jsonb_array_length(labels)), 0)::int AS accepted
           FROM classifications WHERE created_at >= $1 AND created_at < $2`, params));

    const prices = (await db.query(
        `SELECT b.name AS brand_name, b.brand_group, ps.currency,
                count(*)::int AS prodotti,
                count(ps.price_per_liter_cents)::int AS con_volume,
                min(ps.price_per_liter_cents) AS min_pl,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY ps.price_per_liter_cents) AS med_pl,
                max(ps.price_per_liter_cents) AS max_pl
           FROM products p
           JOIN product_snapshots ps ON ps.id = p.current_snapshot_id
           JOIN brands b ON b.id = p.brand_id
          WHERE p.removed_at IS NULL
          GROUP BY b.name, b.brand_group, ps.currency
          ORDER BY b.brand_group, med_pl DESC NULLS LAST`)).rows;

    const sources = (await db.query(
        `SELECT s.id, s.kind, s.url, s.access_status, s.last_success_at, s.last_error, s.terms_note,
                s.currency, s.currency_declared, s.consecutive_failures, b.name AS brand_name
           FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active ORDER BY b.name, s.kind`)).rows;

    const brandsWithoutSources = (await db.query(
        `SELECT b.name FROM brands b WHERE b.active
            AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.brand_id = b.id AND s.enabled)
          ORDER BY b.name`)).rows.map((r) => r.name);

    const brandCounts = (await db.query(
        'SELECT brand_group, count(*)::int AS n FROM brands WHERE active GROUP BY brand_group ORDER BY brand_group')).rows;

    return { events, baselineCount, content, classifications, rejectedLabels, prices, sources, brandsWithoutSources, brandCounts };
}

export function aggregateThemes(classifications) {
    const map = new Map();
    for (const c of classifications) {
        for (const label of c.labels ?? []) {
            const key = `${label.dimensione}:${label.valore}`;
            const entry = map.get(key) ?? { dimensione: label.dimensione, valore: label.valore, elementi: 0, marchi: new Set(), refs: [] };
            entry.elementi++;
            entry.marchi.add(c.brand_name);
            if (entry.refs.length < 5) entry.refs.push(`K${c.id}`);
            map.set(key, entry);
        }
    }
    return [...map.values()]
        .map((e) => ({ ...e, marchi: [...e.marchi].sort() }))
        .sort((a, b) => b.marchi.length - a.marchi.length || b.elementi - a.elementi);
}

function eventLine(e) {
    const source = e.source_url ? ` · [fonte](${e.source_url})` : '';
    return `- \`E${e.id}\` **${e.brand_name}** — ${e.summary}${source} · ${fmtDate(e.observed_at)}`;
}

function capped(lines, what) {
    if (lines.length <= MAX_LINES_PER_SECTION) return lines;
    return [...lines.slice(0, MAX_LINES_PER_SECTION), `- … altri ${lines.length - MAX_LINES_PER_SECTION} ${what} (consultabili nel database)`];
}

function missingInformation(data, ai) {
    const items = [];
    for (const s of data.sources) {
        if (s.access_status === 'bloccato_robots') items.push(`**${s.brand_name}** (${s.kind}): robots.txt non consente la raccolta da ${s.url}. Valutare una fonte alternativa o la consultazione manuale.`);
        else if (s.access_status === 'errore') items.push(`**${s.brand_name}** (${s.kind}): raccolta in errore da ${s.consecutive_failures} tentativi — ${s.last_error ?? 'errore non specificato'}`);
        else if (!s.last_success_at && s.kind !== 'manual_import') items.push(`**${s.brand_name}** (${s.kind}): fonte mai raccolta con successo (${s.url}).`);
        if (['shopify', 'woocommerce'].includes(s.kind) && s.last_success_at && !s.currency && !s.currency_declared) {
            items.push(`**${s.brand_name}**: valuta dei prezzi non verificata — aggiungere \`currency\` alla fonte in brands.yaml.`);
        }
    }
    const withoutTerms = data.sources.filter((s) => !s.terms_note);
    if (withoutTerms.length) {
        items.push(`Condizioni d'uso non ancora verificate per ${withoutTerms.length} fonti (campo \`terms_note\` vuoto): ${[...new Set(withoutTerms.map((s) => s.brand_name))].slice(0, 10).join(', ')}${withoutTerms.length > 10 ? '…' : ''}.`);
    }
    if (data.brandsWithoutSources.length) items.push(`Marchi senza fonti attive: ${data.brandsWithoutSources.join(', ')}.`);
    const missingVolume = data.prices.reduce((n, p) => n + (p.prodotti - p.con_volume), 0);
    const totalProducts = data.prices.reduce((n, p) => n + p.prodotti, 0);
    if (missingVolume) items.push(`Prezzo al litro non calcolabile per ${missingVolume} prodotti su ${totalProducts}: volume assente o ambiguo nel titolo (nessuna stima inventata).`);
    if (data.rejectedLabels.rejected) {
        items.push(`${data.rejectedLabels.rejected} etichette AI scartate nel periodo perché la citazione non era nel testo o la confidenza era bassa (accettate: ${data.rejectedLabels.accepted}).`);
    }
    if (!data.content.length) items.push('Nessun contenuto social o inserzione importato nel periodo: la sezione sugli approcci creativi è vuota (vedi `import:content`).');
    if (ai.note) items.push(ai.note);
    for (const d of ai.discarded ?? []) items.push(`Scartata dall'analisi AI — ${d}.`);
    return items;
}

export function renderReport({ from, to, data, themes, ai }) {
    const out = [];
    const newOffers = data.events.filter((e) => NEW_OFFER_TYPES.includes(e.event_type));
    const changes = data.events.filter((e) => CHANGE_TYPES.includes(e.event_type));

    out.push(`# Tenuta Grieci — Competitive Intelligence`);
    out.push(`## Report settimanale ${fmtDate(from)} → ${fmtDate(to)}`);
    out.push('');
    out.push(`Marchi monitorati: ${data.brandCounts.map((g) => `${g.n} ${GROUP_LABELS[g.brand_group] ?? g.brand_group}`).join(', ') || 'nessuno'}. `
        + `Fonti attive: ${data.sources.length}. Eventi osservati nel periodo: ${data.events.length}`
        + (data.baselineCount ? ` (più ${data.baselineCount} prime rilevazioni, escluse dalle novità).` : '.'));
    out.push('');
    out.push('> **Come leggere il report.** `[OSSERVATO]` = dato rilevato direttamente alla fonte. '
        + '`[INTERPRETAZIONE AI]` = classificazione con citazione verificata nel testo. '
        + '`[IPOTESI]` = proposta da verificare con un test: non è una conclusione. '
        + 'I riferimenti (`E` evento, `C` contenuto, `K` classificazione) rimandano ai record nel database.');
    out.push('');

    out.push('### 1. Nuovi approcci creativi rilevanti `[OSSERVATO]` + `[INTERPRETAZIONE AI]`');
    if (!data.content.length) out.push('_Nessun contenuto o inserzione importato nel periodo._');
    for (const c of data.content.slice(0, MAX_LINES_PER_SECTION)) {
        const labels = (c.labels ?? []).map((l) => `${l.dimensione}: ${l.valore}`).join(', ');
        const text = (c.text_content ?? '').replace(/\s+/g, ' ').slice(0, 160);
        out.push(`- \`C${c.id}\` **${c.brand_name}** · ${c.platform}${c.format ? ` (${c.format})` : ''} — "${text}${text.length === 160 ? '…' : ''}"`
            + `${c.cta_text ? ` · CTA: ${c.cta_text}` : ''}${c.offer_text ? ` · offerta: ${c.offer_text}` : ''}`
            + `${c.url ? ` · [fonte](${c.url})` : ''}`);
        if (labels) out.push(`  - \`K${c.classification_id}\` ${labels}`);
    }
    out.push('');

    out.push('### 2. Nuovi prodotti e offerte osservati `[OSSERVATO]`');
    out.push(...(newOffers.length ? capped(newOffers.map(eventLine), 'eventi') : ['_Nessuna novità di catalogo o promozione nel periodo._']));
    out.push('');

    out.push('### 3. Temi ricorrenti `[INTERPRETAZIONE AI]`');
    const recurring = themes.filter((t) => t.marchi.length >= 2).slice(0, 15);
    if (!recurring.length) {
        out.push('_Nessun tema presente in almeno due marchi (o classificazione non ancora eseguita)._');
    } else {
        out.push('| Dimensione | Valore | Marchi | Elementi | Esempi |');
        out.push('|---|---|---|---|---|');
        for (const t of recurring) {
            out.push(`| ${t.dimensione} | ${t.valore} | ${t.marchi.length}: ${t.marchi.slice(0, 4).join(', ')}${t.marchi.length > 4 ? '…' : ''} | ${t.elementi} | ${t.refs.map((r) => `\`${r}\``).join(' ')} |`);
        }
        out.push('');
        out.push('_La frequenza misura quanto un tema è usato, non quanto funziona._');
    }
    out.push('');

    out.push('### 4. Cambiamenti nella comunicazione dei marchi monitorati `[OSSERVATO]`');
    out.push(...(changes.length ? capped(changes.map(eventLine), 'eventi') : ['_Nessun cambiamento rilevato nel periodo._']));
    out.push('');
    const priced = data.prices.filter((p) => p.con_volume > 0);
    if (priced.length) {
        out.push('**Posizionamento di prezzo osservato** — prezzo al litro del formato d\'ingresso di ogni prodotto attivo (volume ricavato dal titolo):');
        out.push('');
        out.push('| Marchio | Gruppo | Prodotti (con volume) | €/L min | €/L mediano | €/L max |');
        out.push('|---|---|---|---|---|---|');
        for (const p of priced) {
            out.push(`| ${p.brand_name} | ${GROUP_LABELS[p.brand_group]} | ${p.prodotti} (${p.con_volume}) | ${formatMoney(p.min_pl, p.currency)} | ${formatMoney(Math.round(p.med_pl), p.currency)} | ${formatMoney(p.max_pl, p.currency)} |`);
        }
        out.push('');
    }

    out.push('### 5. Opportunità coerenti con Tenuta Grieci `[IPOTESI]`');
    if (!ai.result) out.push(`_Sezione non generata: ${ai.note ?? 'analisi AI non eseguita'}._`);
    else if (!ai.result.opportunita.length) out.push('_Nessuna opportunità con evidenze sufficienti in questo periodo._');
    else {
        for (const o of ai.result.opportunita) {
            out.push(`#### ${o.titolo}${o.insightId ? ` · insight #${o.insightId}` : ''}`);
            out.push(o.descrizione);
            out.push(`- **Perché merita attenzione:** ${o.perche_rilevante}`);
            out.push(`- **Coerenza con il marchio:** ${o.coerenza_brand}`);
            out.push(`- **Evidenze:** ${o.evidenze.map((r) => `\`${r}\``).join(' ')}`);
            if (o.informazioni_mancanti.length) out.push(`- **Da verificare:** ${o.informazioni_mancanti.join('; ')}`);
            out.push('');
        }
    }
    out.push('');

    out.push('### 6. Ipotesi da testare `[IPOTESI]`');
    if (!ai.result) out.push(`_Sezione non generata: ${ai.note ?? 'analisi AI non eseguita'}._`);
    else if (!ai.result.ipotesi.length) out.push('_Nessuna ipotesi con evidenze sufficienti in questo periodo._');
    else {
        out.push('_Punteggi 1–5 (evidenza, coerenza, potenziale, fattibilità, differenziazione): servono a ordinare le priorità, non sono previsioni di performance._');
        out.push('');
        for (const h of ai.result.ipotesi) {
            const s = h.punteggi;
            out.push(`#### ${h.ipotesi}${h.insightId ? ` · insight #${h.insightId}` : ''}`);
            out.push(`- **Punteggio:** ${h.punteggio_totale}/25 (E${s.evidenza} · C${s.coerenza} · P${s.potenziale_commerciale} · F${s.fattibilita} · D${s.differenziazione})`);
            out.push(`- **Evidenze:** ${h.evidenze.map((r) => `\`${r}\``).join(' ')}`);
            out.push(`- **Esperimento:** ${h.esperimento} — pubblico: ${h.pubblico}; formato: ${h.formato}`);
            out.push(`- **KPI primario:** ${h.kpi_primario} · **Successo se:** ${h.criterio_successo} · **Stop se:** ${h.criterio_interruzione}`);
            out.push(`- **Costo stimato:** ${h.costo_stimato} · **Rischio per il marchio:** ${h.rischio_brand}`);
            out.push('');
        }
        out.push('Per approvare, scartare o approfondire: `node src/cli.js insights:decide <id> --stato approvata|scartata|da_approfondire --nota "..."`');
        if (ai.result.avvertenze.length) {
            out.push('');
            out.push(`**Avvertenze dell'analisi:** ${ai.result.avvertenze.join(' · ')}`);
        }
    }
    out.push('');

    out.push('### 7. Informazioni mancanti o non verificabili');
    const missing = missingInformation(data, ai);
    out.push(...(missing.length ? missing.map((m) => `- ${m}`) : ['_Nessuna lacuna rilevata._']));
    out.push('');
    out.push(`---\n_Generato il ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Prompt: ${CLASSIFY_PROMPT_VERSION}, ${SYNTHESIS_PROMPT_VERSION}${ai.model ? `; modello strategico: ${ai.model}` : ''}._`);
    return out.join('\n');
}

function buildObservations(data, themes) {
    const priority = (e) => (NEW_OFFER_TYPES.includes(e.event_type) ? 0 : e.event_type === 'testo_modificato' || e.event_type === 'pagina_modificata' ? 1 : 2);
    const events = [...data.events].sort((a, b) => priority(a) - priority(b)).slice(0, MAX_EVENTS_FOR_AI);
    const observations = {
        eventi: events.map((e) => ({
            ref: `E${e.id}`, tipo: e.event_type, marchio: e.brand_name, gruppo: e.brand_group,
            descrizione: e.summary, data: fmtDate(e.observed_at),
        })),
        contenuti: data.content.map((c) => ({
            ref: `C${c.id}`, marchio: c.brand_name, gruppo: c.brand_group, piattaforma: c.platform, formato: c.format,
            testo: (c.text_content ?? '').slice(0, 600), cta: c.cta_text, offerta: c.offer_text,
            prima_osservazione: fmtDate(c.first_observed_at), ultima_osservazione: fmtDate(c.last_observed_at),
        })),
        classificazioni: data.classifications.slice(0, 300).map((c) => ({
            ref: `K${c.id}`, marchio: c.brand_name, gruppo: c.brand_group, sintesi: c.summary,
            etichette: (c.labels ?? []).map((l) => `${l.dimensione}:${l.valore}`),
        })),
        temi_ricorrenti: themes.slice(0, 25).map((t) => ({
            tema: `${t.dimensione}:${t.valore}`, marchi: t.marchi.length, elementi: t.elementi, esempi: t.refs,
        })),
        prezzo_al_litro_per_marchio: data.prices.filter((p) => p.con_volume).map((p) => ({
            marchio: p.brand_name, gruppo: p.brand_group, valuta: p.currency ?? 'non verificata',
            mediano_centesimi: Math.round(p.med_pl), prodotti_con_volume: p.con_volume,
        })),
    };
    const refs = new Set([
        ...observations.eventi.map((e) => e.ref),
        ...observations.contenuti.map((c) => c.ref),
        ...observations.classificazioni.map((c) => c.ref),
    ]);
    const truncatedNote = data.events.length > events.length
        ? `sono stati inclusi ${events.length} eventi su ${data.events.length} (priorità: novità di catalogo e cambi di comunicazione).`
        : null;
    return { observations, refs, truncatedNote };
}

async function saveInsights(db, { reportId, result, model }) {
    for (const o of result.opportunita) {
        const row = await db.one(
            `INSERT INTO insights (level, title, body, evidence, details, created_by, model, report_id)
             VALUES ('ipotesi', $1, $2, $3, $4, 'ai', $5, $6) RETURNING id`,
            [o.titolo, o.descrizione, JSON.stringify(o.evidenze), JSON.stringify({
                tipo: 'opportunita', perche_rilevante: o.perche_rilevante, coerenza_brand: o.coerenza_brand,
                informazioni_mancanti: o.informazioni_mancanti,
            }), model, reportId],
        );
        o.insightId = row.id;
    }
    for (const h of result.ipotesi) {
        const { ipotesi, evidenze, ...details } = h;
        const row = await db.one(
            `INSERT INTO insights (level, title, body, evidence, details, created_by, model, report_id)
             VALUES ('ipotesi', $1, $2, $3, $4, 'ai', $5, $6) RETURNING id`,
            [ipotesi, h.esperimento, JSON.stringify(evidenze), JSON.stringify({ tipo: 'ipotesi_test', ...details }), model, reportId],
        );
        h.insightId = row.id;
    }
}

export async function runWeeklyReport({ db, ai, settings, taxonomy, knowledgeBase }, { from, to, useAi = true } = {}) {
    const periodEnd = to ?? new Date();
    const periodStart = from ?? new Date(periodEnd.getTime() - 7 * 86400000);

    return withRun(db, 'weekly_report', async (runId) => {
        const data = await gatherReportData(db, { from: periodStart, to: periodEnd, taxonomyVersion: taxonomy.version });
        const themes = aggregateThemes(data.classifications);
        const aiState = { result: null, note: null, discarded: [], model: null };

        const hasMaterial = data.events.length || data.content.length || data.classifications.length;
        if (!useAi) aiState.note = 'analisi AI esclusa per questa esecuzione (--no-ai)';
        else if (!ai.enabled) aiState.note = ai.unavailableReason;
        else if (!hasMaterial) aiState.note = 'nessuna osservazione nel periodo su cui basare ipotesi';
        else {
            const { observations, refs, truncatedNote } = buildObservations(data, themes);
            try {
                const { output, model } = await ai.structured({
                    purpose: 'sintesi_settimanale', model: settings.ai.strategyModel, effort: 'high', runId,
                    system: buildSynthesisSystemPrompt(taxonomy), schema: SynthesisSchema,
                    user: buildSynthesisUserMessage({
                        period: `${fmtDate(periodStart)} → ${fmtDate(periodEnd)}`, observations, knowledgeBase, truncatedNote,
                    }),
                });
                const validated = validateSynthesis(output, refs);
                aiState.result = validated;
                aiState.discarded = validated.discarded;
                aiState.model = model;
            } catch (err) {
                aiState.note = err instanceof AiUnavailableError
                    ? `AI non disponibile: ${err.message}`
                    : `analisi AI non riuscita: ${err.message}`;
                log.warn(`Sintesi AI non eseguita: ${err.message}`);
            }
        }

        const report = await db.one(
            `INSERT INTO reports (run_id, period_start, period_end, ai_used, markdown)
             VALUES ($1, $2, $3, $4, '') RETURNING id`,
            [runId, periodStart, periodEnd, Boolean(aiState.result)],
        );
        if (aiState.result) await saveInsights(db, { reportId: report.id, result: aiState.result, model: aiState.model });

        const markdown = renderReport({ from: periodStart, to: periodEnd, data, themes, ai: aiState });
        fs.mkdirSync(settings.paths.reportsDir, { recursive: true });
        const filePath = path.join(settings.paths.reportsDir, `report-${fmtDate(periodEnd)}-${report.id}.md`);
        fs.writeFileSync(filePath, markdown);
        await db.query('UPDATE reports SET markdown = $2, file_path = $3 WHERE id = $1', [report.id, markdown, filePath]);

        return {
            status: aiState.result || !useAi || !ai.enabled || !hasMaterial ? 'ok' : 'parziale',
            stats: { report_id: report.id, file: filePath, eventi: data.events.length, ai: Boolean(aiState.result) },
            reportId: report.id,
            filePath,
            markdown,
        };
    });
}
