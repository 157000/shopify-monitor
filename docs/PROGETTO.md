# TENUTA GRIECI — AI Marketing Intelligence & Automation System

**Progetto strategico e architettura operativa** — documento di riferimento per la costruzione del dipartimento AI Marketing di Tenuta Grieci.

> L'obiettivo non è costruire una rete di agenti AI, ma un sistema di marketing intelligence capace di trasformare dati di mercato in decisioni commerciali verificabili: individuare opportunità, capire quali meritano un investimento, sperimentarle, misurarne i risultati e usare ciò che ha imparato per migliorare le decisioni successive.
>
> Lo stato di implementazione di ciascun modulo è descritto in [ARCHITETTURA.md](ARCHITETTURA.md).

## Visione

Costruire un dipartimento marketing potenziato dall'intelligenza artificiale, capace di monitorare il mercato, analizzare i concorrenti, individuare opportunità commerciali, sviluppare campagne, automatizzare le attività operative e migliorare progressivamente i risultati attraverso l'analisi dei dati.

Il sistema deve integrare cinque capacità fondamentali:

1. **Observe**: osservare il mercato, i consumatori e i concorrenti.
2. **Understand**: interpretare i dati e individuare opportunità.
3. **Decide**: stabilire quali attività meritano di essere sviluppate.
4. **Execute**: trasformare le decisioni in campagne e attività operative.
5. **Learn**: misurare i risultati e migliorare le decisioni future.

L'obiettivo non è automatizzare il maggior numero possibile di attività. L'obiettivo è costruire un'infrastruttura che permetta a Tenuta Grieci di prendere decisioni di marketing migliori, più rapidamente e con un impiego più efficiente delle risorse.

---

## 1. Obiettivi strategici del sistema

Il progetto deve rispondere a una domanda centrale:

> Come possiamo utilizzare l'intelligenza artificiale per capire meglio il mercato, acquisire clienti e aumentare le vendite senza compromettere il posizionamento premium di Tenuta Grieci?

| Area | Obiettivo | Risultato atteso |
|---|---|---|
| Market Intelligence | Comprendere mercato, concorrenti e domanda | Archivio aggiornato delle informazioni rilevanti |
| Consumer Intelligence | Comprendere bisogni, motivazioni e obiezioni dei clienti | Profili di domanda e opportunità commerciali |
| Strategic Intelligence | Trasformare le informazioni in decisioni | Priorità e piani marketing motivati dai dati |
| Creative Intelligence | Individuare e sviluppare approcci creativi | Campagne coerenti con il brand e sottoposte a test |
| Marketing Automation | Automatizzare le attività ripetitive | Riduzione del lavoro operativo |
| Performance Intelligence | Collegare marketing e risultati commerciali | Analisi di costi, conversioni e redditività |
| Organizational Learning | Accumulare conoscenze dai risultati | Miglioramento progressivo delle decisioni |

A queste aree si aggiunge una funzione trasversale: la **gestione della conoscenza aziendale**. Ogni agente deve poter utilizzare le informazioni pertinenti sul marchio, sui prodotti, sui clienti, sui prezzi, sulle campagne precedenti e sui risultati già ottenuti. Senza questa memoria condivisa, gli agenti rischiano di comportarsi come consulenti che ogni settimana ricominciano il lavoro da zero.

### 1.1 I risultati da perseguire

Il sistema dovrebbe contribuire a:

- aumentare il traffico qualificato verso il sito;
- migliorare il tasso di conversione dell'e-commerce;
- aumentare il valore medio degli ordini;
- acquisire nuovi clienti a costi sostenibili;
- sviluppare vendite per regali, matrimoni e occasioni aziendali;
- individuare opportunità B2B nel settore gastronomico e dell'ospitalità;
- migliorare la fidelizzazione;
- ridurre il tempo necessario per analizzare il mercato e sviluppare campagne;
- preservare la percezione premium del marchio.

Questi obiettivi non devono essere perseguiti simultaneamente con la stessa intensità. Le priorità dipenderanno dalla fase commerciale di Tenuta Grieci, dal budget disponibile, dalla capacità produttiva e dai margini effettivi.

---

## 2. Architettura generale

Il sistema è costruito attorno a un'infrastruttura centrale condivisa, anziché creare agenti indipendenti con database e procedure separate. L'architettura è organizzata in otto livelli.

1. **Data Sources** — Meta Ad Library; contenuti pubblici dei social network; siti web dei concorrenti; motori di ricerca; Google Trends; recensioni pubbliche; dati dell'e-commerce; account pubblicitari di proprietà; dati CRM; documenti interni e informazioni commerciali.
2. **Data Collection** — connettori e workflow che raccolgono i dati, verificano la disponibilità delle fonti e registrano gli aggiornamenti.
3. **Data Infrastructure** — il sistema che conserva, organizza e rende consultabili i dati: database, archivio dei contenuti, storico delle rilevazioni e gestione della conoscenza aziendale.
4. **Intelligence** — agenti specializzati che classificano i dati, confrontano informazioni, individuano anomalie e formulano ipotesi.
5. **Decision Engine** — il componente che ordina le opportunità per priorità, considerando potenziale commerciale, coerenza con il marchio, costo, incertezza e difficoltà di esecuzione.
6. **Execution** — gli strumenti che trasformano le decisioni in contenuti, campagne, email, landing page e attività commerciali.
7. **Measurement** — la raccolta e l'analisi dei risultati, dal primo contatto fino all'acquisto, quando il collegamento tra i dati è effettivamente disponibile.
8. **Learning** — il sistema che registra gli esperimenti, conserva le conclusioni e utilizza i risultati per migliorare le proposte future.

