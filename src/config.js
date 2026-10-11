import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carica .env se presente (Node >= 21.7). Le variabili già definite nell'ambiente hanno la precedenza.
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

function intEnv(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value)) throw new Error(`La variabile ${name} deve essere un numero intero (valore: "${raw}")`);
    return value;
}

function floatEnv(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number.parseFloat(raw);
    if (Number.isNaN(value)) throw new Error(`La variabile ${name} deve essere un numero (valore: "${raw}")`);
    return value;
}

function resolvePath(value) {
    return path.isAbsolute(value) ? value : path.join(ROOT_DIR, value);
}

export function loadSettings() {
    return {
        databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/tenuta_grieci',

        http: {
            // Identificazione trasparente: chi gestisce un sito deve poter capire chi lo visita e come contattarlo.
            userAgent: process.env.USER_AGENT
                ?? `TenutaGrieciIntelligence/0.1 (monitoraggio di pagine pubbliche${process.env.CONTACT_URL ? `; ${process.env.CONTACT_URL}` : ''})`,
            delayPerHostMs: intEnv('REQUEST_DELAY_MS', 3000),
            timeoutMs: intEnv('REQUEST_TIMEOUT_MS', 20000),
            maxRetries: intEnv('REQUEST_MAX_RETRIES', 2),
            maxRetryAfterMs: intEnv('REQUEST_MAX_RETRY_AFTER_MS', 120000),
        },

        collect: {
            maxPages: intEnv('COLLECT_MAX_PAGES', 20),
            // Se un catalogo "perde" più di questa quota di prodotti in un colpo solo, non si segnano rimozioni:
            // è più probabile un problema di raccolta (blocco, cambio di schema) che un crollo reale del catalogo.
            suspiciousDropRatio: floatEnv('COLLECT_SUSPICIOUS_DROP_RATIO', 0.5),
        },

        ai: {
            // Modello economico per classificazioni semplici, modello più capace per l'analisi strategica (§18 del progetto).
            classifyModel: process.env.AI_MODEL_CLASSIFY ?? 'claude-haiku-5-5',
            strategyModel: process.env.AI_MODEL_STRATEGY ?? 'claude-opus-5-5',
            classifyBatchLimit: intEnv('AI_CLASSIFY_LIMIT', 50),
            monthlyBudgetUsd: floatEnv('AI_MONTHLY_BUDGET_USD', 20),
            maxInputChars: intEnv('AI_MAX_INPUT_CHARS', 12000),
        },

        paths: {
            brandsFile: resolvePath(process.env.BRANDS_FILE ?? 'config/brands.yaml'),
            taxonomyFile: resolvePath(process.env.TAXONOMY_FILE ?? 'config/taxonomy.yaml'),
            knowledgeBaseFile: resolvePath(process.env.KNOWLEDGE_BASE_FILE ?? 'config/tenuta-grieci.md'),
            pricingFile: resolvePath(process.env.AI_PRICING_FILE ?? 'config/ai-pricing.json'),
            reportsDir: resolvePath(process.env.REPORTS_DIR ?? 'reports'),
            migrationsDir: path.join(ROOT_DIR, 'db', 'migrations'),
        },

        health: {
            staleHours: intEnv('HEALTH_STALE_HOURS', 48),
            failureThreshold: intEnv('HEALTH_FAILURE_THRESHOLD', 3),
        },

        alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || null,
    };
}
