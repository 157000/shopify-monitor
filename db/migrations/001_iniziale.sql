-- Tenuta Grieci — Marketing Intelligence
-- Migrazione 001: fondamenta del Modulo A (Competitive Intelligence).
--
-- Principio guida: il dato osservato non viene mai sovrascritto.
--   * Le fotografie (snapshot) sono append-only: una nuova riga solo quando il contenuto cambia.
--   * Gli eventi descrivono cambiamenti osservati (livello "osservazione").
--   * Le classificazioni AI vivono in una tabella separata e possono essere rifatte o rifiutate
--     senza toccare il dato originale (livello "interpretazione").
--   * Ipotesi e decisioni sono registrate in `insights`, con i riferimenti alle evidenze.

-- ---------------------------------------------------------------------------
-- Universo competitivo
-- ---------------------------------------------------------------------------
CREATE TABLE brands (
    id              serial PRIMARY KEY,
    slug            text NOT NULL UNIQUE,
    name            text NOT NULL,
    brand_group     text NOT NULL CHECK (brand_group IN (
                        'concorrente_diretto',
                        'gastronomico_premium',
                        'lifestyle_lusso',
                        'operatore_commerciale')),
    country         text,
    price_band      text,
    positioning     text,           -- posizionamento dichiarato dal marchio (citazione o sintesi umana)
    main_products   text[] NOT NULL DEFAULT '{}',
    sales_channels  text[] NOT NULL DEFAULT '{}',
    website         text,
    social          jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes           text,
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sources (
    id                    serial PRIMARY KEY,
    brand_id              integer NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    kind                  text NOT NULL CHECK (kind IN ('shopify', 'woocommerce', 'web_page', 'manual_import')),
    url                   text NOT NULL,
    label                 text,
    enabled               boolean NOT NULL DEFAULT true,
    min_interval_hours    integer NOT NULL DEFAULT 24 CHECK (min_interval_hours >= 1),
    terms_note            text,     -- esito della verifica delle condizioni d'uso della fonte
    currency_declared     text,     -- valuta verificata da una persona (prevale su quella rilevata)
    currency              text,     -- valuta rilevata automaticamente (es. /meta.json di Shopify); NULL = non verificata
    access_status         text NOT NULL DEFAULT 'non_verificato' CHECK (access_status IN (
                              'non_verificato', 'ok', 'bloccato_robots', 'errore', 'non_supportato')),
    last_attempt_at       timestamptz,
    last_success_at       timestamptz,
    consecutive_failures  integer NOT NULL DEFAULT 0,
    last_error            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (brand_id, kind, url)
);

-- ---------------------------------------------------------------------------
-- Registro delle esecuzioni (Workflow Logs)
-- ---------------------------------------------------------------------------
CREATE TABLE runs (
    id           bigserial PRIMARY KEY,
    workflow     text NOT NULL,
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    status       text NOT NULL DEFAULT 'in_corso' CHECK (status IN ('in_corso', 'ok', 'parziale', 'errore')),
    stats        jsonb NOT NULL DEFAULT '{}'::jsonb,
    error        text
);
CREATE INDEX runs_workflow_started_idx ON runs (workflow, started_at DESC);

-- ---------------------------------------------------------------------------
-- Prodotti e storico (e-commerce dei marchi monitorati)
-- ---------------------------------------------------------------------------
CREATE TABLE products (
    id                   bigserial PRIMARY KEY,
    source_id            integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    brand_id             integer NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    external_id          text NOT NULL,
    handle               text,
    url                  text,
    first_seen_at        timestamptz NOT NULL,
    last_seen_at         timestamptz NOT NULL,
    removed_at           timestamptz,
    current_snapshot_id  bigint,
    UNIQUE (source_id, external_id)
);

CREATE TABLE product_snapshots (
    id                     bigserial PRIMARY KEY,
    product_id             bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    run_id                 bigint REFERENCES runs(id) ON DELETE SET NULL,
    observed_at            timestamptz NOT NULL,
    content_hash           text NOT NULL,
    title                  text NOT NULL,
    description_text       text,
    product_type           text,
    vendor                 text,
    tags                   text[] NOT NULL DEFAULT '{}',
    currency               text,
    min_price_cents        integer,
    max_price_cents        integer,
    on_sale                boolean NOT NULL DEFAULT false,
    max_discount_pct       numeric(5, 2),
    available              boolean,
    -- Valori derivati in modo deterministico dal testo (non dall'AI): vedi src/domain/volume.js
    volume_ml              integer,
    price_per_liter_cents  integer,
    volume_note            text,
    variants               jsonb NOT NULL DEFAULT '[]'::jsonb,
    image_url              text,
    image_count            integer NOT NULL DEFAULT 0,
    published_at           timestamptz,
    raw                    jsonb NOT NULL      -- payload originale, conservato integralmente
);
CREATE INDEX product_snapshots_product_idx ON product_snapshots (product_id, observed_at DESC);

ALTER TABLE products
    ADD CONSTRAINT products_current_snapshot_fk
    FOREIGN KEY (current_snapshot_id) REFERENCES product_snapshots(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Pagine web monitorate (siti non e-commerce, pagine regalo, pagine B2B, homepage)
-- ---------------------------------------------------------------------------
CREATE TABLE page_snapshots (
    id                bigserial PRIMARY KEY,
    source_id         integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    run_id            bigint REFERENCES runs(id) ON DELETE SET NULL,
    observed_at       timestamptz NOT NULL,
    content_hash      text NOT NULL,
    http_status       integer,
    title             text,
    meta_description  text,
    headings          text[] NOT NULL DEFAULT '{}',
    text_content      text NOT NULL,
    price_mentions    text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX page_snapshots_source_idx ON page_snapshots (source_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- Contenuti e inserzioni (social, Meta Ad Library, newsletter) — importati da fonti consentite
-- ---------------------------------------------------------------------------
CREATE TABLE content (
    id                 bigserial PRIMARY KEY,
    brand_id           integer NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    platform           text NOT NULL,          -- instagram, tiktok, youtube, meta_ads, newsletter, ...
    external_ref       text NOT NULL,          -- ID della piattaforma o URL canonico
    format             text,                   -- reel, post, carosello, video, inserzione, email, ...
    url                text,
    landing_url        text,
    text_content       text,                   -- testo/caption osservato
    media_description  text,                   -- descrizione degli elementi visivi (umana o da import)
    cta_text           text,
    offer_text         text,
    published_at       timestamptz,
    first_observed_at  timestamptz NOT NULL,
    last_observed_at   timestamptz NOT NULL,
    collection_method  text NOT NULL,          -- come è stato raccolto (es. "Meta Ad Library, consultazione manuale")
    raw                jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (platform, external_ref)
);

-- Storico delle metriche pubbliche: una riga per rilevazione, mai sovrascritta.
CREATE TABLE content_snapshots (
    id            bigserial PRIMARY KEY,
    content_id    bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    observed_at   timestamptz NOT NULL,
    metrics       jsonb NOT NULL DEFAULT '{}'::jsonb,
    still_active  boolean,
    UNIQUE (content_id, observed_at)
);

-- ---------------------------------------------------------------------------
-- Eventi: cambiamenti osservati (livello "osservazione")
-- ---------------------------------------------------------------------------
CREATE TABLE events (
    id           bigserial PRIMARY KEY,
    run_id       bigint REFERENCES runs(id) ON DELETE SET NULL,
    brand_id     integer NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    source_id    integer REFERENCES sources(id) ON DELETE CASCADE,
    product_id   bigint REFERENCES products(id) ON DELETE CASCADE,
    content_id   bigint REFERENCES content(id) ON DELETE CASCADE,
    event_type   text NOT NULL,
    observed_at  timestamptz NOT NULL,
    is_baseline  boolean NOT NULL DEFAULT false,   -- prima rilevazione: non è una "novità" di mercato
    summary      text NOT NULL,
    before       jsonb,
    after        jsonb,
    source_url   text
);
CREATE INDEX events_observed_idx ON events (observed_at DESC);
CREATE INDEX events_brand_idx ON events (brand_id, observed_at DESC);

-- ---------------------------------------------------------------------------
-- Classificazioni AI (livello "interpretazione"): separate dal dato originale
-- ---------------------------------------------------------------------------
CREATE TABLE classifications (
    id                bigserial PRIMARY KEY,
    entity_type       text NOT NULL CHECK (entity_type IN ('product_snapshot', 'page_snapshot', 'content')),
    entity_id         bigint NOT NULL,
    model             text NOT NULL,
    prompt_version    text NOT NULL,
    taxonomy_version  text NOT NULL,
    input_hash        text NOT NULL,                       -- hash del testo analizzato: evita di ripagare la stessa analisi
    labels            jsonb NOT NULL DEFAULT '[]'::jsonb,    -- etichette con evidenza verificata nel testo
    rejected_labels   jsonb NOT NULL DEFAULT '[]'::jsonb,    -- etichette scartate: evidenza non trovata
    summary           text,
    confidence        numeric(3, 2),
    status            text NOT NULL DEFAULT 'nuovo' CHECK (status IN ('nuovo', 'verificato', 'rifiutato')),
    review_note       text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    reviewed_at       timestamptz,
    UNIQUE (entity_type, entity_id, prompt_version, taxonomy_version)
);
CREATE INDEX classifications_input_idx ON classifications (input_hash, prompt_version, taxonomy_version);

-- ---------------------------------------------------------------------------
-- Report e insight (ipotesi e decisioni)
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
    id            bigserial PRIMARY KEY,
    run_id        bigint REFERENCES runs(id) ON DELETE SET NULL,
    period_start  timestamptz NOT NULL,
    period_end    timestamptz NOT NULL,
    generated_at  timestamptz NOT NULL DEFAULT now(),
    ai_used       boolean NOT NULL DEFAULT false,
    file_path     text,
    markdown      text NOT NULL
);

CREATE TABLE insights (
    id           bigserial PRIMARY KEY,
    level        text NOT NULL CHECK (level IN ('osservazione', 'interpretazione', 'ipotesi', 'decisione')),
    title        text NOT NULL,
    body         text NOT NULL,
    evidence     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "tipo": "evento", "id": 12, "url": "..." }, ...]
    details      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- esperimento, KPI, criterio di successo, rischi...
    status       text NOT NULL DEFAULT 'proposta' CHECK (status IN (
                     'proposta', 'approvata', 'scartata', 'da_approfondire', 'in_test', 'conclusa')),
    created_by   text NOT NULL CHECK (created_by IN ('sistema', 'ai', 'umano')),
    model        text,
    report_id    bigint REFERENCES reports(id) ON DELETE SET NULL,
    parent_id    bigint REFERENCES insights(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    decided_at   timestamptz,
    decided_by   text
);

-- ---------------------------------------------------------------------------
-- Costi AI: ogni chiamata al modello viene registrata
-- ---------------------------------------------------------------------------
CREATE TABLE ai_usage (
    id                  bigserial PRIMARY KEY,
    run_id              bigint REFERENCES runs(id) ON DELETE SET NULL,
    purpose             text NOT NULL,
    model               text NOT NULL,
    input_tokens        integer NOT NULL DEFAULT 0,
    output_tokens       integer NOT NULL DEFAULT 0,
    cache_read_tokens   integer NOT NULL DEFAULT 0,
    cache_write_tokens  integer NOT NULL DEFAULT 0,
    cost_usd            numeric(10, 5),
    stop_reason         text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_created_idx ON ai_usage (created_at DESC);
