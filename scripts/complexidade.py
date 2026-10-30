"""Complexidade de palavras comuns (categorias tipo "Palavras do Termo").

Numa lista de palavras do dicionário a simulação de jogadores só cobre umas 150 palavras; o resto
caía todo na faixa rara, e aí "minha" valia tanto quanto "âmago". Aqui a medida é a frequência da
palavra no português (wordfreq, escala zipf: 7 = "de", 0 = nunca aparece). O pontuar.py lê o
resultado em dados/sinais/frequencia/<cat>.json: palavra comum ganha poucos pontos, palavra
difícil ganha muitos.

Com --limpar, também tira da lista o que não é palavra de verdade hoje:
  - grafia antiga ou estrangeira pouco usada ("ouvyr", "muyto", "mytho", "lucta", "kayak");
  - o que não está no dicionário, não aparece em nenhum texto e não é plural nem verbo conjugado
    de uma palavra do dicionário.
O que sai fica em dados/sinais/revisao/absurdas-<cat>.txt, para conferir.

Uso:
    pip install wordfreq
    python3 scripts/complexidade.py palavras-do-termo [--limpar]
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

from wordfreq import zipf_frequency

RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = RAIZ / "dados" / "categorias"
FREQUENCIA = RAIZ / "dados" / "sinais" / "frequencia"
REVISAO = RAIZ / "dados" / "sinais" / "revisao"
FAMA = RAIZ / "dados" / "sinais" / "fama"
DICIONARIO_URL = "https://raw.githubusercontent.com/pythonprobr/palavras/master/palavras.txt"
DICIONARIO = RAIZ / "dados" / "brutos" / "dicionario-pt.txt"  # cache, fora do git

TERMINACOES = sorted(
    "o a e as es am em ei ou ai ia ias iam i is iu eu au ais ste mos dei sse ram rei rá ra da do ço çou "
    "gue que quei guei us uz õem ões õe era ija ujam".split(), key=len, reverse=True)
TROCA = {"ç": "c", "gu": "g", "qu": "c", "c": "ç", "g": "gu"}
# grafia de antes de 1911, ou estrangeira: y no meio, th, ph, consoante dobrada, til fora do lugar
GRAFIA_ANTIGA = re.compile(r"(?<=[a-z])y|y(?=[a-z])|th|ph|nn|mm|ll|cc|cç|ct[ao]$|[ẽũ]|w$")


def dicionario() -> set[str]:
    if not DICIONARIO.exists():
        DICIONARIO.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(DICIONARIO_URL, timeout=60) as r:
            DICIONARIO.write_bytes(r.read())
    return {l.strip().lower() for l in DICIONARIO.read_text(encoding="utf-8").splitlines()}


def de_verbo_ou_plural(p: str, dic: set[str]) -> bool:
    for s, t in (("s", ""), ("es", ""), ("ões", "ão"), ("ães", "ão"), ("is", "l"), ("éis", "el"), ("ns", "m")):
        if p.endswith(s) and p[: -len(s)] + t in dic:
            return True
    for s in TERMINACOES:
        if not p.endswith(s) or len(p) - len(s) < 2:
            continue
        raiz = p[: -len(s)]
        raizes = {raiz}
        for velho, novo in TROCA.items():
            if raiz.endswith(velho):
                raizes.add(raiz[: -len(velho)] + novo)
        if any(r + inf in dic for r in raizes for inf in ("ar", "er", "ir", "or", "uir", "zer", "por")):
            return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("categoria")
    ap.add_argument("--limpar", action="store_true", help="tira da lista as palavras que não existem")
    args = ap.parse_args()

    arq = CATEGORIAS / f"{args.categoria}.txt"
    linhas = arq.read_text(encoding="utf-8").splitlines()
    fama_arq = FAMA / f"{args.categoria}.json"
    fama = json.loads(fama_arq.read_text(encoding="utf-8")).get("respostas", {}) if fama_arq.exists() else {}

    dic = dicionario() if args.limpar else set()
    manter, fora = [], []
    for linha in linhas:
        if not linha.strip() or linha.startswith("#"):
            manter.append(linha)
            continue
        p = linha.split("|")[0].strip()
        if args.limpar and not (fama.get(p) or {}).get("na_simulacao") and p.lower() not in dic:
            z = zipf_frequency(p, "pt")
            if GRAFIA_ANTIGA.search(p.lower()) and z < 3:
                fora.append(f"{p}  # grafia antiga ou estrangeira")
                continue
            if z == 0 and not de_verbo_ou_plural(p.lower(), dic):
                fora.append(f"{p}  # não está no dicionário nem em textos")
                continue
        manter.append(linha)

    if args.limpar:
        arq.write_text("\n".join(manter) + "\n", encoding="utf-8")
        REVISAO.mkdir(parents=True, exist_ok=True)
        (REVISAO / f"absurdas-{args.categoria}.txt").write_text("\n".join(fora) + "\n", encoding="utf-8")
        print(f"{args.categoria}: {len(fora)} palavras saíram da lista")

    zipf = {}
    for linha in manter:
        if linha.strip() and not linha.startswith("#"):
            p = linha.split("|")[0].strip()
            zipf[p] = round(zipf_frequency(p, "pt"), 2)
    FREQUENCIA.mkdir(parents=True, exist_ok=True)
    (FREQUENCIA / f"{args.categoria}.json").write_text(
        json.dumps(zipf, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    print(f"{args.categoria}: frequência de {len(zipf)} palavras em dados/sinais/frequencia/")


if __name__ == "__main__":
    main()
