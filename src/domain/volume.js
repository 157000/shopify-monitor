/**
 * Estrazione deterministica del volume dal testo (titolo prodotto o variante) e calcolo del prezzo al litro.
 *
 * È un'euristica trasparente, non un'interpretazione AI: ogni risultato riporta il testo da cui è stato
 * ricavato. Se il testo è ambiguo (più volumi diversi senza indicazione di confezione multipla), il volume
 * non viene stimato: meglio un dato mancante che un €/L sbagliato.
 */

const UNIT_TO_ML = {
    ml: 1,
    cl: 10,
    dl: 100,
    l: 1000,
    lt: 1000,
    ltr: 1000,
    litro: 1000,
    litri: 1000,
    liter: 1000,
    liters: 1000,
    litre: 1000,
    litres: 1000,
    'fl oz': 29.5735,
    'fl. oz': 29.5735,
    floz: 29.5735,
    oz: 29.5735,
};

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(fl\.?\s?oz|floz|oz|ml|cl|dl|ltr|lt|litri|litro|liters?|litres?|l)`;
const COUNT_WORDS = String.raw`(?:bottiglie|bottiglia|bottles?|lattine|lattina|latte|latta|tins?|cans?|pz|pezzi|pcs)`;

const MULTI_PATTERNS = [
    // "3 x 250 ml", "3x250ml", "6 × 0,5 l"
    new RegExp(String.raw`(\d+)\s*[x×]\s*${NUM}\s*${UNIT}(?![a-z])`, 'gi'),
    // "250 ml x 3"
    new RegExp(String.raw`${NUM}\s*${UNIT}\s*[x×]\s*(\d+)(?![\d.,])`, 'gi'),
    // "3 bottiglie da 250 ml", "2 tins of 500ml"
    new RegExp(String.raw`(\d+)\s*${COUNT_WORDS}\s*(?:da|di|of|x)?\s*${NUM}\s*${UNIT}(?![a-z])`, 'gi'),
];
const SINGLE_PATTERN = new RegExp(String.raw`(?<![\w.,])${NUM}\s*${UNIT}(?![a-z])`, 'gi');

const MIN_ML = 5;
const MAX_ML = 30000;

function toNumber(raw) {
    return Number(String(raw).replace(',', '.'));
}

function unitFactor(unit) {
    const key = unit.toLowerCase().replace(/\s+/g, ' ');
    return UNIT_TO_ML[key] ?? UNIT_TO_ML[key.replace(/\s/g, '')] ?? null;
}

/**
 * @returns {{ ml: number, note: string } | { ml: null, note: string }}
 */
export function parseVolume(text) {
    if (!text) return { ml: null, note: 'testo assente' };
    const source = String(text);

    for (const [index, pattern] of MULTI_PATTERNS.entries()) {
        pattern.lastIndex = 0;
        const match = pattern.exec(source);
        if (!match) continue;
        let count;
        let amount;
        let unit;
        if (index === 1) {
            [, amount, unit, count] = match;
        } else {
            [, count, amount, unit] = match;
        }
        const factor = unitFactor(unit);
        const ml = Math.round(Number(count) * toNumber(amount) * factor);
        if (factor && ml >= MIN_ML && ml <= MAX_ML && Number(count) > 0) {
            return { ml, note: `confezione multipla da "${match[0].trim()}"${/oz/i.test(unit) ? ' (fl oz US)' : ''}` };
        }
    }

    SINGLE_PATTERN.lastIndex = 0;
    const volumes = new Map();
    for (const match of source.matchAll(SINGLE_PATTERN)) {
        const factor = unitFactor(match[2]);
        if (!factor) continue;
        const ml = Math.round(toNumber(match[1]) * factor);
        if (ml < MIN_ML || ml > MAX_ML) continue;
        volumes.set(ml, match[0].trim());
    }
    if (volumes.size === 1) {
        const [[ml, raw]] = volumes;
        return { ml, note: `da "${raw}"${/oz/i.test(raw) ? ' (fl oz US)' : ''}` };
    }
    if (volumes.size > 1) {
        return { ml: null, note: `ambiguo: più volumi nel testo (${[...volumes.values()].join(', ')})` };
    }
    return { ml: null, note: 'volume non indicato nel testo' };
}

export function pricePerLiterCents(priceCents, ml) {
    if (priceCents === null || priceCents === undefined || !ml) return null;
    return Math.round((priceCents * 1000) / ml);
}
