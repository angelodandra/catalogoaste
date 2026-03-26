# MANUALE RIPARTENZA --- ASTA CATALOGO PESCE

## STATO ATTUALE

-   Produzione stabile su Railway
-   Catalogo singolo funzionante
-   Login, carrello, checkout OK

## COMANDI BASE

railway up railway status railway login --browserless

## FLUSSO CORRETTO

1.  Sviluppo in locale
2.  Test completo
3.  Deploy finale

## ARCHITETTURA

-   catalogs
-   products
-   relazione via catalog_id

## PROBLEMI RISOLTI

-   Git secrets rimossi
-   Deploy Railway sistemato
-   TypeScript fix catalogs\[\]
-   Carrello ripristinato

## PROSSIMO STEP

-   Vetrina unica multi-catalogo
-   Campo: is_visible_today

## REGOLE

-   NON testare in produzione
-   NON cambiare flussi live
-   sempre fallback funzionante

## RIPARTENZA

Scrivere: "ripartiamo da manuale"
