#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { createAi, loadPricing } from './ai/client.js';
import { runClassify } from './ai/classify.js';
import { loadTaxonomy } from './ai/taxonomy.js';
import { loadSettings } from './config.js';
import { createDb, migrate } from './db.js';
import { runHealth } from './health/check.js';
import { createHttpClient } from './http/politeFetch.js';
import { DECISION_STATES, decideInsight, listInsights } from './insights.js';
import { log } from './log.js';
import { sendAlert } from './notify.js';
import { compositionReport, detectSources, loadBrandsFile, syncBrands } from './pipeline/brands.js';
import { runCollect } from './pipeline/collect.js';
import { importContent, readContentFile } from './pipeline/importContent.js';
import { runWeeklyReport } from './reports/weekly.js';

const HELP = `Tenuta Grieci — Marketing Intelligence (Modulo A: Competitive Intelligence)

Uso: node src/cli.js <comando> [opzioni]

Configurazione
  db:migrate                         Crea o aggiorna lo schema del database
  brands:sync                        Carica config/brands.yaml (universo competitivo) nel database
  sources:detect [--brand slug]      Individua la piattaforma dei siti senza fonte e-commerce (stampa YAML da incollare)

Raccolta e analisi
  collect [--brand slug] [--source id] [--force]
                                     Raccoglie cataloghi e pagine (rispetta intervalli e robots.txt)
  import:content <file.json|.csv>    Importa contenuti social, inserzioni e newsletter raccolti da fonti consentite
  classify [--limit n]               Classifica i nuovi elementi con l'AI (evidenze verificate nel testo)
  report:weekly [--from AAAA-MM-GG] [--to AAAA-MM-GG] [--no-ai]
                                     Genera il report settimanale in reports/
  pipeline [--no-ai]                 collect → classify → report:weekly → health, in sequenza

Decisioni e controllo
  insights:list [--stato s]          Elenca ipotesi e decisioni
  insights:decide <id> --stato <${DECISION_STATES.join('|')}> --nota "..." [--da nome]
                                     Registra una decisione umana su un'ipotesi
  health [--notify]                  Controllo di salute del sistema (exit code 2 se critico)
  status                             Riepilogo rapido dell'archivio
`;