Il flusso completo è:

**Fonti → Raccolta → Normalizzazione → Intelligence → Priorità → Esecuzione → Misurazione → Apprendimento.**

Una differenza importante rispetto a un sistema di automazione tradizionale è che ogni decisione significativa deve essere collegata ai dati che l'hanno generata.

---

## 3. Modulo A — Competitive Intelligence

Questo è il primo modulo da sviluppare. Prima di creare campagne, è necessario costruire una visione strutturata di ciò che fanno gli altri marchi, di come presentano i propri prodotti e di quali approcci commerciali utilizzano.

### 3.1 Costruire un universo competitivo

Non si monitorano soltanto i concorrenti diretti dell'olio extravergine d'oliva, ma quattro gruppi distinti.

| Gruppo | Marchi da analizzare | Obiettivo |
|---|---|---|
| Concorrenti diretti | Produttori di olio EVO premium | Comprendere prodotti, prezzi e comunicazione |
| Marchi gastronomici premium | Cioccolato, vino, conserve e specialità alimentari | Individuare modelli di presentazione e vendita |
| Marchi di lifestyle e lusso | Brand con un'identità visiva e narrativa forte | Studiare posizionamento, desiderabilità e storytelling |
| Operatori commerciali | E-commerce gastronomici, negozi specializzati, distributori e aziende di gifting | Comprendere canali, assortimento e opportunità B2B |

Un produttore di olio può essere un concorrente diretto, mentre un marchio di cioccolato premium può rappresentare un riferimento interessante per il packaging, le confezioni regalo e la comunicazione commerciale. Non bisogna confondere un riferimento creativo con un concorrente economico.

**Dimensione iniziale del campione**: 30 marchi — 15 concorrenti diretti, 5 marchi gastronomici premium, 5 marchi di lifestyle, 5 operatori commerciali. Il numero è indicativo e andrà adattato alla disponibilità effettiva di dati e ai mercati prioritari.

Ogni marchio ha una scheda con: sito web; profili social; categoria; paese; fascia di prezzo; prodotti principali; posizionamento dichiarato; canali di vendita; frequenza di pubblicazione; fonti disponibili; data dell'ultima rilevazione.

### 3.2 Fonti di raccolta

| Fonte | Informazioni | Metodo |
|---|---|---|
| Meta Ad Library | Inserzioni pubblicamente consultabili | Ricerca e raccolta compatibile con le funzionalità disponibili |
| Instagram | Contenuti pubblici e metriche visibili | API o strumenti autorizzati, dove disponibili |
| TikTok Creative Center | Trend e informazioni pubblicitarie disponibili | Consultazione delle funzioni supportate |
| YouTube | Video, titoli e metriche pubbliche disponibili | YouTube Data API e strumenti compatibili |
| Siti dei concorrenti | Prezzi, prodotti, offerte e pagine commerciali | Monitoraggio delle pagine pubbliche |
| Recensioni | Soddisfazione, obiezioni e problemi ricorrenti | Raccolta dalle fonti consentite |
| Newsletter | Promozioni, storytelling e sequenze email | Iscrizioni legittime e gestione delle comunicazioni ricevute |
| Motori di ricerca | Domanda, risultati e visibilità | Strumenti SEO e fonti disponibili |

Le possibilità di raccolta variano da piattaforma a piattaforma. Non si dà per scontato che esista un'API capace di acquisire tutti i contenuti e le metriche di qualsiasi account pubblico. Per ogni fonte si definisce prima:

1. quali dati sono effettivamente accessibili;
2. con quale frequenza possono essere raccolti;
3. quali condizioni d'uso si applicano;
4. se la raccolta può essere automatizzata;
5. quanto costa mantenerla operativa.

### 3.3 Distinguere dati osservati e interpretazioni

Ogni informazione è classificata in una delle seguenti categorie:

- **Dato osservato**: un'informazione verificabile direttamente. *Esempio: un marchio pubblica un Reel dedicato a una confezione regalo.*
- **Interpretazione**: una lettura del dato. *Esempio: il marchio sembra attribuire importanza alle occasioni di gifting.*
- **Ipotesi**: una possibile spiegazione o opportunità da verificare. *Esempio: una campagna dedicata ai regali potrebbe essere interessante anche per Tenuta Grieci.*
- **Decisione**: un'attività approvata. *Esempio: sviluppare due concept creativi per una campagna dedicata alle confezioni regalo.*

Questa separazione evita che l'AI trasformi supposizioni in fatti.

### 3.4 Scheda strutturata dei contenuti

| Campo | Descrizione |
|---|---|
| Content ID | Identificativo univoco |
| Brand ID | Marchio di appartenenza |
| URL | Fonte originale |
| Piattaforma | Instagram, TikTok, YouTube ecc. |
| Data pubblicazione | Quando il contenuto è stato pubblicato |
| Data rilevazione | Quando il sistema lo ha osservato |
| Formato | Reel, post, carosello, video, pagina web |
| Hook | Apertura del contenuto |
| Tema | Argomento principale |
| Messaggio | Promessa o idea centrale |
| Prodotto | Prodotto promosso |
| CTA | Invito all'azione |
| Stile visivo | Descrizione delle caratteristiche creative |
| Metriche | Valori pubblici disponibili |
| Classificazione AI | Categorie assegnate |
| Evidenza | Elementi che supportano la classificazione |
| Confidenza | Affidabilità della classificazione |
| Stato | Nuovo, analizzato, verificato |

