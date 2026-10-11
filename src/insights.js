/**
 * Il passaggio da ipotesi a decisione è umano (§3.3, §17): il sistema propone, una persona decide.
 * Ogni decisione è registrata come insight di livello "decisione", collegato all'ipotesi da cui nasce.
 */

export const DECISION_STATES = ['approvata', 'scartata', 'da_approfondire', 'in_test', 'conclusa'];

export async function listInsights(db, { status = null, limit = 30 } = {}) {
    const { rows } = await db.query(
        `SELECT id, level, title, status, created_by, created_at, evidence, details->>'tipo' AS tipo
           FROM insights WHERE ($1::text IS NULL OR status = $1)
          ORDER BY created_at DESC LIMIT $2`,
        [status, limit],
    );
    return rows;
}

export async function decideInsight(db, { id, status, note, decidedBy }) {
    if (!DECISION_STATES.includes(status)) {
        throw new Error(`Stato non valido "${status}". Valori ammessi: ${DECISION_STATES.join(', ')}`);
    }
    if (!note?.trim()) throw new Error('Serve una nota che motivi la decisione (--nota "...")');
    return db.transaction(async (tx) => {
        const insight = await tx.one('SELECT * FROM insights WHERE id = $1 FOR UPDATE', [id]);
        if (!insight) throw new Error(`Insight #${id} non trovato`);
        await tx.query('UPDATE insights SET status = $2, decided_at = now(), decided_by = $3 WHERE id = $1', [id, status, decidedBy]);
        const decision = await tx.one(
            `INSERT INTO insights (level, title, body, evidence, details, status, created_by, parent_id, decided_at, decided_by)
             VALUES ('decisione', $1, $2, $3, $4, $5, 'umano', $6, now(), $7) RETURNING id`,
            [`Decisione su #${id}: ${insight.title}`, note, JSON.stringify(insight.evidence),
                JSON.stringify({ stato: status }), status, id, decidedBy],
        );
        return decision.id;
    });
}
