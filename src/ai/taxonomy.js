import fs from 'node:fs';
import YAML from 'yaml';

export function loadTaxonomy(filePath) {
    const data = YAML.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data?.version || !data?.dimensions) throw new Error(`Tassonomia non valida: ${filePath} (servono "version" e "dimensions")`);

    const dimensions = Object.entries(data.dimensions).map(([key, dim]) => ({
        key,
        description: dim.description ?? '',
        values: Object.entries(dim.values ?? {}).map(([value, description]) => ({ value, description })),
    }));
    const allowed = new Set(dimensions.flatMap((d) => d.values.map((v) => `${d.key}:${v.value}`)));

    return {
        version: String(data.version),
        dimensions,
        sensitiveClaims: data.sensitive_claims ?? [],
        isAllowed: (dimension, value) => allowed.has(`${dimension}:${value}`),
        dimensionKeys: dimensions.map((d) => d.key),
        allValues: [...new Set(dimensions.flatMap((d) => d.values.map((v) => v.value)))],
    };
}

export function renderTaxonomy(taxonomy) {
    return taxonomy.dimensions
        .map((d) => [`- ${d.key}: ${d.description}`, ...d.values.map((v) => `  - ${v.value}: ${v.description}`)].join('\n'))
        .join('\n');
}