Si aggiunge uno storico delle metriche: una fotografia dei risultati raccolta oggi non deve sovrascrivere quella della settimana precedente. Registrando le rilevazioni successive, è possibile osservare come cambiano nel tempo le interazioni pubblicamente visibili.

### 3.5 Analisi delle inserzioni

Per le inserzioni pubbliche il sistema identifica: prodotto promosso; messaggio commerciale; formato; CTA; eventuale sconto; pagina di destinazione; presenza di testimonianze; elementi visivi; prima data osservata; ultima data osservata.

La durata osservata di un'inserzione può essere un elemento utile, ma non dimostra che la campagna sia profittevole. Non si attribuiscono mai ai concorrenti dati interni come ROAS, vendite o costo di acquisizione senza una fonte verificabile.

### 3.6 Output settimanale

Un rapporto breve, orientato alle decisioni — non un documento di 50 pagine pieno di screenshot. Contiene:

1. Nuovi approcci creativi rilevanti.
2. Nuovi prodotti e offerte osservati.
3. Temi ricorrenti.
4. Cambiamenti nella comunicazione dei marchi monitorati.
5. Opportunità coerenti con Tenuta Grieci.
6. Ipotesi da testare.
7. Informazioni mancanti o non verificabili.

Ogni opportunità riporta la fonte e spiega perché merita attenzione.

---

## 4. Modulo B — Market e Consumer Intelligence

La competitive intelligence osserva i marchi. La market intelligence studia il mercato. La consumer intelligence cerca di comprendere bisogni, motivazioni e ostacoli all'acquisto. Le tre attività sono complementari, ma non equivalenti.

### 4.1 Obiettivo

Comprendere: chi potrebbe acquistare Tenuta Grieci; per quale motivo; in quali occasioni; a quale fascia di prezzo; attraverso quali canali; con quali obiezioni; quali elementi rendono il prodotto desiderabile; quali informazioni servono per decidere l'acquisto.

### 4.2 Fonti

Google Trends; dati di ricerca disponibili attraverso strumenti SEO; recensioni pubbliche; domande dei clienti; email ricevute; richieste commerciali; dati delle ricerche interne al sito, quando disponibili; analytics dell'e-commerce; interviste e questionari; dati commerciali dei distributori, se condivisi. Le fonti devono essere utilizzate nel rispetto delle condizioni di accesso e delle regole applicabili.

### 4.3 Tassonomia dei bisogni

| Categoria | Esempi di domande |
|---|---|
| Qualità | Che cosa distingue il prodotto? |
| Provenienza | Quanto conta conoscere il territorio? |
| Regalo | Quali elementi rendono il prodotto adatto a un dono? |
| Prezzo | Quali dubbi emergono sul rapporto qualità-prezzo? |
| Utilizzo | Come viene utilizzato il prodotto? |
| Fiducia | Quali informazioni servono prima dell'acquisto? |
| Spedizione | Quali costi o condizioni possono scoraggiare l'acquisto? |
| B2B | Che cosa cercano aziende, ristoranti e operatori commerciali? |

L'AI può classificare le osservazioni e individuare temi ricorrenti. Non può però presumere che le persone che commentano pubblicamente rappresentino l'intero mercato. Le conclusioni più importanti devono essere verificate con dati commerciali o ricerche mirate.

### 4.4 Output

Segmenti di domanda da approfondire; obiezioni ricorrenti; opportunità di prodotto e confezionamento; occasioni di consumo e gifting; domande a cui il sito dovrebbe rispondere; ipotesi sui messaggi da testare; lacune informative che richiedono una ricerca aggiuntiva.

---

## 5. Modulo C — Trend Intelligence

Identifica argomenti, formati e approcci creativi che potrebbero diventare interessanti per il pubblico. Il suo compito non è inseguire ogni trend, ma selezionare quelli che possono essere sviluppati senza snaturare l'identità del marchio.

### 5.1 Indicatori

Quando i dati sono disponibili: visualizzazioni; interazioni; engagement rate; crescita delle interazioni nel tempo; età del contenuto; frequenza con cui il tema compare; prestazioni rispetto alla storia dello stesso account; interesse di ricerca; coerenza con il brand.

Per confrontare contenuti di account diversi si usano metriche normalizzate, tenendo conto delle differenze nella disponibilità dei dati. L'engagement rate deve avere una definizione costante: interazioni divise per copertura, visualizzazioni o follower producono risultati diversi.

### 5.2 Valutazione delle opportunità

| Dimensione | Domanda |
|---|---|
| Evidenza | Esistono segnali concreti di interesse? |
| Coerenza | È compatibile con il posizionamento di Tenuta Grieci? |
| Potenziale commerciale | Può contribuire a un obiettivo misurabile? |
| Fattibilità | Possiamo realizzarlo con le risorse disponibili? |
| Differenziazione | Possiamo svilupparlo in modo riconoscibile? |

Il punteggio aiuta a ordinare le opportunità, ma non deve essere presentato come una previsione scientifica della performance.

### 5.3 Output

Per ogni opportunità: evidenze; fonti; pubblico potenzialmente interessato; ragione della rilevanza; formato consigliato; costo stimato; KPI primario; criterio di successo; rischio di incoerenza con il brand. Un esempio potrebbe essere una serie dedicata al rituale della tavola italiana, sviluppata attraverso fotografie autentiche, brevi video e contenuti editoriali. L'idea non viene dichiarata vincente in anticipo: viene proposta come esperimento.

---

## 6. Modulo D — Strategic Decision Engine

Non basta chiedere a un modello di intelligenza artificiale di generare idee: serve un processo che trasformi le idee in priorità operative.

### 6.1 Input

