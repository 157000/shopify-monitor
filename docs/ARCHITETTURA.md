# Architettura — cosa è implementato e come

Questo repository realizza la **Fase 1 (Intelligence Foundation)** e il **Modulo A — Competitive Intelligence** del [progetto](PROGETTO.md), con le fondamenta che servono ai moduli successivi: database centrale, registro delle esecuzioni, separazione tra dati osservati e interpretazioni, registro delle ipotesi e delle decisioni, controllo dei costi e della salute del sistema.

È la "versione funzionante della Competitive Intelligence" raccomandata nel consiglio operativo del progetto: monitora un gruppo selezionato di marchi, archivia, classifica e produce un rapporto settimanale con fonti verificabili e ipotesi da testare.

## Dal documento al codice

| Livello del progetto (§2) | Implementazione |
|---|---|
| 1. Data Sources | Cataloghi Shopify (`/products.json`), WooCommerce (Store API), pagine web pubbliche, import di contenuti social / inserzioni / newsletter |
| 2. Data Collection | `src/collectors/*`, `src/http/politeFetch.js` (robots.txt, ritmo per host, Retry-After), `src/pipeline/collect.js` |
| 3. Data Infrastructure | PostgreSQL, `db/migrations/001_iniziale.sql`: fotografie append-only, eventi, registro esecuzioni |
| 4. Intelligence | `src/ai/classify.js`: classificazione con tassonomia versionata ed evidenze verificate |
| 5. Decision Engine | `src/ai/synthesize.js` + `src/insights.js`: ipotesi con punteggi §5.2, decisione umana registrata |
| 6. Execution | Fuori ambito in questa fase (moduli E–F) |
| 7. Measurement | Fuori ambito in questa fase (moduli H, J) |
| 8. Learning | Base pronta: `insights` collega ipotesi → decisione; il registro esperimenti è il passo successivo |
| Workflow 8 — System Health | `src/health/check.js` |

## I quattro livelli epistemici (§3.3) nel database

```
OSSERVATO            product_snapshots, page_snapshots, content, content_snapshots
   │                 └─ events: cambiamenti osservati (prezzo, sconto, novità, testo, pagina…)
   ▼
INTERPRETAZIONE      classifications: etichette AI con citazione letterale verificata nel testo
   ▼
IPOTESI              insights (level = 'ipotesi', created_by = 'ai'): ogni ipotesi cita E…/C…/K…
   ▼
DECISIONE            insights (level = 'decisione', created_by = 'umano', parent_id → ipotesi)
```

Il dato osservato non viene mai sovrascritto: una nuova fotografia si aggiunge solo quando il contenuto cambia (hash), lo storico resta interrogabile. Le classificazioni possono essere rifatte (nuova versione di prompt o tassonomia) o rifiutate senza toccare i dati.

## Scelte di progetto e perché

**Raccolta rispettosa, nessuna elusione.** Il monitor originale da cui nasce il repository ruotava proxy per aggirare i blocchi dei siti. Questa funzione è stata rimossa: il sistema rispetta robots.txt (RFC 9309: robots assente → nessun limite; server in errore → nessun accesso), si identifica con uno User-Agent esplicito, fa una richiesta alla volta per sito con pausa configurabile (default 3 s), rispetta `Retry-After` e rinuncia se l'attesa richiesta è eccessiva. Se una fonte non vuole essere letta, il report lo segnala come informazione mancante. È coerente con §3.2 (condizioni d'uso) e §17 (governance), e protegge la reputazione di un marchio che punta al lusso.

**Prima rilevazione = baseline, non novità.** Alla prima raccolta di una fonte tutti i prodotti sono registrati ma marcati `is_baseline`: il report non scambia l'intero catalogo per "nuovi prodotti".

**Rimozioni solo con prove sufficienti.** Un prodotto risulta rimosso solo se il catalogo è stato letto per intero e il calo non è anomalo (default: oltre il 50% di prodotti spariti in un colpo → si sospetta un problema di raccolta, si registra un avviso e il controllo di salute lo segnala).

