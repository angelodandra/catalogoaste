# Documentazione Tecnica — Catalogo Pesce F.lli D'Andrassi

> Documento di riferimento per sviluppo e manutenzione.
> Aggiornato: 6 aprile 2026 (v3)

---

## 1. Stack Tecnologico

| Componente | Tecnologia |
|---|---|
| Framework | Next.js 16.1.3 (App Router, Turbopack) |
| Linguaggio | TypeScript |
| UI | Tailwind CSS |
| Database + Auth | Supabase (PostgreSQL) |
| Storage immagini | Supabase Storage (`catalog-images`, `order-pdfs`) |
| PDF generation | PDFKit (server-side, `runtime = "nodejs"`) |
| Import file | SheetJS (xlsx) |
| Deploy | Railway (auto-deploy da GitHub push su `main`) |
| Repo GitHub | `https://github.com/angelodandra/catalogoaste.git` |
| URL produzione | `https://ordini.fratellidandrassi.com` |
| Backup branch stabile | `backup/stable-28mar2026` (commit `84e1f9c`) |
| Backup branch aggiornato | `backup/v2-28mar2026` (commit `1259423`) |

---

## 2. Struttura del Progetto

```
app/
  admin/                        # Pannello amministratore
    layout.tsx                  # Layout con SIDEBAR (Dashboard, Ordini, Clienti, Venditori, Statistiche)
    page.tsx                    # Dashboard: cataloghi, stats, crea catalogo, "Elimina venduti"
    login/                      # Pagina login admin (Supabase Auth)
    catalog/[catalogId]/
      listino/                  # Gestione prodotti del catalogo (upload foto, ecc.)
      pricing/                  # Prezzi + peso pubblicato + import pesi CSV/XLSX + import da file aste
      pricelist/                # Listino prezzi: stats, anteprima, stampa PDF completo o per specie
    orders/
      page.tsx                  # Lista ordini, annulla, rimuovi singolo prodotto
      print/PrintClient.tsx     # Stampa ordini (per cliente / per prodotto / per catalogo)
      fulfillment/page.tsx      # Evasione ordini con stato persistente (localStorage)
    customers/                  # Approva/revoca accesso clienti
    sellers/page.tsx            # Gestione venditori (lista, crea, attiva/disattiva, elimina)
    stats/                      # Statistiche login e attività clienti

  api/
    admin/
      add-product/              # Aggiunge singolo prodotto
      add-products-bulk/        # Aggiunge prodotti in bulk
      cancel-order/             # Annulla ordine → rimette prodotti in vendita (is_sold=false, is_published=true)
      catalog/                  # Operazioni su catalogo
      create-catalog/           # Crea nuovo catalogo
      customers/                # CRUD clienti
      delete-catalog/           # Elimina catalogo
      delete-orders/            # Elimina ordini → rimette prodotti in vendita
      delete-sold-products/     # Soft-hide prodotti venduti (is_published=false, NON elimina)
      import-pesi/              # Import peso interno da CSV/XLSX → auto-calcola weight_kg = interno + 0.2
      orders/
        prep-pdf/               # PDF "Preparazione merce" per singolo ordine
        prep-pdf-bulk/          # PDF "Preparazione merce" cumulativo per periodo
        remove-item/            # Rimuove singola riga da ordine
      publish-catalog/          # Pubblica catalogo (is_published=true su tutti i prodotti)
      remove-order-item/        # Rimuove prodotto da ordine → rimette in vendita
      reset-sold/               # Reset globale is_sold → rimette tutto in vendita
      save-prices/              # Salva prezzi e peso pubblicato (NON tocca peso_interno_kg)
      parse-aste-source/        # Auto-parser file aste: estrae specie/peso/coop da PDF o XLSX
      catalog/
        pricelist-pdf/          # Genera PDF listino prezzi (completo o raggruppato per specie)
      sellers/
        list/                   # Lista venditori
        add/                    # Aggiunge venditore
        toggle/                 # Attiva/disattiva venditore
        delete/                 # Elimina venditore
      stats/                    # Dati statistiche
      test-wa/                  # Test WhatsApp
      unsell-product/           # Rimette singolo prodotto in vendita
      update-specie/            # Aggiorna specie di un prodotto

    checkout/
      check-availability/       # FASE 1: verifica disponibilità prodotti prima dell'ordine
      place-order/              # FASE 2: piazza l'ordine (skip prodotti già venduti)

    orders/
      generate-pdf/             # Genera PDF riepilogo ordine cliente

  catalog/
    page.tsx                    # Vetrina multi-catalogo (clienti approvati)
    [catalogId]/page.tsx        # Catalogo singolo con griglia prodotti

  checkout/
    [catalogId]/page.tsx        # Carrello + checkout a due fasi

  o/[orderId]/                  # Riepilogo ordine post-acquisto

components/
  Grid3x3.tsx                   # Griglia prodotti con overlay ESAURITO (velino bianco + banner rosso)
  AdminLogoutButton.tsx         # Pulsante logout sidebar

lib/
  supabaseBrowser.ts            # Client Supabase browser-side
  supabaseServer.ts             # Client Supabase server-side (service role)
  adminFetch.ts                 # Fetch con Bearer token per API admin
  requireAdmin.ts               # Middleware auth per API admin
```

