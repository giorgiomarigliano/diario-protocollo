#!/usr/bin/env bash
# Calcola gli hash SRI degli script CDN di v2.html/index.html e (con --apply) li inserisce nei tag.
# 13/11/2026: aggiunta la libreria di accesso (@supabase/supabase-js da jsDelivr), che e' la piu' delicata:
# gira con la sessione e con accesso a tutti i dati. Non e' in un tag <script> ma nella stringa LIB del blocco DP-AUTH,
# quindi per quella lo script stampa solo l'hash: va messo a mano in dp-auth.js (campo integrity del tag creato da loadLib).
# Va eseguito da un computer con accesso a cdnjs (la sandbox di Claude non lo ha).
# Uso: bash tools/sri/add-sri.sh          # stampa gli hash
#      bash tools/sri/add-sri.sh --apply  # aggiunge integrity+crossorigin a v2.html (e index.html per heic2any/exif)
set -euo pipefail
cd "$(dirname "$0")/../.."
URLS=(
 https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js
 https://cdnjs.cloudflare.com/ajax/libs/exif-js/2.3.0/exif.min.js
 https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
 https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
 https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js
 https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js
)
for u in "${URLS[@]}"; do
  h="sha384-$(curl -fsSL "$u" | openssl dgst -sha384 -binary | openssl base64 -A)"
  echo "$h  $u"
  if [ "${1:-}" = "--apply" ]; then
    for f in v2.html index.html; do
      grep -q "$u" "$f" || continue
      grep -q "integrity=\"$h\"" "$f" && continue
      # solo i tag <script src="URL"> senza integrity; le URL in stringhe JS (xlsx/jspdf) vanno trattate a mano
      sed -i -E "s#<script src=\"$u\"([^>]*)>#<script src=\"$u\" integrity=\"$h\" crossorigin=\"anonymous\"\1>#" "$f"
    done
  fi
done
