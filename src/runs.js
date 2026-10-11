/**
 * Registro delle esecuzioni: ogni workflow lascia traccia di inizio, fine, esito e statistiche.
 * È la base del controllo di salute (Workflow 8 del progetto).
 */
export async function startRun(db, workflow) {
    const row = await db.one('INSERT INTO runs (workflow) VALUES ($1) RETURNING id', [workflow]);
    return row.id;
}

export async function finishRun(db, runId, { status, stats = {}, error = null }) {
    await db.query(
        'UPDATE runs SET finished_at = now(), status = $2, stats = $3, error = $4 WHERE id = $1',
        [runId, status, JSON.stringify(stats), error],
    );
}

/** Esegue `fn(runId)` registrando l'esito. `fn` restituisce { status?, stats? }. */
export async function withRun(db, workflow, fn) {
    const runId = await startRun(db, workflow);
    try {
        const result = (await fn(runId)) ?? {};
        await finishRun(db, runId, { status: result.status ?? 'ok', stats: result.stats ?? {} });
        return { runId, ...result };
    } catch (err) {
        await finishRun(db, runId, { status: 'errore', error: String(err?.stack ?? err) });
        throw err;
    }
}