---

## 3. Tabelle Database (Supabase)

### `catalogs`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| title | text | Titolo interno (es. "CIVITAVECCHIA 24-03-26") |
| online_title | text | Nome visibile ai clienti (es. "Civitavecchia") |
| is_published | bool | Visibile ai clienti |
| status | text | "open" / "closed" |
| created_at | timestamptz | |

### `products`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| catalog_id | uuid FK → catalogs | |
| progressive_number | int | Progressivo globale (usato per matching import pesi) |
| box_number | text | Numero cassa |
| image_path | text | Path nello storage `catalog-images` |
| price_eur | numeric | Prezzo al cliente |
| weight_kg | numeric | Peso pubblicato (visibile ai clienti, = peso_interno + 0.2) |
| peso_interno_kg | numeric | Peso interno reale (da import CSV, usato nelle stampe) |
| specie | text | Es. "Orata", "Spigola" |
| numero_interno_cassa | text | N° coop dell'asta (da import auto file aste) |
| is_sold | bool | true = venduto (occupato da un ordine) |
| is_published | bool | false = nascosto (usato da "Elimina venduti") |

### `orders`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| catalog_id | uuid FK | |
| customer_name | text | |
| customer_phone | text | |
| owner_phone | text | Telefono del venditore (se ordine fatto da venditore) |
| created_at | timestamptz | |

### `order_items`
| Campo | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| order_id | uuid FK → orders | |
| product_id | uuid FK → products | |
| qty | int | Sempre 1 per ogni cassa |

### `customers`
| Campo | Tipo | Note |
|---|---|---|
| phone | text PK | |
| company | text | Ragione sociale |
| approved | bool | Se false il cliente non può accedere |

### `sellers` (tabella per gestione venditori)
| Campo | Tipo | Note |
|---|---|---|
| phone | text PK | |
| name | text | |
| active | bool | Se false il venditore non può operare |

---

## 4. Funzionalità Principali

### Checkout a due fasi (anti race-condition)
1. **Fase 1** — `POST /api/checkout/check-availability`: verifica `is_sold` su tutti i prodotti del carrello. Restituisce lista prodotti non disponibili.
2. **Fase 2** — `POST /api/checkout/place-order`: se ci sono prodotti sold, li skippa. Crea ordine solo con quelli disponibili. Usa RPC Supabase `reserve_products` per atomicità.

Se tutti i prodotti sono già venduti → risponde 409 senza creare ordine.
Il cliente vede un pannello arancione con lista prodotti non disponibili e può scegliere se procedere con i rimanenti.

### Import pesi (CSV/XLSX)
- File: due colonne, senza header: `[progressivo, peso_interno_kg]`, opzionale terza colonna `[specie]`
- API: `POST /api/admin/import-pesi` con `mode=preview` o `mode=apply`
- Salva `peso_interno_kg` esatto dal file
- Calcola automaticamente `weight_kg = Math.round((peso_interno_kg + 0.2) * 100) / 100`
- **IMPORTANTE**: `save-prices` NON sovrascrive `peso_interno_kg` (bug precedente risolto)

### Elimina venduti (soft-hide)
- Pulsante per catalogo nella dashboard admin
- Imposta `is_published = false` sui prodotti con `is_sold = true`
- NON elimina record né immagini
- Quando si annulla un ordine → `is_sold = false, is_published = true` (ripristino completo)

### Overlay prodotti esauriti
- Componente `Grid3x3.tsx`
- Velino bianco semitrasparente (`bg-white/30`) + banner rosso "ESAURITO"
- La foto del prodotto rimane visibile
- Il prodotto rimane nel catalogo fino a "Elimina venduti"

