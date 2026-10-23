#!/usr/bin/env bash
# Baixa a base de palavras pt-BR (fserb/pt-br, licença MIT) para dados/brutos/.
# Esses arquivos são grandes (~13 MB) e não vão para o git.
set -euo pipefail
cd "$(dirname "$0")/.."
DESTINO="dados/brutos/pt-br"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" pull --ff-only
else
  mkdir -p dados/brutos
  git clone --depth 1 https://github.com/fserb/pt-br "$DESTINO"
fi
echo "Base pronta em $DESTINO"
