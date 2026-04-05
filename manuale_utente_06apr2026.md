# Manuale Utente — Catalogo Pesce F.lli D'Andrassi
> Aggiornato: 6 aprile 2026

---

## Indice

1. Accesso al pannello admin
2. Creare un catalogo
3. Caricare le foto dei prodotti
4. Import automatico da file aste
5. Gestione prezzi e pesi
6. Pubblicare il catalogo
7. Listino prezzi (stampa PDF)
8. Gestione ordini
9. Stampa preparazione merce
10. Evasione ordini
11. Gestione clienti
12. Gestione venditori
13. Statistiche

---

## 1. Accesso al Pannello Admin

Vai su: `https://ordini.fratellidandrassi.com/admin`

Accedi con la tua email Google (deve essere tra quelle autorizzate). Dopo il login arrivi alla Dashboard principale.

---

## 2. Creare un Catalogo

Dalla Dashboard:

1. Clicca **"Nuovo catalogo"**
2. Inserisci il **Titolo interno** (es. `CIVITAVECCHIA 06-04-2026`) — visibile solo a te nell'admin
3. Inserisci il **Nome online** (es. `Civitavecchia`) — quello che vedono i clienti sulle casse quando fanno l'ordine. Questo nome compare anche nell'intestazione del listino prezzi
4. Clicca **Crea**

Il catalogo appare in Dashboard. Da lì puoi accedere a: Listino, Prezzi, Listino prezzi.

---

## 3. Caricare le Foto dei Prodotti

Dal catalogo → **Listino** (bottone arancione):

1. Clicca **"Aggiungi prodotto"** o usa il caricamento multiplo
2. Per ogni cassa: carica la foto, il sistema assegna automaticamente il numero progressivo
3. Puoi modificare il numero di cassa manualmente se necessario
4. Le foto vengono salvate su Supabase Storage

---

## 4. Import Automatico da File Aste

Questa funzione legge direttamente il PDF o XLSX scaricato dall'asta e compila automaticamente specie, peso e numero cooperativa per ogni cassa — senza dover creare manualmente un file separato.

Vai su: **Prezzi** del catalogo → sezione **"Import da listino aste"**

### Formato PDF (Civitavecchia — "Dettaglio lotti")

Il file è il PDF che scarichi dalla piattaforma dell'asta. Il sistema legge le righe del dettaglio lotti e abbina ogni lotto al prodotto corrispondente per numero progressivo.

### Formato XLSX (Francia — "Acquisti Mercati")

Il file è il foglio Excel con il foglio chiamato `ACQUISTI`. Il sistema legge:
- Colonna C = numero lotto cooperativa
- Colonna I = nome specie (in italiano)
- Colonna P = peso netto kg

### Come fare l'import

1. Seleziona il file (PDF o XLSX) con il tasto **"Scegli file"**
2. Se i progressivi del catalogo non partono da 1, imposta il **"Progressivo di partenza"** (es. se il catalogo inizia dal prodotto 10, metti 10)
3. Clicca **"Anteprima"** — vedrai la tabella con i dati che verranno importati e quali prodotti verranno aggiornati
4. Controlla che i dati siano corretti
5. Clicca **"Applica"** per salvare su database