### Evasione ordini (`/admin/orders/fulfillment`)
- Mostra ordini degli ultimi 2 giorni
- Click su prodotto → spunta come preparato
- Stato salvato in `localStorage` (chiave `fulfillment:prepared`) → persiste tra navigazioni
- "Azzera evasione" → reset completo con confirm
- Stampa per singolo cliente o tutti i clienti preparati

### Raggruppamento ordini per venditore
- Chiave composita `phone|name` per separare ordini dello stesso venditore per clienti diversi
- Applicato in: `PrintClient.tsx`, `fulfillment/page.tsx`, `prep-pdf-bulk/route.ts`

### Sidebar admin
- File: `app/admin/layout.tsx`
- Voci: Dashboard, Ordini, Clienti, Venditori, Statistiche
- Responsive: su mobile mostra hamburger + overlay
- Logo F.lli D'Andrassi in alto a sinistra

### Stampa PDF su Safari iOS — pattern overlay iframe
Safari iOS blocca `window.open()` chiamato dopo operazioni `async/await`. Soluzione adottata in tutta l'app: mostrare il contenuto in un overlay a schermo intero sulla stessa pagina.

**Per PDF binari** (es. "Stampa preparazione" in `/admin/orders/page.tsx`):
```tsx
const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

// Nel click handler (anche async):
const blob = await res.blob();
const url = URL.createObjectURL(blob);
setPdfBlobUrl(url); // niente window.open!

// Nell'overlay JSX:
{pdfBlobUrl && (
  <div className="fixed inset-0 z-50 flex flex-col bg-black">
    <div className="flex items-center justify-between bg-white border-b px-4 py-3">
      <button onClick={() => { URL.revokeObjectURL(pdfBlobUrl!); setPdfBlobUrl(null); }}>✕ Chiudi</button>
      <a href={pdfBlobUrl} download="file.pdf" className="...">⬇ Scarica PDF</a>
    </div>
    <iframe src={pdfBlobUrl} className="flex-1 w-full border-0" />
  </div>
)}
```

**Per HTML dinamico** (es. stampe evasione ordini in `/admin/orders/fulfillment/page.tsx`):
```tsx
const [printHtml, setPrintHtml] = useState<string | null>(null);

// Invece di window.open:
setPrintHtml(htmlString);

// Nell'overlay JSX:
{printHtml && (
  <div className="fixed inset-0 z-50 flex flex-col bg-white">
    <div className="flex items-center justify-between border-b px-4 py-3">
      <button onClick={() => setPrintHtml(null)}>✕ Chiudi</button>
      <button onClick={() => {
        const iframe = document.getElementById("print-iframe") as HTMLIFrameElement;
        iframe?.contentWindow?.print();
      }}>🖨 Stampa</button>
    </div>
    <iframe id="print-iframe" srcDoc={printHtml} className="flex-1 w-full border-0" />
  </div>
)}
```

### Gestione venditori
- Pagina: `/admin/sellers/page.tsx`
- API: `/api/admin/sellers/list`, `/add`, `/toggle`, `/delete`
- Tabella DB: `sellers` (phone PK, name, active)
- I venditori possono fare ordini per conto di clienti diversi → separati dalla chiave composita `phone|name`

---

## 5. Logica di Ripristino Stock

Ogni volta che un prodotto viene rimesso in vendita, devono essere impostati **entrambi**:
```typescript
{ is_sold: false, is_published: true }
```

File che fanno questo:
- `app/api/admin/cancel-order/route.ts`
- `app/api/admin/delete-orders/route.ts`
- `app/api/admin/remove-order-item/route.ts`
- `app/api/admin/reset-sold/route.ts`
- `app/api/admin/unsell-product/route.ts`

---

## 6. Stampe PDF

### Tipi di stampa (`/admin/orders/print`)
- **Per cliente** (`type=byOrder`): raggruppa casse per cliente con totale
- **Per prodotto** (`type=byProduct`): raggruppa per specie, mostra chi ha ordinato ogni cassa
- **Per catalogo** (`type=byCatalog`): raggruppa per catalogo

Tutti mostrano: `peso_interno_kg` (int.) e `weight_kg` (pub.)

### PDF "Preparazione merce"
- Singolo ordine: `GET /api/admin/orders/prep-pdf?orderId=...`
- Cumulativo per periodo: `GET /api/admin/orders/prep-pdf-bulk?from=...&to=...`
- Contiene: foto prodotto, numero cassa, specie, peso interno, peso pubblicato, prezzo, checkbox da spuntare

---

## 7. Deploy