Obiettivi commerciali; posizionamento del marchio; dati di mercato; analisi dei concorrenti; informazioni sui clienti; risultati delle campagne precedenti; budget disponibile; margini dei prodotti; disponibilità di stock; capacità produttiva; calendario commerciale; risorse necessarie per realizzare le attività.

### 6.2 Processo decisionale

1. **Identificazione** — Quale opportunità è stata individuata?
2. **Evidenze** — Quali dati supportano l'opportunità e quali informazioni mancano?
3. **Coerenza strategica** — L'attività è compatibile con il posizionamento e gli obiettivi del marchio?
4. **Valutazione economica** — Quali sono i costi, i risultati attesi e i possibili rischi?
5. **Esperimento** — Qual è il test più semplice ed economico per verificare l'ipotesi?
6. **Decisione** — L'attività deve essere sviluppata, testata ulteriormente, modificata o abbandonata?

### 6.3 Matrice di priorità

Impatto potenziale; solidità delle evidenze; costo; tempo necessario; coerenza con il marchio; rischio. Il sistema assegna una priorità iniziale, ma le decisioni che coinvolgono budget, posizionamento o modifiche commerciali rimangono soggette ad approvazione.

### 6.4 Output

Un piano operativo con: opportunità prioritarie; motivazioni; attività da realizzare; risorse necessarie; responsabile; scadenza; budget proposto; KPI; criterio per decidere se proseguire. La priorità non è produrre il maggior numero di campagne, ma individuare le attività con il miglior rapporto potenziale tra risultati, costo e rischio.

---

## 7. Modulo E — Creative Intelligence & Production

Traduce le decisioni in materiali creativi, guidati dal posizionamento del marchio e dalle ipotesi da testare.

### 7.1 Brand Knowledge Base

Prima di generare contenuti si costruisce un archivio di conoscenza dedicato a Tenuta Grieci: storia della famiglia; territorio; caratteristiche documentate dei prodotti; processo produttivo; identità visiva; tono di voce; pubblico prioritario; fasce di prezzo; packaging; disponibilità dei prodotti; condizioni commerciali; parole da privilegiare; espressioni da evitare; esempi di contenuti approvati; vincoli normativi e commerciali.

Questa base informativa è la fonte di riferimento degli agenti creativi. L'AI non deve inventare dettagli sulla provenienza, sulle caratteristiche organolettiche, sulla produzione o sulla storia del marchio.

### 7.2 Strumenti

| Attività | Strumento possibile |
|---|---|
| Ideazione e copywriting | Claude API o modelli equivalenti |
| Generazione e modifica delle immagini | ChatGPT Image Generation |
| Video e montaggio | CapCut |
| Grafica e template | Canva |
| Gestione delle produzioni | Airtable |
| Archiviazione | Google Drive |

La scelta definitiva dipende dai costi, dalle funzionalità disponibili e dalle esigenze operative.

### 7.3 Pacchetto creativo standard

Per ogni contenuto: obiettivo commerciale; pubblico di riferimento; insight o ipotesi; hook; concept creativo; storyboard; indicazioni visive; script; testi in sovrimpressione; caption; CTA; varianti da testare; KPI primario; fonti e motivazioni alla base dell'idea.

### 7.4 Produzione coerente con un marchio premium

Si privilegia un archivio fotografico autentico e riconoscibile, che valorizzi: prodotto; territorio; tavola; materiali; dettagli del packaging; momenti di consumo; gesti e rituali; occasioni di dono. L'AI può contribuire all'ideazione, alle bozze, agli adattamenti e alla produzione di varianti, ma la generazione indiscriminata di contenuti non sostituisce l'identità visiva del marchio.

### 7.5 Controllo qualità

Prima dell'approvazione ogni contenuto è verificato rispetto a: coerenza con il brand; accuratezza; qualità visiva; correttezza dei prezzi; disponibilità del prodotto; CTA; formato; eventuali affermazioni alimentari o salutistiche; diritti sugli asset; leggibilità; destinazione commerciale. Il contenuto viene pubblicato soltanto dopo l'approvazione prevista dal workflow.

---

## 8. Modulo F — Content Intelligence & Publishing

Collega produzione, calendario editoriale e distribuzione. Strumenti: Airtable per la gestione editoriale; n8n per le automazioni; Metricool per la programmazione e i report, nei limiti delle piattaforme supportate; Google Drive per i file.

**Stati del contenuto**: 1. Opportunità identificata · 2. Idea proposta · 3. Idea approvata · 4. Brief in preparazione · 5. Produzione · 6. Revisione · 7. Approvato · 8. Programmato · 9. Pubblicato · 10. Performance in raccolta · 11. Analizzato · 12. Archiviato.

**Workflow** — quando un contenuto viene approvato: il sistema verifica la presenza dei file; controlla testo, formato e data; verifica la disponibilità del prodotto, se pertinente; trasferisce il contenuto allo strumento di pubblicazione; registra l'esito; salva il collegamento al contenuto pubblicato; pianifica la raccolta delle metriche; segnala eventuali errori. La pubblicazione automatica è limitata ai contenuti già approvati.

---

## 9. Modulo G — Advertising Intelligence

Collega l'analisi delle pubblicità concorrenti alla gestione delle campagne di Tenuta Grieci, mantenendo separate le due attività.

### 9.1 Intelligence sui concorrenti

La Meta Ad Library può essere utilizzata per studiare le inserzioni pubblicamente consultabili. Per ogni annuncio rilevante: inserzionista; creatività; messaggio; prodotto; offerta; CTA; landing page; data di osservazione; eventuale evoluzione nel tempo. Non si deve presumere di conoscere il budget, il ROAS o le vendite del concorrente.

