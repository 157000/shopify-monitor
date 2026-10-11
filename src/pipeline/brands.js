import fs from 'node:fs';
import YAML from 'yaml';
import { z } from 'zod';
import { detectPlatform } from '../collectors/detect.js';

/**
 * Sincronizza l'universo competitivo (config/brands.yaml) con il database.
 * Le fonti tolte dal file vengono disattivate, non cancellate: lo storico resta consultabile.
 */

export const BRAND_GROUPS = ['concorrente_diretto', 'gastronomico_premium', 'lifestyle_lusso', 'operatore_commerciale'];

// Composizione iniziale suggerita dal progetto (§3.1): indicativa, non vincolante.
export const TARGET_COMPOSITION = {
    concorrente_diretto: 15,
    gastronomico_premium: 5,
    lifestyle_lusso: 5,
    operatore_commerciale: 5,
};

const SourceSchema = z.object({
    kind: z.enum(['shopify', 'woocommerce', 'web_page', 'manual_import']),
    url: z.url(),
    label: z.string().optional().nullable(),
    enabled: z.boolean().optional().default(true),
    min_interval_hours: z.number().int().positive().optional().default(24),
    terms_note: z.string().optional().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'codice ISO 4217, es. EUR').optional().nullable(),
});

const BrandSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/, 'usa solo lettere minuscole, numeri e trattini'),
    name: z.string().min(1),
    group: z.enum(BRAND_GROUPS),
    country: z.string().optional().nullable(),
    price_band: z.string().optional().nullable(),
    positioning: z.string().optional().nullable(),
    main_products: z.array(z.string()).optional().default([]),
    sales_channels: z.array(z.string()).optional().default([]),
    website: z.url().optional().nullable(),
    social: z.record(z.string(), z.string()).optional().default({}),
    notes: z.string().optional().nullable(),
    active: z.boolean().optional().default(true),
    sources: z.array(SourceSchema).optional().default([]),
});

const FileSchema = z.object({ brands: z.array(BrandSchema) });

export function loadBrandsFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File dei marchi non trovato: ${filePath}. Copia config/brands.example.yaml in config/brands.yaml e compilalo.`);
    }
    const parsed = FileSchema.safeParse(YAML.parse(fs.readFileSync(filePath, 'utf8')));
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`File dei marchi non valido (${filePath}):\n${issues}`);
    }
    const slugs = parsed.data.brands.map((b) => b.slug);
    const duplicates = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (duplicates.length) throw new Error(`Slug duplicati nel file dei marchi: ${[...new Set(duplicates)].join(', ')}`);
    return parsed.data.brands;
}

export async function syncBrands(db, brands) {
    return db.transaction(async (tx) => {
        const summary = { marchi: 0, fonti: 0, fonti_disattivate: 0 };
        for (const b of brands) {
            const brand = await tx.one(
                `INSERT INTO brands (slug, name, brand_group, country, price_band, positioning, main_products,
                                     sales_channels, website, social, notes, active)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name, brand_group = EXCLUDED.brand_group, country = EXCLUDED.country,
                    price_band = EXCLUDED.price_band, positioning = EXCLUDED.positioning,
                    main_products = EXCLUDED.main_products, sales_channels = EXCLUDED.sales_channels,
                    website = EXCLUDED.website, social = EXCLUDED.social, notes = EXCLUDED.notes,
                    active = EXCLUDED.active, updated_at = now()
                 RETURNING id`,
                [b.slug, b.name, b.group, b.country ?? null, b.price_band ?? null, b.positioning ?? null,
                    b.main_products, b.sales_channels, b.website ?? null, JSON.stringify(b.social), b.notes ?? null, b.active],
            );
            summary.marchi++;

            const keep = [];
            for (const s of b.sources) {
                const source = await tx.one(
                    `INSERT INTO sources (brand_id, kind, url, label, enabled, min_interval_hours, terms_note, currency_declared)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     ON CONFLICT (brand_id, kind, url) DO UPDATE SET
                        label = EXCLUDED.label, enabled = EXCLUDED.enabled,
                        min_interval_hours = EXCLUDED.min_interval_hours, terms_note = EXCLUDED.terms_note,
                        currency_declared = EXCLUDED.currency_declared
                     RETURNING id`,
                    [brand.id, s.kind, s.url, s.label ?? null, s.enabled, s.min_interval_hours, s.terms_note ?? null,
                        s.currency ?? null],
                );
                keep.push(source.id);
                summary.fonti++;
            }
            const disabled = await tx.query(
                'UPDATE sources SET enabled = false WHERE brand_id = $1 AND enabled AND NOT (id = ANY($2::int[]))',
                [brand.id, keep],
            );
            summary.fonti_disattivate += disabled.rowCount;
        }
        return summary;
    });
}

export function compositionReport(brands) {
    const counts = Object.fromEntries(BRAND_GROUPS.map((g) => [g, 0]));
    for (const b of brands) if (b.active) counts[b.group]++;
    return BRAND_GROUPS.map((g) => ({ gruppo: g, attivi: counts[g], obiettivo_indicativo: TARGET_COMPOSITION[g] }));
}

/** Per i marchi con sito ma senza fonti e-commerce, propone il raccoglitore adatto. */
export async function detectSources(db, http, { brandSlug = null } = {}) {
    const { rows } = await db.query(
        `SELECT b.id, b.slug, b.website FROM brands b
          WHERE b.active AND b.website IS NOT NULL AND ($1::text IS NULL OR b.slug = $1)
            AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.brand_id = b.id AND s.kind IN ('shopify', 'woocommerce'))
          ORDER BY b.slug`,
        [brandSlug],
    );
    const results = [];
    for (const brand of rows) {
        const detection = await detectPlatform(brand.website, http);
        results.push({ slug: brand.slug, website: brand.website, ...detection });
    }
    return results;
}