### Processo
1. Modifiche al codice nella cartella locale `catalogo-pesce-CALUDE/`
2. `git add <files>`
3. `git commit -m "..."`
4. `git push origin main` → Railway fa build automatico e deploy

### Rollback
```bash
git push origin backup/stable-28mar2026:main --force
```

### Variabili d'ambiente Railway (vedere `railway.catalogoaste.production.env.backup`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_ADMIN_EMAILS` (email ammesse al pannello admin, separate da virgola)
- `APP_BASE_URL` (es. `https://ordini.fratellidandrassi.com`)

---

## 8. Problemi Risolti (Storico)

| Problema | Causa | Soluzione |
|---|---|---|
| `save-prices` azzerava `peso_interno_kg` | Route aggiornava sempre tutti i campi, incluso peso_interno con `undefined→null` | Aggiornare `peso_interno_kg` solo se esplicitamente presente nel payload |
| Ordini dello stesso venditore per clienti diversi si fondevano | Chiave gruppo era solo `phone` | Chiave composita `phone\|name` |
| React key duplicata nella stampa ordini | `key={g.phone}` duplicato per venditore multi-cliente | `key={\`${g.phone}\|${g.name}\`}` |
| Stato evasione perso al refresh | Nessuna persistenza | `localStorage` con serializzazione Set→Array |
| Annullare ordine non rimetteva in vendita | `cancel-order` impostava solo `is_sold=false`, non `is_published=true` | Aggiunto `is_published: true` in tutte le route di ripristino |
| Build Railway fallita su `generate-pdf` | `order.catalogs?.title` — TypeScript typava `catalogs` come array | Cast `order = orderRaw as any` |
| Build Railway fallita su `generate-pdf` | File locale diverso da quello committato (sync issue) | Aggiunta riga cast esplicita + re-commit |
| "Stampa preparazione" non funziona su Safari iOS/iPadOS | `window.open()` bloccato dopo `await` — Safari richiede gesture sincrona | Overlay iframe a schermo intero sulla stessa pagina (vedi sezione 4) |

---

## 9. Pattern Importanti

### `adminFetch` — chiamate API admin
Tutte le chiamate alle API admin devono usare `adminFetch` (non `fetch` diretto) per passare il Bearer token:
```typescript
import { adminFetch } from "@/lib/adminFetch";
const res = await adminFetch("/api/admin/...", { method: "POST", ... });
```

### `requireAdmin` — protezione API lato server
Ogni route admin server-side deve chiamare:
```typescript
import { requireAdmin } from "@/lib/requireAdmin";
await requireAdmin(req); // lancia eccezione se non autorizzato
```

### Supabase join → array o oggetto
Quando si fa una join Supabase tipo `catalogs(title,online_title)`, il tipo restituito può essere array o oggetto. Gestire sempre così:
```typescript
const cat = Array.isArray(p.catalogs) ? p.catalogs[0] : p.catalogs;
const title = cat?.title || "";
```

### Peso visibile vs interno
- `peso_interno_kg`: viene SOLO dall'import CSV/XLSX, mai modificato manualmente
- `weight_kg`: peso pubblicato = `peso_interno_kg + 0.2`, modificabile nella pagina prezzi
- Le stampe mostrano entrambi: `int. X.XX kg` e `pub. X.XX kg`

