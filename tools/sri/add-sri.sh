#!/usr/bin/env bash
# Stampa le impronte SRI delle librerie esterne. Va eseguito da un computer con accesso ai CDN
# (la sandbox di Claude non ce l'ha). NON modifica nessun file: gli hash si incollano a mano, vedi sotto.
#
#   bash tools/sri/add-sri.sh
#
# 17/11/2026: tolto --apply. Faceva due danni: usava `sed -i -E`, sintassi GNU che su macOS lascia file
# spuri invece di modificare in posto, e comunque copriva solo 2 librerie su 6, perche' le altre non sono
# tag <script> ma vengono caricate da JavaScript al primo uso.
#
# Dove va ogni hash:
#   heic2any, exif-js            -> attributo integrity dei tag <script> in v2.html e index.html
#   xlsx, jspdf, jspdf-autotable -> CDN_SRI in v2.html (v2 le carica a richiesta); tag <script> in index.html
#   @supabase/supabase-js        -> LIB_SRI in tools/auth/dp-auth.js (poi tools/auth/apply.py per riportarlo
#                                   in v2.html e index.html: e' la piu' delicata, gira con la sessione)
#
# Gli hash cambiano solo se cambia la VERSIONE della libreria: le URL sono bloccate su una versione precisa.
set -euo pipefail
URLS=(
 https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js
 https://cdnjs.cloudflare.com/ajax/libs/exif-js/2.3.0/exif.min.js
 https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
 https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
 https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js
 https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js
)
for u in "${URLS[@]}"; do
  echo "sha384-$(curl -fsSL "$u" | openssl dgst -sha384 -binary | openssl base64 -A)  $u"
done
echo
echo "Confronto con quanto e' gia' nel codice:"
cd "$(dirname "$0")/../.."
grep -o 'sha384-[A-Za-z0-9+/=]\{64\}' v2.html index.html tools/auth/dp-auth.js 2>/dev/null | sort -u || true
