# Automazione e pianificazione

Ogni comando registra l'esecuzione nella tabella `runs` ed è idempotente: lanciarlo due volte non duplica i dati. `collect` rispetta l'intervallo minimo di ogni fonte (`min_interval_hours`), quindi può essere pianificato più spesso del necessario senza sovraccaricare i siti.

## Cadenza consigliata

| Attività | Comando | Frequenza |
|---|---|---|
| Raccolta | `node src/cli.js collect` | ogni giorno (es. 06:15) |
| Classificazione AI | `node src/cli.js classify` | ogni giorno, dopo la raccolta |
| Report settimanale | `node src/cli.js report:weekly` | lunedì mattina |
| Controllo di salute | `node src/cli.js health --notify` | ogni 6 ore |

Gli orari non sono "a ora piena" di proposito: molti sistemi pianificano al minuto 0 e i siti ricevono picchi di traffico in quei momenti.

## Cron (server Linux)

```cron
# m  h   dom mon dow  comando
15   6   *   *   *    cd /opt/tenuta-grieci-intelligence && node src/cli.js collect   >> logs/collect.log 2>&1
45   6   *   *   *    cd /opt/tenuta-grieci-intelligence && node src/cli.js classify  >> logs/classify.log 2>&1
20   7   *   *   1    cd /opt/tenuta-grieci-intelligence && node src/cli.js report:weekly >> logs/report.log 2>&1
5    */6 *   *   *    cd /opt/tenuta-grieci-intelligence && node src/cli.js health --notify >> logs/health.log 2>&1
```

Le variabili d'ambiente vengono lette da `.env` nella cartella del progetto.

## n8n

Il progetto (§15) prevede n8n come orchestratore. La logica resta in questo repository (testata e versionata); n8n si occupa di pianificazione, notifiche e passaggi verso altri strumenti.

Schema minimo per ogni workflow:

1. **Schedule Trigger** con la cadenza della tabella sopra.
2. **Execute Command** (n8n self-hosted) con, ad esempio, `cd /opt/tenuta-grieci-intelligence && node src/cli.js collect`.
3. **IF** sull'exit code: `0` = ok; diverso da `0` = errore (per `health`, `2` = stato critico).
4. Ramo di errore → notifica (Slack, email) con lo `stderr` del comando.

Per il report settimanale si può aggiungere un nodo **Read Binary File** sul file indicato nell'output (`reports/report-AAAA-MM-GG-<id>.md`) e inviarlo via email o caricarlo su Google Drive.

> Il nodo Execute Command è disponibile nelle installazioni self-hosted di n8n; verificare la propria versione e le impostazioni di sicurezza dell'istanza prima di abilitarlo.

## Decisioni umane

Il sistema propone, le persone decidono (§17). Dopo aver letto il report:

```bash
node src/cli.js insights:list --stato proposta
node src/cli.js insights:decide 12 --stato approvata --nota "Test landing regali dal 15/11, budget max 300 €" --da "Giuseppe"
node src/cli.js insights:decide 13 --stato scartata --nota "Incoerente con il posizionamento" --da "Filippo"
```

Ogni decisione resta collegata all'ipotesi e alle evidenze da cui nasce.