### Nome catalogo nei PDF
Usare sempre `online_title || title` dalla tabella `catalogs` — mai il campo `name` (che può contenere l'UUID). Questo è lo stesso campo usato dalle pagine cliente.

---

## 10. Funzionalità Aggiunte il 6 Aprile 2026

### Auto-parser file aste (`/api/admin/parse-aste-source`)

Elimina la necessità di creare manualmente il file pesi/specie. Legge direttamente il PDF o XLSX di asta e assegna in automatico specie, peso_interno_kg e numero_interno_cassa ai prodotti del catalogo per numero progressivo.

**Formati supportati:**

PDF — formato Civitavecchia "Dettaglio lotti":
- Estrazione testo con pdfjs-dist legacy build
- Ricostruzione righe per coordinata Y (transform[5])
- Regex di parsing: `PDF_ROW_RE = /^(\d+)\s+(.+?)\s+(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s+(\d+[,.]?\d*)\s+(\d+)$/`
- Colonne estratte: numero lotto, specie (italiano), peso kg, n° cooperativa

XLSX — formato Acquisti Mercati "Francia":
- Foglio: ACQUISTI
- Colonna 2 (C) = numero lotto cooperativa
- Colonna 8 (I) = nome specie in italiano
- Colonna 15 (P) = peso netto kg

**Parametri API:**
- `catalogId` — ID catalogo target
- `mode` — `preview` (solo anteprima) o `apply` (salva su DB)
- `file` — multipart, PDF o XLSX
- `progressiveStart` — (opzionale) progressivo di partenza per il matching

**Dipendenze critiche:**

```ts
// Bypass Turbopack: assegnare a variabile any prima di dynamic import
const _pdfPath: any = "pdfjs-dist/legacy/build/pdf.mjs";
const pdfjsLib: any = await import(/* webpackIgnore: true */ _pdfPath);

// Worker URL con pathToFileURL (NON require.resolve, NON file:// manuale)
import * as nodeUrl from "url";
pdfjsLib.GlobalWorkerOptions.workerSrc = nodeUrl.pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs")
).href;
```

**`instrumentation.ts`** (obbligatorio per pdfjs-dist in Next.js):
```ts
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // pdfjs-dist canvas.js usa DOMMatrix/ImageData/Path2D a load time → stub necessari
    if (!globalThis["DOMMatrix"]) { /* FakeDOMMatrix */ }
    if (!globalThis["ImageData"]) { /* stub */ }
    if (!globalThis["Path2D"]) { /* stub */ }
  }
}
```

**`next.config.ts`** — moduli da non bundlare:
```ts
serverExternalPackages: ["pdf-parse", "pdfjs-dist", "pdfkit"]
```

---

### Listino Prezzi (`/admin/catalog/[catalogId]/pricelist`)

Pagina admin con:
- Statistiche: totale casse, con peso, con prezzo, kg totali
- Anteprima raggruppata per specie+prezzo
- Due bottoni di stampa PDF (aperti in nuova tab)

**PDF Listino completo** (`mode=individual`):
- Tabella: Prog. | Specie | Peso int. kg | Prezzo €/kg | N° coop
- Colonna N° coop: mostra `numero_interno_cassa` tra parentesi se presente, altrimenti `box_number`
- Gap 12pt tra colonna Prezzo e N° coop (evita fusione visiva)
- Paginazione automatica con header ripetuto

**PDF Listino per specie** (`mode=grouped`):
- Raggruppato per specie (alfabetico) + prezzo (decrescente)
- Header nero per ogni gruppo con nome specie e prezzo
- Riga grigia di riepilogo: N casse — totale X.XX kg
- Paginazione con page-break intelligente

**Intestazione PDF:**
- Titolo centrato: "LISTINO PREZZI" / "LISTINO PREZZI PER SPECIE"
- Sottotitolo: `catalogs.online_title || catalogs.title` — omesso se assente (mai UUID)
- Data di stampa in grigio

**Link dalla dashboard admin:** bottone "Listino" (blue outline) accanto a "Prezzi" per ogni catalogo.

---

## 11. Problemi Risolti il 6 Aprile 2026

| Problema | Causa | Soluzione |
|---|---|---|
| `ReferenceError: DOMMatrix is not defined` | pdfjs-dist canvas.js valuta `new DOMMatrix()` al caricamento del modulo, prima che qualsiasi polyfill sia attivo | `instrumentation.ts` con stub su `globalThis` prima di ogni import |
| `"Setting up fake worker failed: Invalid URL"` | `require.resolve()` non funziona con `.mjs`; `file://` + path stringa produce URL malformato | `pathToFileURL(path.join(process.cwd(), "node_modules/pdfjs-dist/..."))` |
| Turbopack "Module not found" per `pdfjs-dist/legacy/build/pdf.mjs` | pdfjs-dist v5 ha `exports: {}` vuoto; Turbopack rifiuta il subpath a build time | `const _pdfPath: any = "pdfjs-dist/legacy/build/pdf.mjs"` + `import(/* webpackIgnore: true */ _pdfPath)` |
| TypeScript "Cannot find module pdfjs-dist/legacy/build/pdf.mjs" | TS risolve i literal string staticamente anche con `any` sulla variabile di destinazione | Assegnare prima a variabile tipata `any`, poi importare dalla variabile |
| "PrezzoCassa" fuso nell'intestazione PDF listino | Testo Prezzo right-aligned finiva immediatamente prima della colonna Cassa | `COL_GAP = 12` tra le due colonne sia nell'header che nei dati |
| Nome catalogo non compare nel PDF | La query leggeva `catalogs.name` che contiene l'UUID, non il nome visibile | Query su `online_title, title`; mostra `online_title \|\| title`, omette se assente |
