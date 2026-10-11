/**
 * Notifiche via webhook (Slack o Discord). Il formato del corpo dipende dal servizio.
 */
export async function sendAlert(webhookUrl, text, { fetchImpl = globalThis.fetch } = {}) {
    if (!webhookUrl) return false;
    const { hostname } = new URL(webhookUrl);
    const isDiscord = /(^|\.)discord(app)?\.com$/.test(hostname);
    const body = isDiscord ? { content: text.slice(0, 1990) } : { text };
    const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Webhook di notifica: HTTP ${response.status}`);
    return true;
}