### 9.2 Analisi delle campagne proprie

Integrazioni autorizzate con Meta Ads e, quando opportuno, API ufficiali. Metriche: spesa; impression; copertura; CPM; clic; CTR; CPC; conversioni registrate; CPA; ricavi attribuiti; ROAS attribuito — per campagna, gruppo di inserzioni, creatività e periodo, quando disponibili.

### 9.3 Sistema di sperimentazione

L'AI non modifica liberamente campagne e budget. Ogni test ha: ipotesi; variabile da testare; pubblico; budget massimo; durata; KPI primario; criterio di successo; criterio di interruzione; risultato; decisione successiva. Esempio: confrontare tre approcci creativi — A. storia della famiglia; B. cultura gastronomica e rituali della tavola; C. confezione regalo premium. Se si modificano contemporaneamente creatività, pubblico, offerta e landing page, diventa più difficile comprendere quale elemento abbia determinato il risultato.

### 9.4 Controllo del budget

Nella prima fase l'AI può analizzare i risultati, individuare anomalie, proporre variazioni, stimare le conseguenze economiche e segnalare campagne che richiedono attenzione. Le modifiche effettive al budget rimangono soggette ad approvazione. Solo dopo aver verificato l'affidabilità del sistema si potranno valutare automazioni limitate, con soglie, autorizzazioni e limiti di spesa predefiniti.

---

## 10. Modulo H — Website & Conversion Intelligence

Il traffico non è un risultato commerciale in sé. Strumenti: Shopify Analytics; Google Analytics 4; Google Search Console; Microsoft Clarity o Hotjar, se utili e configurati correttamente.

Si monitorano: sessioni; provenienza del traffico; pagine di ingresso; visualizzazioni dei prodotti; aggiunte al carrello; avvii del checkout; acquisti; conversion rate; valore medio dell'ordine; performance mobile; errori tecnici; risultati per dispositivo e canale.

Il **Conversion Intelligence Agent** individua possibili problemi e formula raccomandazioni verificabili (es. informazioni sulla spedizione poco visibili; confezione regalo da descrivere meglio; pagine prodotto che non rispondono a domande frequenti; ostacoli al checkout su mobile; sorgenti di traffico poco qualificato). Ogni raccomandazione indica quali dati la supportano e quali verifiche sono necessarie. Le modifiche al sito non vengono applicate automaticamente senza controlli.

---

## 11. Modulo I — CRM & Customer Lifecycle

Strumenti: Shopify per i dati commerciali; Klaviyo per email marketing e segmentazione, se adatto; n8n per collegare i workflow; database centrale per la conoscenza storica.

**Segmentazione** (quando i dati lo consentono): nuovi clienti; clienti ricorrenti; clienti inattivi; clienti interessati a confezioni regalo; clienti che acquistano per occasioni particolari; contatti commerciali B2B; ristoranti e operatori gastronomici; aziende interessate a regali corporate. La segmentazione si basa su informazioni raccolte legittimamente, senza categorie arbitrarie basate su dati personali irrilevanti.

| Evento | Automazione possibile |
|---|---|
| Iscrizione alla newsletter | Sequenza di benvenuto |
| Primo acquisto | Ringraziamento e informazioni utili |
| Carrello abbandonato | Promemoria, se consentito |
| Cliente inattivo | Campagna di riattivazione |
| Interesse per il gifting | Comunicazioni pertinenti |
| Nuovo prodotto | Campagna per i segmenti interessati |
| Richiesta B2B | Inserimento nel flusso commerciale |
| Acquisto ricorrente | Comunicazione pertinente al ciclo di riacquisto |

Ogni workflow rispetta le basi giuridiche applicabili, il consenso quando necessario, le informative e le preferenze di contatto. Le email commerciali hanno obiettivi e metriche misurabili.

---

## 12. Modulo J — Marketing Economics & Performance Intelligence

Collega il marketing ai risultati economici, con una visione della redditività per prodotto, campagna e canale, nei limiti dei dati disponibili.

| Area | KPI |
|---|---|
| Social | Copertura, visualizzazioni, interazioni |
| Traffico | Sessioni, sorgenti, visite alle pagine prodotto |
| E-commerce | Ordini, conversion rate, ricavi, valore medio ordine |
| Advertising | Spesa, CPA, ROAS attribuito |
| CRM | Clic, conversioni, ricavi attribuiti |
| Redditività | Margine di contribuzione |
| Produzione | Costo e tempo per contenuto |
| B2B | Contatti qualificati, offerte, ordini e valore commerciale |

**Ricavi e profitto.** Una campagna che genera €1.000 di ricavi attribuiti e costa €250 ha ROAS = 1.000 / 250 = 4: genera €4 di ricavi attribuiti per ogni euro investito in pubblicità. Non significa che abbia prodotto €750 di profitto: occorre considerare costo del prodotto, commissioni, sconti, imballaggio, spedizione a carico dell'azienda, resi e altri costi variabili. Il sistema distingue almeno:

- **Ricavi attribuiti**: valore degli ordini attribuiti alla campagna secondo il modello utilizzato.
- **Margine di contribuzione prima della pubblicità**: ricavi meno i costi variabili rilevanti.
- **Margine di contribuzione dopo la pubblicità**: margine precedente meno spesa pubblicitaria, tenendo conto della coerenza tra ordini, periodi e criteri di attribuzione.

**Attribuzione non è causalità.** Le piattaforme usano modelli di attribuzione differenti e possono attribuire lo stesso ordine a più canali: non si sommano indiscriminatamente i ricavi attribuiti da Meta e Google Analytics. **Clienti nuovi ed esistenti** vanno separati (acquisizione, vendite a clienti esistenti, riacquisti, ricavi complessivi, margine di contribuzione).

