# Note di sicurezza per chi modifica questo repo (incluse sessioni Claude future)

## Prima di pubblicare QUALSIASI modifica a index.html

1. **Fai sempre un fetch fresco del file da GitHub immediatamente prima di editare.**
   Una copia locale anche di poche ore fa può essere già superata da modifiche fatte
   in un'altra sessione/conversazione. Il 15/07/2026 questo ha causato la quasi-perdita
   di ore di lavoro (refactor Stock + fix Lab), pubblicati sovrascritti da una copia
   locale stale.
2. **Dopo l'edit, prima del push, fai un diff tra la versione originale appena
   scaricata e quella modificata.** Il diff deve contenere *solo* le modifiche che hai
   fatto tu in questa sessione. Se contiene altro, stai per cancellare lavoro altrui —
   fermati e capisci perché.
3. **Testa le modifiche prima di pubblicarle**, quando possibile in modo funzionale
   (es. con jsdom simulando `applyAll()` con dati reali), non solo con `node --check`
   per la sintassi. Diversi bug di questa sessione (badge di stato mai aggiornato,
   delta pill mai calcolati) erano sintatticamente validi ma funzionalmente sbagliati.
4. **Verifica il conteggio pagine/output reale**, non fidarti di contatori interni
   (es. `canv.getPageNumber()` in reportlab conta 1 in più delle pagine realmente
   emesse — usa `pypdf` o `pdfinfo` sul file generato).

## Backup dei dati

I dati (Supabase, tabella `diary`, record `giorgio_protocollo_2026` e
`giorgio_proto2_2026`) **non hanno versionamento nativo**: ogni scrittura sovrascrive
irreversibilmente la precedente. Il codice di questo repo invece è già versionato da
Git — non serve backup aggiuntivo per quello.

Un repo **privato** separato (`diario-protocollo-backups`, stesso account) contiene
snapshot automatici periodici dei dati Supabase. Se devi fare operazioni rischiose sui
dati (migrazioni, pulizie, correzioni massive), controlla prima che esista un backup
recente lì, o falne uno al volo prima di procedere.

## Non committare mai in questo repo (è pubblico)

Questo repository è **pubblico**. Non committare mai qui dentro: dati sanitari,
referti, valori di laboratorio, dosaggi personalizzati, o qualunque informazione
identificativa oltre a quella già presente nel codice dell'app stessa. I backup dati
vanno sempre nel repo privato.
