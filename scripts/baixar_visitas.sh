#!/usr/bin/env bash
# Baixa as visitas mensais de pessoas (não robôs) na pt.wikipedia, a partir dos dumps
# públicos da Wikimedia (pageview_complete), para dados/brutos/visitas/pt-AAAAMM.tsv.
# Cada linha: título<TAB>visitas no mês (somando desktop, celular e app).
#
# Por que dump e não a API de visitas: a API limita os pedidos e, com milhares de
# respostas, levava horas. O dump de um mês tem uns 6 GB, mas a pt.wikipedia vem antes
# de boa parte do arquivo; o download para assim que ela termina. Não vai para o git.
#
# Uso: scripts/baixar_visitas.sh            # os 12 últimos meses completos
#      scripts/baixar_visitas.sh 2026-09     # só um mês
set -euo pipefail
cd "$(dirname "$0")/.."
DESTINO="dados/brutos/visitas"
mkdir -p "$DESTINO"
AGENTE="NichoJogo/0.1 (https://github.com/pedro1ace/nichoojogo)"

baixar_mes() {  # $1 = AAAA-MM
  local ano="${1%-*}" mes="${1#*-}"
  local saida="$DESTINO/pt-$ano$mes.tsv"
  [ -s "$saida" ] && { echo "já existe: $saida"; return; }
  local url="https://dumps.wikimedia.org/other/pageview_complete/monthly/$ano/$ano-$mes/pageviews-$ano$mes-user.bz2"
  echo "baixando $ano-$mes..."
  # awk sai quando a pt.wikipedia acaba; o curl é cortado junto e avisa "Failure writing
  # output to destination" (é normal), por isso o "|| true"
  { curl -sS -A "$AGENTE" "$url" | bzcat 2>/dev/null \
      | awk -F' ' '$1 == "pt.wikipedia" { visto = 1; v[$2] += $(NF-1); next } visto { exit }
                   END { for (t in v) print t "\t" v[t] }' > "$saida.parcial"; } || true
  [ -s "$saida.parcial" ] || { echo "falhou: $ano-$mes" >&2; rm -f "$saida.parcial"; return 1; }
  mv "$saida.parcial" "$saida"
  echo "pronto: $saida ($(wc -l < "$saida") artigos)"
}

if [ $# -gt 0 ]; then
  meses=("$@")
else
  meses=()
  for i in $(seq 1 12); do meses+=("$(date -d "$(date +%Y-%m-01) -$i month" +%Y-%m)"); done
fi
# 4 meses ao mesmo tempo: o gargalo é o download de cada arquivo, não a rede toda
printf '%s\n' "${meses[@]}" | xargs -P 4 -I{} bash -c "$(declare -f baixar_mes); DESTINO='$DESTINO' AGENTE='$AGENTE' baixar_mes {}"