**Dashboard** in quattro sezioni: Executive Overview, Acquisition, Creative Performance, Economics. Strumenti iniziali: Google Sheets e Looker Studio; PostgreSQL e Metabase quando volume e complessità aumentano.

---

## 13. Il sistema di apprendimento continuo

L'apprendimento non è affidato a una vaga memoria dell'AI, ma a dati storici, esperimenti documentati e regole decisionali esplicite.

**Registro degli esperimenti**: identificativo; obiettivo; ipotesi; fonte dell'ipotesi; creatività; pubblico; budget; durata; KPI primario; risultati; qualità dei dati; limiti del test; conclusione; decisione successiva.

**Aggiornamento della conoscenza** — dopo ogni test si distingue tra: ipotesi confermata dai dati disponibili; ipotesi non supportata; risultato inconcludente; test non valido; necessità di ulteriori verifiche. Poche conversioni non significano automaticamente un concept sbagliato: potrebbero esserci problemi di budget, pubblico, offerta, landing page o volume dei dati.

**Memoria operativa** — un archivio di conclusioni strutturate, consultabile dagli agenti prima di nuove raccomandazioni. Esempio: *Ipotesi*: le creatività sulla confezione regalo aumentano gli acquisti a Natale. *Evidenza*: due test in condizioni comparabili. *Limiti*: campione ridotto e periodo stagionale. *Conclusione*: evidenza preliminare favorevole, non generalizzabile. *Prossimo passo*: replicare il test in un periodo diverso.

---

## 14. Infrastruttura tecnica

La tecnologia deve essere proporzionata alla quantità di dati e alla complessità dei workflow.

| Componente | Strumento | Funzione |
|---|---|---|
| Orchestrazione | n8n | Workflow e automazioni |
| Modello AI | Claude API o alternativa equivalente | Analisi, classificazione e generazione |
| Sviluppo | Claude Code o ambiente equivalente | Sviluppo e manutenzione |
| Database iniziale | PostgreSQL o database gestito equivalente | Dati strutturati e storico |
| Archivio file | Google Drive o object storage | Foto, video e documenti |
| Gestione editoriale | Airtable | Contenuti, approvazioni e calendario |
| Raccolta dati | API e connettori autorizzati | Integrazioni con le fonti |
| Produzione | Canva e CapCut | Materiali creativi |
| Pubblicazione | Metricool o API supportate | Programmazione dei contenuti |
| E-commerce | Shopify | Prodotti, ordini e ricavi |
| Analytics | GA4 e Shopify Analytics | Performance |
| Dashboard | Looker Studio o Metabase | Reporting |
| Notifiche | Email o Slack | Avvisi e approvazioni |

I servizi indicati sono candidati da valutare, non componenti da acquistare necessariamente tutti.

Airtable gestisce il lavoro editoriale e le attività operative, non l'archivio principale di ogni rilevazione. Il database centrale conserva contenuti raccolti, rilevazioni storiche, classificazioni, esperimenti, risultati e collegamenti tra le entità.

**Tabelle principali**: Brands; Sources; Content; Content Snapshots; Ads; Products; Campaigns; Experiments; Creative Assets; Performance; Orders; Customers; Insights; Decisions; Workflow Logs. Ogni tabella ha identificativi univoci e relazioni definite. I dati osservati restano distinguibili dalle classificazioni generate dall'AI: la classificazione può cambiare, il dato originale deve essere conservato.

---

## 15. Automazioni operative

n8n come motore di orchestrazione. Ogni workflow ha trigger, input, controlli, output, gestione degli errori e registrazione dell'esecuzione.

1. **Competitor Monitoring** — recupera l'elenco dei marchi; verifica le fonti disponibili; raccoglie i nuovi dati consentiti; elimina i duplicati; registra la rilevazione; classifica i contenuti; salva i risultati; segnala le anomalie; aggiorna l'archivio.
2. **Weekly Intelligence Report** — recupera le nuove osservazioni; le confronta con lo storico; individua cambiamenti rilevanti; separa evidenze e ipotesi; seleziona le opportunità; genera e invia il rapporto.
3. **Opportunity Prioritization** — valuta coerenza e potenziale; stima costi e difficoltà; identifica le informazioni mancanti; assegna una priorità; propone le attività; richiede approvazione.
4. **Content Production** — riceve un brief approvato; recupera le informazioni del marchio; genera concept e varianti; prepara script e caption; verifica i requisiti; archivia; richiede revisione; registra la versione approvata.
5. **Publishing** — rileva il contenuto approvato; verifica file, data e formato; invia allo strumento di pubblicazione; registra l'esito e l'URL; pianifica la raccolta delle metriche.
6. **Campaign Analysis** — recupera i dati autorizzati di Meta Ads e quelli commerciali di Shopify; normalizza date e identificativi; confronta ricavi, costi e risultati; rileva anomalie; aggiorna le dashboard; formula raccomandazioni; richiede approvazione.
7. **Experiment Learning** — collega risultati e ipotesi; verifica la qualità dei dati; registra le conclusioni; aggiorna la memoria operativa; propone esperimenti successivi.
8. **System Health** — verifica API non raggiungibili, errori di autenticazione, dati mancanti, duplicazioni, aumento anomalo dei costi, esecuzioni fallite, scadenza delle credenziali, modifiche agli schemi dei dati, assenza di aggiornamenti attesi. Un sistema automatizzato non è affidabile soltanto perché esegue workflow: deve anche accorgersi quando smette di funzionare correttamente.

