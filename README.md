# Tenuta Grieci — Marketing Intelligence

Sistema di **competitive intelligence** per Tenuta Grieci: monitora i marchi di riferimento (concorrenti diretti, marchi gastronomici premium, lifestyle e lusso, operatori commerciali), conserva lo storico di prodotti, prezzi e comunicazione, classifica i contenuti con l'AI **solo su evidenze verificate nel testo** e produce ogni settimana un report breve con fonti, opportunità e ipotesi da testare.

È la prima fase del progetto descritto in [docs/PROGETTO.md](docs/PROGETTO.md): un'infrastruttura che collega
**osservazioni → interpretazioni → ipotesi → decisioni**, mantenendo ogni livello distinguibile e tracciabile.
Cosa è implementato, le scelte tecniche e i limiti noti: [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md).

## Cosa fa

| Capacità | Dettaglio |
|---|---|
| Raccolta | Cataloghi **Shopify** e **WooCommerce**, pagine web (homepage, pagine regalo, B2B), import di post, inserzioni e newsletter da fonti consentite |
| Storico | Fotografie append-only: nulla viene sovrascritto, una nuova fotografia solo quando qualcosa cambia |
| Eventi | Nuovi prodotti, variazioni di prezzo, sconti, esauriti, rimozioni, testi e pagine modificati, inserzioni concluse |
| Prezzo al litro | €/L calcolato dal formato indicato nel titolo (500 ml, 3 x 250 ml, 0,75 l…), senza stime se il dato è ambiguo |
| Classificazione AI | Tassonomia versionata (temi, occasioni, formati, leve commerciali, CTA, pubblico); ogni etichetta richiede una citazione letterale che il software verifica |
| Report settimanale | Le 7 sezioni del §3.6, con riferimenti cliccabili alle fonti e livello epistemico dichiarato |
| Ipotesi e decisioni | Ipotesi con esperimento, KPI, criteri di successo e interruzione; la decisione è sempre umana e registrata |
| Governance | robots.txt rispettato, User-Agent esplicito, nessun proxy; costi AI tracciati con budget; controllo di salute con avvisi Slack/Discord |

## Avvio rapido

Requisiti: Node.js 22+, PostgreSQL 14+ (oppure Docker).

```bash
npm install
cp .env.example .env                        # imposta DATABASE_URL e, per l'AI, ANTHROPIC_API_KEY
docker compose up -d                        # opzionale: PostgreSQL locale
node src/cli.js db:migrate

cp config/brands.example.yaml config/brands.yaml   # inserisci i marchi reali (nessun dato inventato)
node src/cli.js brands:sync
node src/cli.js sources:detect              # suggerisce shopify / woocommerce / web_page per ogni sito

node src/cli.js collect                     # prima raccolta = baseline
node src/cli.js classify                    # richiede credenziali Anthropic
node src/cli.js report:weekly               # report in reports/
node src/cli.js health
```

Senza credenziali AI il sistema funziona comunque: raccolta, storico, eventi, prezzo al litro e report (sezioni 1–4 e 7) sono deterministici; le sezioni 5–6 indicano che l'analisi AI non è stata eseguita.

Compila anche [config/tenuta-grieci.md](config/tenuta-grieci.md): è l'unica fonte da cui l'AI può trarre informazioni sul marchio.

## Comandi

```
db:migrate                  crea o aggiorna lo schema
brands:sync                 carica config/brands.yaml (e mostra la composizione rispetto ai 15/5/5/5 del progetto)
sources:detect              individua la piattaforma dei siti (stampa YAML da incollare)
collect [--brand slug] [--source id] [--force]
import:content <file>       contenuti/inserzioni da JSON o CSV (vedi examples/)
classify [--limit n]
report:weekly [--from AAAA-MM-GG] [--to AAAA-MM-GG] [--no-ai]
pipeline [--no-ai]          collect → classify → report → health
insights:list [--stato s]
insights:decide <id> --stato approvata|scartata|da_approfondire|in_test|conclusa --nota "..." [--da nome]
health [--notify]           exit code 2 se lo stato è critico
status
```

Pianificazione con cron o n8n: [docs/AUTOMAZIONE.md](docs/AUTOMAZIONE.md).

## Struttura

```
config/            universo competitivo, tassonomia, base di conoscenza, listino AI
db/migrations/     schema PostgreSQL
src/http/          client HTTP rispettoso (robots.txt, ritmo per sito, Retry-After)
src/collectors/    Shopify, WooCommerce, pagine web, rilevamento piattaforma
src/domain/        normalizzazione prodotti, volume e €/L, confronto tra fotografie
src/pipeline/      raccolta, sincronizzazione marchi, import contenuti
src/ai/            client Anthropic, classificazione, verifica evidenze, sintesi strategica
src/reports/       report settimanale
src/health/        controllo di salute (Workflow 8)
test/              test unitari e d'integrazione (negozio finto locale + PostgreSQL)
```

## Test

```bash
npm test                                                     # test unitari
TEST_DATABASE_URL=postgres://... npm test                    # anche integrazione (lo schema del DB di test viene ricreato)
```

## Origine

Il repository nasce da un fork di [Dam998/shopify-monitor](https://github.com/Dam998/shopify-monitor) (licenza MIT, vedi [LICENSE](LICENSE)), un monitor di prodotti Shopify con notifiche Discord. Dell'originale resta l'idea di leggere il catalogo pubblico `/products.json`; il resto è stato riscritto per gli obiettivi di Tenuta Grieci, eliminando la rotazione di proxy usata per aggirare i blocchi dei siti. Il codice originale resta consultabile nella cronologia git.
