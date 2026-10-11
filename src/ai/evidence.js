/**
 * Verifica delle evidenze: ogni etichetta AI deve poggiare su una citazione letterale del testo osservato.
 * È il meccanismo che impedisce all'AI di "trasformare supposizioni in fatti" (§3.3 del progetto).
 */

export function normalizeForMatch(text) {
    return String(text ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[‘’‚‛′`´]/g, "'")
        .replace(/[“”„‟″«»]/g, '"')
        .replace(/[–—−]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanQuote(quote) {
    return normalizeForMatch(quote)
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/^(\.\.\.|…)\s*/, '')
        .replace(/\s*(\.\.\.|…)$/, '');
}

export const MIN_EVIDENCE_CHARS = 3;
export const MIN_CONFIDENCE = 0.6;

/**
 * @param {Array<{dimensione, valore, evidenza, confidenza}>} labels
 * @param {string} sourceText  il testo esatto mostrato al modello
 * @param {object} taxonomy
 */
export function verifyLabels(labels, sourceText, taxonomy) {
    const haystack = normalizeForMatch(sourceText);
    const accepted = [];
    const rejected = [];
    const seen = new Set();

    for (const label of labels) {
        const confidence = Math.min(1, Math.max(0, Number(label.confidenza) || 0));
        const quote = cleanQuote(label.evidenza);
        const key = `${label.dimensione}:${label.valore}`;
        let reason = null;

        if (!taxonomy.isAllowed(label.dimensione, label.valore)) reason = 'coppia dimensione/valore non prevista dalla tassonomia';
        else if (quote.length < MIN_EVIDENCE_CHARS) reason = 'evidenza assente o troppo breve';
        else if (!haystack.includes(quote)) reason = 'citazione non trovata nel testo osservato';
        else if (confidence < MIN_CONFIDENCE) reason = `confidenza inferiore a ${MIN_CONFIDENCE}`;
        else if (seen.has(key)) reason = 'etichetta duplicata';

        const entry = { dimensione: label.dimensione, valore: label.valore, evidenza: label.evidenza, confidenza: confidence };
        if (reason) rejected.push({ ...entry, motivo: reason });
        else {
            accepted.push(entry);
            seen.add(key);
        }
    }
    return { accepted, rejected };
}