---

## 16. Architettura degli agenti AI

Un numero limitato di agenti specializzati, coordinati da workflow deterministici. **L'AI interpreta, confronta e propone. Il software esegue i passaggi ripetitivi e verificabili.**

| Agente | Compito | Output |
|---|---|---|
| 1. Market Intelligence | Analizzare dati di mercato, fonti pubbliche e informazioni commerciali | Evidenze, opportunità e domande da approfondire |
| 2. Competitive Intelligence | Classificare concorrenti, contenuti e inserzioni | Analisi strutturate e confronti nel tempo |
| 3. Consumer Intelligence | Interpretare recensioni, richieste e dati di comportamento | Bisogni, obiezioni e segmenti da approfondire |
| 4. Strategic Planner | Trasformare le informazioni in priorità | Piani, esperimenti, KPI e risorse necessarie |
| 5. Creative Strategist | Sviluppare concept coerenti con il brand | Brief, hook, storyboard e varianti |
| 6. Performance Analyst | Interpretare i risultati delle attività marketing | Analisi economiche, anomalie e raccomandazioni |
| 7. Knowledge Manager | Mantenere aggiornate le conoscenze operative | Archivio di decisioni, esperimenti e conclusioni |

Moltiplicare gli agenti aumenta passaggi, costi, possibilità di errore e complessità di manutenzione. Nella prima fase alcuni ruoli possono essere svolti dallo stesso modello attraverso workflow distinti; un agente diventa un componente autonomo solo quando esiste un vantaggio operativo misurabile.

**Interfaccia di interrogazione** per domande come: quali nuovi approcci creativi sono emersi nell'ultimo mese? Quali concorrenti promuovono confezioni regalo? Quali opportunità sono coerenti con il nostro posizionamento? Quali test hanno prodotto i risultati più interessanti? Quali campagne hanno generato il miglior margine di contribuzione disponibile? Quali problemi del sito potrebbero ostacolare le conversioni? Quali attività prioritizzare la prossima settimana? Le risposte si basano sui dati effettivamente disponibili: quando un'informazione non è accessibile, l'agente lo dichiara invece di inventarla.

---

## 17. Sicurezza, qualità e governance

| Attività | Autonomia consentita |
|---|---|
| Raccolta di dati consentiti | Automatica |
| Classificazione dei contenuti | Automatica, con controlli di qualità |
| Analisi dei risultati | Automatica |
| Generazione di bozze | Automatica |
| Proposta di campagne | Automatica |
| Pubblicazione | Solo dopo approvazione prevista |
| Modifica dei prezzi | Approvazione obbligatoria |
| Modifica dei budget | Approvazione obbligatoria nella fase iniziale |
| Invio di nuove campagne email | Approvazione obbligatoria |
| Modifica del sito | Approvazione obbligatoria |
| Gestione dei dati personali | Secondo autorizzazioni e regole applicabili |

Inoltre: gestione sicura delle credenziali; permessi limitati al necessario; registrazione delle operazioni; controlli sugli input provenienti da fonti esterne; procedure di ripristino; monitoraggio dei costi; gestione degli errori; revisione periodica delle autorizzazioni.

I contenuti dei concorrenti sono dati da analizzare, non istruzioni da eseguire. Il sistema deve impedire che testi esterni possano modificare le regole degli agenti o indurli a utilizzare credenziali e strumenti fuori dal loro ambito autorizzato.

---

## 18. Budget e sostenibilità economica

Le cifre seguenti sono ipotesi di pianificazione, non preventivi aggiornati dei fornitori.

| Fase | Costo software mensile indicativo |
|---|---|
| Prototipo | €50–150 |
| Sistema operativo iniziale | €150–500 |
| Sistema avanzato | €500–1.500+ |

Le stime dipendono da numero di fonti, volume dei dati, utilizzo dei modelli AI, strumenti a pagamento e infrastruttura. Sono esclusi lavoro di sviluppo, manutenzione, produzione creativa e spesa pubblicitaria.

Per contenere i costi: partire da poche fonti ad alto valore; usare workflow programmati invece di interrogare continuamente ogni fonte; impiegare modelli economici per classificazioni semplici e modelli più capaci per analisi strategiche complesse; conservare i risultati delle analisi per evitare elaborazioni duplicate; introdurre limiti di utilizzo e budget; eliminare le automazioni che non producono informazioni o risultati utili. La scelta di un modello si basa sulla qualità del risultato rispetto al costo, non soltanto sulle capacità dichiarate.

---

## 19. Piano di implementazione

| Fase | Durata indicativa | Attività | Risultato |
|---|---|---|---|
| 1 — Intelligence Foundation | Settimane 1–2 | Definire obiettivi; costruire la lista dei marchi; selezionare le fonti; definire le categorie; impostare il database; integrare le prime fonti; sviluppare la classificazione AI; verificare manualmente i risultati | Archivio strutturato di informazioni su mercato e concorrenti |
| 2 — Strategic & Creative Engine | Settimane 3–4 | Brand knowledge base; motore di priorità; report; primi esperimenti; collegamento al calendario editoriale; template di produzione | Un sistema che trasforma le informazioni in proposte operative |
| 3 — Distribution & Performance | Settimane 5–6 | Workflow editoriali; pubblicazioni supportate; dati delle campagne proprie; e-commerce; dashboard; qualità delle metriche | Un sistema che collega pianificazione, pubblicazione e risultati |
| 4 — Learning & Optimization | Settimane 7–8 e successive | Registro degli esperimenti; collegamento risultati-ipotesi; primi workflow CRM; controlli tecnici; costi e affidabilità; regole decisionali | Una prima versione operativa capace di accumulare conoscenza |