Dopo l'import, ogni prodotto avrà compilati:
- **Specie** (es. "Orata", "Nasello / Merluzzo")
- **Peso interno kg** (il peso reale della cassa)
- **N° cooperativa** (il numero interno dell'asta, mostrato tra parentesi nel listino)
- **Peso pubblicato** (= peso interno + 0.2 kg, quello visibile ai clienti)

---

## 5. Gestione Prezzi e Pesi

Vai su: **Prezzi** del catalogo

Qui puoi modificare per ogni prodotto:
- **Prezzo €/kg** — quello che vedi nel listino e che i clienti vedono nell'ordine
- **Peso pubblicato kg** — di default calcolato automaticamente dall'import, ma modificabile
- **Specie** — modificabile anche manualmente

### Import manuale pesi (metodo alternativo)

Se non hai il file PDF/XLSX dell'asta, puoi importare i pesi da un file CSV o XLSX semplice con due colonne: `progressivo | peso_interno_kg` (opzionale terza colonna per la specie).

---

## 6. Pubblicare il Catalogo

Prima di pubblicare, assicurati che:
- Le foto siano caricate
- I prezzi siano inseriti
- I pesi e le specie siano compilati

Dalla Dashboard, clicca **"Pubblica"** accanto al catalogo. Questo rende visibili tutti i prodotti ai clienti approvati.

I clienti accedono tramite: `https://ordini.fratellidandrassi.com/catalog`

---

## 7. Listino Prezzi (Stampa PDF)

Vai su: **Listino** (bottone blu) dal catalogo nella Dashboard.

La pagina mostra:
- **Statistiche**: numero casse totali, quante hanno peso, quante hanno prezzo, kg totali
- **Anteprima** raggruppata per specie e prezzo
- Due bottoni di stampa

### Stampa Listino Completo

PDF con una tabella per ogni prodotto. Colonne:
- **Prog.** — numero progressivo
- **Specie** — nome della specie
- **Peso int. kg** — peso interno reale
- **Prezzo €/kg** — prezzo al cliente
- **N° coop** — numero cooperativa tra parentesi (es. `(886)`)

### Stampa Listino per Specie

PDF raggruppato: ogni specie ha un'intestazione nera col prezzo, poi le casse di quella specie, poi un rigo grigio con il totale casse e kg.

Entrambi i PDF mostrano nell'intestazione:
- Titolo: "LISTINO PREZZI" o "LISTINO PREZZI PER SPECIE"
- Nome del catalogo (quello che hai inserito come "Nome online")
- Data di stampa

---

## 8. Gestione Ordini

Vai su: **Ordini** nella sidebar

Qui vedi tutti gli ordini ricevuti con:
- Nome e telefono del cliente
- Data e ora
- Stato (attivo, annullato)

**Azioni disponibili:**
- **Annulla ordine** — rimette tutti i prodotti in vendita
- **Rimuovi singolo prodotto** dall'ordine — rimette solo quel prodotto in vendita
- **Elimina ordine** — rimuove il record (i prodotti tornano in vendita)

### Elimina venduti

Nella Dashboard, bottone **"Elimina venduti"** per ogni catalogo. Nasconde ai clienti le casse già vendute (non le elimina dal sistema). Se un ordine viene annullato, le casse tornano automaticamente visibili.

---

## 9. Stampa Preparazione Merce

Da **Ordini**, puoi stampare il PDF di preparazione:

**Singolo ordine**: clicca il bottone di stampa accanto all'ordine. Il PDF mostra foto, numero cassa, specie, peso interno, peso pubblicato, prezzo e una checkbox da spuntare durante la preparazione.

**Cumulativo per periodo**: scegli il range di date e scarica un unico PDF con tutti gli ordini del periodo, raggruppati per cliente.

Su iPhone/iPad il PDF si apre in un'overlay a schermo intero — usa il tasto di download per salvarlo o il tasto di stampa del browser.

---

## 10. Evasione Ordini

Vai su: **Ordini → Evasione**

Mostra tutti gli ordini degli ultimi 2 giorni. Puoi:
- Cliccare su ogni prodotto per spuntarlo come **preparato**
- Filtrare per data
- Stampare la lista preparata (per cliente o per tutti)
- **"Azzera evasione"** — reset completo delle spunte

Lo stato delle spunte viene salvato automaticamente e rimane anche se chiudi e riapri il browser.

---

## 11. Gestione Clienti

Vai su: **Clienti** nella sidebar

Qui vedi tutti i clienti che hanno chiesto accesso con telefono e ragione sociale.

- **Approva** — il cliente può accedere al catalogo e fare ordini
- **Revoca** — il cliente non può più accedere

I clienti si registrano da soli inserendo telefono, nome e ragione sociale nella pagina di accesso al catalogo.

---

## 12. Gestione Venditori

Vai su: **Venditori** nella sidebar

I venditori sono figure che possono fare ordini per conto di clienti diversi (es. agenti).

- **Aggiungi venditore** — inserisci nome e telefono
- **Attiva/Disattiva** — il venditore può o non può operare
- **Elimina** — rimuove il venditore

Gli ordini dei venditori sono separati dagli ordini normali e identificati dalla coppia telefono + nome cliente.

---

## 13. Statistiche

Vai su: **Statistiche** nella sidebar

Mostra i dati di accesso e attività dei clienti: ultime login, ordini effettuati, prodotti acquistati.

---

## Workflow Tipico per un Nuovo Arrivo

1. **Crea catalogo** con titolo interno e nome online
2. **Carica foto** dei prodotti (listino)
3. **Import da file aste** (PDF o XLSX) → specie, pesi e N° coop compilati automaticamente
4. **Inserisci prezzi** nella pagina Prezzi
5. **Stampa listino** per controllo interno (PDF completo o per specie)
6. **Pubblica** il catalogo → i clienti possono ordinare
7. Gestisci gli **ordini** in arrivo
8. Stampa **preparazione merce** e segna l'**evasione**
9. **Elimina venduti** a fine giornata

---

## Note Importanti

**Peso interno vs peso pubblicato**: il peso pubblicato (quello che vedono i clienti) è sempre peso interno + 0,2 kg. Puoi modificarlo manualmente nella pagina Prezzi se necessario.

**N° cooperativa**: è il numero interno dell'asta (diverso dal numero di cassa). Viene compilato automaticamente dall'import file aste e compare tra parentesi nel listino — es. `Cassa 115 (coop 886)`.

**Safari iOS**: i PDF si aprono in un overlay a schermo intero, non in una nuova finestra. Usa il tasto download nell'overlay per salvare.

**Deploy**: ogni modifica al codice viene deployata automaticamente su Railway non appena viene fatto `git push origin main`. Non è necessario fare nulla da Railway.
