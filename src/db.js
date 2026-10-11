import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// I bigint (bigserial) arrivano come stringhe di default: per gli ID di questo progetto i Number sono sufficienti.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));

export function createDb(databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });

    const db = {
        pool,
        query: (text, params) => pool.query(text, params),

        async one(text, params) {
            const { rows } = await pool.query(text, params);
            return rows[0] ?? null;
        },

        async transaction(fn) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const tx = {
                    query: (text, params) => client.query(text, params),
                    async one(text, params) {
                        const { rows } = await client.query(text, params);
                        return rows[0] ?? null;
                    },
                };
                const result = await fn(tx);
                await client.query('COMMIT');
                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },

        close: () => pool.end(),
    };
    return db;
}

/** Applica in ordine le migrazioni SQL non ancora eseguite. Restituisce l'elenco di quelle applicate. */
export async function migrate(db, migrationsDir) {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await db.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const newlyApplied = [];
    for (const file of files) {
        if (applied.has(file)) continue;
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await db.transaction(async (tx) => {
            await tx.query(sql);
            await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        });
        newlyApplied.push(file);
    }
    return newlyApplied;
}