Le otto settimane sono un obiettivo indicativo: le integrazioni più complesse possono richiedere più tempo.

---

## 20. Le priorità specifiche per Tenuta Grieci

Tre aree commerciali da analizzare e testare, con KPI differenti:

1. **Vendita diretta** — capire come acquisire clienti attraverso il sito: analizzare i concorrenti; studiare prezzi e presentazione dei prodotti; migliorare le pagine prodotto; testare contenuti e creatività; misurare conversioni e margini.
2. **Gifting premium** — valutare il potenziale delle confezioni regalo: analizzare il mercato del gifting gastronomico; studiare occasioni e messaggi; sviluppare concept creativi; verificare l'interesse del pubblico; testare landing page e offerte; misurare ordini e redditività.
3. **Sviluppo commerciale B2B** — opportunità con aziende, ristoranti, negozi specializzati e operatori dell'ospitalità: archivio di potenziali clienti; analisi di assortimenti e posizionamento; occasioni commerciali; materiali B2B; processo di contatto; monitoraggio di risposte, trattative e ordini.

Una campagna B2C si valuta attraverso acquisti e margini; un'attività B2B richiede anche di monitorare contatti qualificati, conversione delle trattative e valore degli ordini.

---

## 21. Come misurare il successo del progetto

1. **Affidabilità tecnica** — percentuale di workflow completati correttamente; completezza dei dati; frequenza degli errori; costo per analisi; tempo per risolvere i problemi.
2. **Efficienza operativa** — tempo risparmiato nella ricerca; tempo per produrre un contenuto; opportunità analizzate; percentuale di raccomandazioni approvate; costo per contenuto; tempo dall'idea alla pubblicazione.
3. **Risultati commerciali** — traffico qualificato; conversion rate; nuovi clienti; costo di acquisizione; valore medio dell'ordine; margine di contribuzione; ricavi B2B; riacquisti.

Il numero di agenti, di contenuti generati o di automazioni non è un indicatore di successo. Il progetto funziona se migliora il processo decisionale, riduce il lavoro inutile e contribuisce ai risultati commerciali.

---

## 22. La configurazione iniziale

- **Intelligence**: Meta Ad Library; TikTok Creative Center; monitoraggio selettivo dei siti dei concorrenti; archivio iniziale di 30 marchi.
- **AI**: un modello principale per analisi e generazione; workflow distinti per competitive intelligence, strategia e produzione; una base di conoscenza del marchio.
- **Infrastruttura**: n8n; PostgreSQL per i dati strutturati, se il volume lo giustifica; Google Drive per gli asset; Airtable per il calendario editoriale.
- **Produzione**: Canva; CapCut; archivio fotografico autentico.
- **Performance**: Shopify Analytics; GA4; Meta Ads per le campagne proprie; una dashboard iniziale.
- **Controllo**: approvazione umana; registro degli esperimenti; controlli sui dati; monitoraggio degli errori e dei costi.

Non si acquistano subito tutti gli strumenti: prima si verifica quali funzionalità sono già disponibili, quali integrazioni sono realmente necessarie e quali servizi offrono il miglior rapporto tra costo e utilità.

---

## 23. Conclusione

Il progetto deve evolvere da una raccolta di automazioni a un'infrastruttura di marketing intelligence. La sua forza non sarà il numero di agenti AI, ma la capacità di collegare:

**informazioni di mercato → ipotesi → decisioni → esperimenti → risultati economici → nuove decisioni.**

Il percorso:

1. Costruire la competitive intelligence.
2. Collegare l'intelligence alla strategia.
3. Utilizzare la strategia per sviluppare esperimenti creativi.
4. Misurare i risultati commerciali.
5. Accumulare conoscenza attraverso i test.
6. Automatizzare progressivamente le attività ripetitive.
7. Estendere il sistema ad acquisizione, gifting, CRM e sviluppo B2B.

Il risultato finale non è un marketing che produce di più, ma un marketing che capisce meglio cosa fare, perché farlo e se sta funzionando.

---

### Le cinque migliorie rispetto al progetto iniziale

| Miglioramento | Perché è importante |
|---|---|
| 1. Decision Engine | Impedisce che il sistema si limiti a raccogliere dati e generare idee senza stabilire priorità |
| 2. Consumer Intelligence | Integra l'analisi dei concorrenti con bisogni, obiezioni e comportamenti dei potenziali clienti |
| 3. Marketing Economics | Collega le campagne ai margini e ai risultati commerciali, non soltanto a visualizzazioni e ROAS |
| 4. Learning strutturato | Registra ipotesi, risultati e limiti dei test, evitando che l'AI trasformi pochi dati in regole generali |
| 5. Infrastruttura più controllata | Separa raccolta dati, interpretazione, decisioni ed esecuzione, riducendo errori e automazioni incontrollate |

### Consiglio operativo

Non costruire contemporaneamente tutti i moduli. Realizzare per prima una versione funzionante della Competitive Intelligence, capace di monitorare un gruppo selezionato di marchi, archiviare i contenuti, classificarli e produrre un rapporto settimanale con fonti verificabili e opportunità da testare. Prima di estendere il sistema, verificare tre risultati:

- i dati raccolti sono sufficientemente affidabili;
- le analisi individuano opportunità che non sarebbero emerse facilmente con una ricerca manuale;
- il tempo risparmiato giustifica il costo dell'infrastruttura.

Solo dopo si aggiungono il motore strategico e il collegamento con le campagne di Tenuta Grieci.