**Prezzo al litro deterministico.** Per confrontare il posizionamento di prezzo (la logica "vino di pregio" applicata all'olio) il sistema ricava il volume dal titolo con regole esplicite (`src/domain/volume.js`): 500 ml, 0,75 l, 3 x 250 ml, 16.9 fl oz… Se il testo è ambiguo il volume resta vuoto — meglio un dato mancante che un €/L sbagliato — e il report conta i prodotti esclusi. Il riferimento è il "formato d'ingresso": la variante più economica con volume riconosciuto.

**Evidenze verificate per ogni etichetta AI.** Il modello deve allegare a ogni etichetta una citazione letterale del testo; il software controlla che la citazione esista davvero (normalizzando spazi, maiuscole e virgolette tipografiche). Le etichette senza riscontro, fuori tassonomia o con confidenza < 0,6 finiscono in `rejected_labels` con il motivo. Se la quota di scarti supera il 30% il controllo di salute chiede di rivedere prompt o tassonomia.

**Riferimenti verificati per ogni ipotesi.** La sintesi settimanale riceve eventi, contenuti e classificazioni con un riferimento (`E12`, `C3`, `K5`); le ipotesi che citano riferimenti inesistenti vengono scartate e il report lo dichiara nella sezione 7.

**Contenuti esterni = dati, non istruzioni (§17).** Il testo dei concorrenti è racchiuso in un blocco delimitato, i tag che potrebbero chiuderlo vengono neutralizzati, il modello non ha strumenti (può solo rispondere secondo uno schema) e l'output è validato. Anche un testo malevolo non può far eseguire azioni.

**Due modelli, come chiede §18.** Classificazioni semplici con un modello economico (`AI_MODEL_CLASSIFY`, default `claude-haiku-5-5`, effort `low`), sintesi strategica con un modello più capace (`AI_MODEL_STRATEGY`, default `claude-opus-5-5`, effort `high`). Sul modello strategico è attivo il fallback lato server (`fallbacks: "default"`): se la richiesta venisse rifiutata dai filtri di sicurezza, l'API la ripete su un modello alternativo invece di fallire. Ogni chiamata è registrata in `ai_usage` con token e costo stimato; il controllo di salute avvisa all'80% del budget mensile e segnala come critico il superamento.

**Niente analisi pagate due volte.** I prezzi sono esclusi dal testo da classificare (sono già dati osservati); se una scheda cambia solo nel prezzo, la classificazione precedente viene riutilizzata tramite l'hash del testo, senza nuove chiamate.

**Il file è la fonte di verità dell'universo competitivo.** `config/brands.yaml` è versionabile e leggibile; `brands:sync` lo porta nel database. Le fonti rimosse dal file vengono disattivate, non cancellate.

## Modello dati

| Tabella | Contenuto |
|---|---|
| `brands`, `sources` | Universo competitivo, fonti, stato di accesso, verifica delle condizioni d'uso (`terms_note`), valuta |
| `products`, `product_snapshots` | Identità del prodotto e fotografie append-only con payload originale (`raw`) |
| `page_snapshots` | Fotografie del testo delle pagine monitorate |
| `content`, `content_snapshots` | Contenuti e inserzioni importati, con storico delle metriche e stato attivo/non attivo |
| `events` | Cambiamenti osservati, con fonte e flag baseline |
| `classifications` | Interpretazioni AI con evidenze accettate e scartate, versioni di prompt e tassonomia |
| `insights` | Ipotesi (AI) e decisioni (umane), con riferimenti alle evidenze |
| `reports` | Report generati (anche su file in `reports/`) |
| `runs`, `ai_usage` | Registro delle esecuzioni e dei costi AI |

Le tabelle Campaigns, Experiments, Creative Assets, Performance, Orders e Customers del §14 appartengono ai moduli successivi e verranno aggiunte con nuove migrazioni.

## Verifiche fatte e limiti noti

Per ogni assunzione tecnica è indicato quanto è verificata.

| Assunzione | Stato |
|---|---|
| Shopify espone il catalogo pubblico su `/products.json` (paginazione `limit`/`page`) | Comportamento su cui si basava già il monitor originale; non è un'API documentata da Shopify, quindi il collector controlla lo schema e segnala cambi di formato |
| `/meta.json` di Shopify riporta la valuta | **Non verificato** su documentazione ufficiale: è usato solo come tentativo; la valuta può essere dichiarata in `brands.yaml` e, se manca, il report la segnala come non verificata |
| WooCommerce Store API è pubblica e non richiede autenticazione | Confermato dalla [documentazione WooCommerce](https://developer.woocommerce.com/docs/apis/store-api/) |
| Prezzi dello Store API in unità minori (`currency_minor_unit`) | Confermato da fonti di terze parti; header `X-WP-TotalPages` non verificato → se assente, la paginazione si ferma alla prima pagina incompleta |
| Prodotti variabili WooCommerce | Lo Store API restituisce l'intervallo di prezzo, non il prezzo di ogni variante: le variazioni per variante non sono rilevabili |
| Meta Ad Library API | Secondo fonti di terze parti espone le inserzioni distribuite nell'UE per circa un anno e richiede la verifica d'identità: **da verificare sulla documentazione Meta** prima di costruire un collector automatico. Nel frattempo si usa `import:content` |
| Claim salutistici sui polifenoli | Reg. (UE) 432/2012: indicazione ammessa solo per oli con almeno 5 mg di idrossitirosolo e derivati per 20 g, con avvertenza sull'assunzione giornaliera di 20 g (fonti secondarie: [CORDIS, Commissione europea](https://cordis.europa.eu/article/id/120839-a-cheap-and-simple-test-to-verify-olive-oilrelated-health-claims), [New Food Magazine](https://newfoodmagazine.com/?p=22720)); verificare il testo consolidato su EUR-Lex prima dell'uso |
| Prezzi dei modelli in `config/ai-pricing.json` | Listino Anthropic al 2026-10-06; i costi di cache di alcuni modelli di riserva sono stime, indicate nel file |
| Shopify Markets | Il prezzo può dipendere dal paese da cui arriva la richiesta: il sistema registra il prezzo servito al server di raccolta |

## Prossimi passi suggeriti

1. **Compilare `config/brands.yaml`** con i 30 marchi e `config/tenuta-grieci.md` con informazioni verificate.
2. **Verifica manuale della prima settimana** (Fase 1, ultimo punto): confrontare a campione eventi e classificazioni con i siti, segnando come `verificato`/`rifiutato` le classificazioni dubbie.
3. **Collector Meta Ad Library** (dopo aver verificato condizioni e accesso all'API) e, se utile, YouTube Data API.
4. **Registro esperimenti** (Modulo D/§13): tabella `experiments` collegata a `insights`, con risultati e conclusioni.
5. **Interfaccia di interrogazione** (§16.3) sopra al database, con risposte vincolate ai dati disponibili.
