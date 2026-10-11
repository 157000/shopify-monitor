import { withRun } from '../runs.js';

/**
 * Workflow 8 — System Health (§15 del progetto): "un sistema automatizzato non è affidabile soltanto perché
 * esegue workflow: deve anche accorgersi quando smette di funzionare correttamente".
 *
 * Gravità: "critico" (il sistema non sta producendo dati affidabili), "attenzione" (serve un intervento),
 * "info" (decisioni o verifiche umane in sospeso).
 */
export async function checkHealth(db, settings) {
    const issues = [];
    const add = (severity, check, message) => issues.push({ severity, check, message });
    const { staleHours, failureThreshold } = settings.health;

    const lastCollect = await db.one(
        `SELECT max(finished_at) AS at FROM runs WHERE workflow = 'collect' AND status IN ('ok', 'parziale')`,
    );
    const enabledSources = (await db.one(
        `SELECT count(*)::int AS n FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active AND s.kind <> 'manual_import'`,
    )).n;
    if (enabledSources === 0) {
        add('attenzione', 'fonti', 'Nessuna fonte attiva: compilare config/brands.yaml ed eseguire brands:sync.');
    } else if (!lastCollect.at) {
        add('critico', 'raccolta', 'Nessuna raccolta completata finora.');
    } else if (Date.now() - new Date(lastCollect.at).getTime() > staleHours * 3600000) {
        add('critico', 'raccolta', `Ultima raccolta riuscita più di ${staleHours} ore fa (${new Date(lastCollect.at).toISOString()}): verificare la pianificazione.`);
    }

    const { rows: failedRuns } = await db.query(
        `SELECT workflow, count(*)::int AS n, max(started_at) AS last FROM runs
          WHERE status = 'errore' AND started_at > now() - interval '24 hours' GROUP BY workflow`,
    );
    for (const r of failedRuns) add('attenzione', 'esecuzioni', `${r.n} esecuzioni fallite di "${r.workflow}" nelle ultime 24 ore.`);

    const { rows: stuck } = await db.query(
        `SELECT id, workflow, started_at FROM runs WHERE status = 'in_corso' AND started_at < now() - interval '6 hours'`,
    );
    for (const r of stuck) add('attenzione', 'esecuzioni', `Esecuzione #${r.id} (${r.workflow}) bloccata in corso dal ${r.started_at.toISOString()}.`);

    const { rows: failing } = await db.query(
        `SELECT s.id, s.kind, s.url, s.consecutive_failures, s.last_error, b.name
           FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active AND s.access_status = 'errore' AND s.consecutive_failures >= $1`,
        [failureThreshold],
    );
    for (const s of failing) {
        add('attenzione', 'fonti', `${s.name} (${s.kind}): ${s.consecutive_failures} errori consecutivi — ${s.last_error ?? ''}`);
    }

    const { rows: blocked } = await db.query(
        `SELECT s.url, b.name FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active AND s.access_status = 'bloccato_robots'`,
    );
    for (const s of blocked) add('info', 'fonti', `${s.name}: robots.txt non consente la raccolta da ${s.url} — decidere se disattivare la fonte.`);

    const { rows: neverOk } = await db.query(
        `SELECT s.url, s.kind, b.name FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active AND s.kind <> 'manual_import' AND s.last_success_at IS NULL
            AND s.created_at < now() - interval '48 hours'`,
    );
    for (const s of neverOk) add('attenzione', 'fonti', `${s.name} (${s.kind}): mai raccolta con successo da oltre 48 ore (${s.url}).`);

    // Avvisi di qualità registrati dall'ultima raccolta (cali anomali del catalogo, cambi di schema, testi vuoti).
    const lastRun = await db.one(`SELECT stats FROM runs WHERE workflow = 'collect' AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`);
    for (const detail of lastRun?.stats?.dettaglio ?? []) {
        for (const warning of detail.warnings ?? []) {
            if (/calo anomalo|schema|JavaScript|troncato/i.test(warning)) {
                add('attenzione', 'qualita_dati', `Fonte #${detail.sourceId}: ${warning}`);
            }
        }
    }

    const terms = (await db.one(
        `SELECT count(*)::int AS n FROM sources s JOIN brands b ON b.id = s.brand_id
          WHERE s.enabled AND b.active AND s.terms_note IS NULL`,
    )).n;
    if (terms) add('info', 'governance', `${terms} fonti senza verifica documentata delle condizioni d'uso (terms_note).`);

    const spend = await db.one(
        `SELECT COALESCE(sum(cost_usd), 0) AS usd, count(*) FILTER (WHERE cost_usd IS NULL)::int AS senza_prezzo
           FROM ai_usage WHERE created_at >= date_trunc('month', now())`,
    );
    const budget = settings.ai.monthlyBudgetUsd;
    if (budget > 0) {
        const ratio = spend.usd / budget;
        if (ratio >= 1) add('critico', 'costi', `Spesa AI del mese ${spend.usd.toFixed(2)} USD: budget di ${budget} USD superato.`);
        else if (ratio >= 0.8) add('attenzione', 'costi', `Spesa AI del mese ${spend.usd.toFixed(2)} USD: oltre l'80% del budget (${budget} USD).`);
    }
    if (spend.senza_prezzo) add('info', 'costi', `${spend.senza_prezzo} chiamate AI con modello non presente in config/ai-pricing.json: costo non stimato.`);

    const quality = await db.one(
        `SELECT COALESCE(sum(jsonb_array_length(rejected_labels)), 0)::int AS rejected,
                COALESCE(sum(jsonb_array_length(labels)), 0)::int AS accepted
           FROM classifications WHERE created_at > now() - interval '7 days'`,
    );
    const totalLabels = quality.rejected + quality.accepted;
    if (totalLabels >= 20 && quality.rejected / totalLabels > 0.3) {
        add('attenzione', 'qualita_ai', `${Math.round((quality.rejected / totalLabels) * 100)}% delle etichette AI scartate negli ultimi 7 giorni: rivedere prompt o tassonomia.`);
    }

    const order = { critico: 0, attenzione: 1, info: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);
    return {
        status: issues.some((i) => i.severity === 'critico') ? 'critico' : issues.some((i) => i.severity === 'attenzione') ? 'attenzione' : 'ok',
        issues,
        spendMonthUsd: spend.usd,
    };
}

export async function runHealth(db, settings) {
    return withRun(db, 'health', async () => {
        const result = await checkHealth(db, settings);
        return { status: 'ok', stats: result, health: result };
    });
}