function readKnowledgeBase(filePath) {
    if (!fs.existsSync(filePath)) return '';
    const text = fs.readFileSync(filePath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const substantive = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    return substantive.length ? text.trim() : '';
}

function parseDate(value, name) {
    if (!value) return undefined;
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error(`Data non valida per --${name}: "${value}" (formato AAAA-MM-GG)`);
    return date;
}

function createContext() {
    const settings = loadSettings();
    const db = createDb(settings.databaseUrl);
    const http = createHttpClient(settings.http);
    const ai = createAi({
        db, pricing: loadPricing(settings.paths.pricingFile), enabled: process.env.AI_ENABLED !== 'false',
    });
    return {
        settings, db, http, ai,
        get taxonomy() {
            return loadTaxonomy(settings.paths.taxonomyFile);
        },
        get knowledgeBase() {
            return readKnowledgeBase(settings.paths.knowledgeBaseFile);
        },
    };
}

function printTable(rows) {
    if (rows.length) console.table(rows);
    else console.log('(nessun risultato)');
}

async function healthCommand(ctx, { notify }) {
    const { health } = await runHealth(ctx.db, ctx.settings);
    console.log(`Stato del sistema: ${health.status.toUpperCase()} — spesa AI del mese: ${Number(health.spendMonthUsd).toFixed(2)} USD`);
    for (const issue of health.issues) console.log(`  [${issue.severity}] ${issue.check}: ${issue.message}`);
    const relevant = health.issues.filter((i) => i.severity !== 'info');
    if (notify && relevant.length && ctx.settings.alertWebhookUrl) {
        const text = [`Tenuta Grieci Intelligence — stato: ${health.status}`, ...relevant.map((i) => `• [${i.severity}] ${i.message}`)].join('\n');
        await sendAlert(ctx.settings.alertWebhookUrl, text);
        log.info('Notifica inviata');
    }
    return health.status === 'critico' ? 2 : 0;
}

async function main(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            brand: { type: 'string' },
            source: { type: 'string' },
            force: { type: 'boolean', default: false },
            limit: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            'no-ai': { type: 'boolean', default: false },
            notify: { type: 'boolean', default: false },
            stato: { type: 'string' },
            nota: { type: 'string' },
            da: { type: 'string' },
            help: { type: 'boolean', short: 'h', default: false },
        },
    });
    const [command, ...args] = positionals;
    if (!command || values.help) {
        console.log(HELP);
        return 0;
    }

    const ctx = createContext();
    try {
        switch (command) {
            case 'db:migrate': {
                const applied = await migrate(ctx.db, ctx.settings.paths.migrationsDir);
                console.log(applied.length ? `Migrazioni applicate: ${applied.join(', ')}` : 'Schema già aggiornato');
                return 0;
            }
            case 'brands:sync': {
                const brands = loadBrandsFile(ctx.settings.paths.brandsFile);
                const summary = await syncBrands(ctx.db, brands);
                console.log(`Sincronizzati ${summary.marchi} marchi e ${summary.fonti} fonti (${summary.fonti_disattivate} fonti disattivate).`);
                console.log('Composizione dell\'universo competitivo (obiettivo indicativo del progetto §3.1):');
                printTable(compositionReport(brands));
                return 0;
            }
            case 'sources:detect': {
                const results = await detectSources(ctx.db, ctx.http, { brandSlug: values.brand ?? null });
                if (!results.length) console.log('Tutti i marchi con sito hanno già una fonte e-commerce.');
                for (const r of results) {
                    console.log(`\n# ${r.slug} (${r.website})`);
                    if (r.kind) {
                        console.log('    sources:');
                        console.log(`      - kind: ${r.kind}\n        url: ${r.url}\n        terms_note: null  # verificare le condizioni d'uso del sito`);
                    } else {
                        console.log('#   nessuna fonte raccoglibile individuata');
                    }
                    for (const a of r.attempts) console.log(`#   - ${a}`);
                }
                return 0;
            }
            case 'collect': {
                const result = await runCollect(ctx, {
                    brandSlug: values.brand ?? null,
                    sourceId: values.source ? Number(values.source) : null,
                    force: values.force,
                });
                console.log(`Raccolta #${result.runId}: ${result.status} — fonti ${result.stats.fonti}, fallite ${result.stats.fallite}`);
                return result.status === 'errore' ? 1 : 0;
            }
            case 'import:content': {
                if (!args[0]) throw new Error('Indicare il file da importare: import:content <file.json|.csv>');
                const result = await importContent(ctx.db, readContentFile(args[0]));
                console.log(`Import: ${result.stats.nuovi} nuovi, ${result.stats.aggiornati} aggiornati, ${result.stats.scartati} scartati, ${result.stats.eventi} eventi`);
                for (const e of result.errors) console.log(`  - ${e}`);
                return result.errors.length ? 1 : 0;
            }
            case 'classify': {
                const result = await runClassify(ctx, values.limit ? { limit: Number(values.limit) } : {});
                console.log(`Classificazione #${result.runId}: ${result.status} — ${JSON.stringify(result.stats)}`);
                return result.status === 'errore' ? 1 : 0;
            }
            case 'report:weekly': {
                const result = await runWeeklyReport(ctx, {
                    from: parseDate(values.from, 'from'), to: parseDate(values.to, 'to'), useAi: !values['no-ai'],
                });
                console.log(`Report #${result.reportId} salvato in ${result.filePath} (${result.status})`);
                return 0;
            }
            case 'pipeline': {
                const collect = await runCollect(ctx, {});
                log.info(`Raccolta: ${collect.status}`);
                if (!values['no-ai']) {
                    const classify = await runClassify(ctx);
                    log.info(`Classificazione: ${classify.status}`);
                }
                const report = await runWeeklyReport(ctx, { useAi: !values['no-ai'] });
                console.log(`Report salvato in ${report.filePath}`);
                return await healthCommand(ctx, { notify: true });
            }
            case 'insights:list': {
                const rows = await listInsights(ctx.db, { status: values.stato ?? null });
                printTable(rows.map((r) => ({
                    id: r.id, livello: r.level, tipo: r.tipo ?? '', stato: r.status, da: r.created_by,
                    titolo: r.title.slice(0, 70), evidenze: (r.evidence ?? []).join(' '),
                })));
                return 0;
            }
            case 'insights:decide': {
                const id = Number(args[0]);
                if (!Number.isInteger(id)) throw new Error('Indicare l\'ID dell\'insight: insights:decide <id> --stato ... --nota "..."');
                const decisionId = await decideInsight(ctx.db, {
                    id, status: values.stato, note: values.nota, decidedBy: values.da ?? process.env.USER ?? 'utente',
                });
                console.log(`Decisione registrata (#${decisionId}) sull'insight #${id}.`);
                return 0;
            }
            case 'health':
                return await healthCommand(ctx, { notify: values.notify });
            case 'status': {
                const counts = await ctx.db.one(`SELECT
                    (SELECT count(*) FROM brands WHERE active)::int AS marchi,
                    (SELECT count(*) FROM sources WHERE enabled)::int AS fonti,
                    (SELECT count(*) FROM products WHERE removed_at IS NULL)::int AS prodotti_attivi,
                    (SELECT count(*) FROM product_snapshots)::int AS fotografie_prodotto,
                    (SELECT count(*) FROM page_snapshots)::int AS fotografie_pagina,
                    (SELECT count(*) FROM content)::int AS contenuti,
                    (SELECT count(*) FROM events WHERE NOT is_baseline)::int AS eventi,
                    (SELECT count(*) FROM classifications)::int AS classificazioni,
                    (SELECT count(*) FROM insights WHERE level = 'ipotesi')::int AS ipotesi,
                    (SELECT count(*) FROM insights WHERE level = 'decisione')::int AS decisioni`);
                printTable([counts]);
                const { rows } = await ctx.db.query(
                    `SELECT s.id, b.slug AS marchio, s.kind AS tipo, s.access_status AS stato,
                            to_char(s.last_success_at, 'YYYY-MM-DD HH24:MI') AS ultimo_ok, s.consecutive_failures AS errori
                       FROM sources s JOIN brands b ON b.id = s.brand_id WHERE s.enabled ORDER BY b.slug, s.kind`);
                printTable(rows);
                return 0;
            }
            default:
                console.error(`Comando sconosciuto: ${command}\n`);
                console.log(HELP);
                return 1;
        }
    } finally {
        await ctx.db.close();
    }
}

main(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((err) => {
        log.error(err?.message ?? String(err));
        process.exitCode = 1;
    });
