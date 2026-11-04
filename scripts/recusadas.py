"""Palavras que os jogadores digitaram e a lista recusou, com a resposta mais parecida da lista.

Lê /api/respostas?dia=...&recusadas=1 (functions/api/respostas.js) e, para cada palavra, procura
na lista da categoria: mesmo nome sem acento, só o primeiro ou o último nome ("Taylor" para
"Taylor Swift"), ou parecida (erro de digitação). Serve para dois usos:

  1. No dia que está no ar: aceitar mais (apelido ou resposta nova), sem mexer nos pontos de ninguém.
  2. Para os próximos dias: ver que tipo de resposta válida a lista não pegou e ajustar o fama.py.

Uso:
    python3 scripts/recusadas.py              # hoje
    python3 scripts/recusadas.py 2026-10-30
Grava dados/sinais/revisao/recusadas-<dia>.csv.
"""
from __future__ import annotations

import csv
import datetime as dt
import difflib
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = RAIZ / "dados" / "categorias"
REVISAO = RAIZ / "dados" / "sinais" / "revisao"
API = "https://nichoojogo.com/api/respostas"


def baixar(dia: str) -> list[dict]:
    pedido = urllib.request.Request(f"{API}?dia={dia}&recusadas=1", headers={"User-Agent": "nicho-recusadas/1"})
    with urllib.request.urlopen(pedido, timeout=30) as r:
        return json.load(r).get("recusadas", [])


def parecidas(texto: str, cat: dict) -> tuple[str, str]:
    """(como casou, resposta da lista) ou ("", "")."""
    alvo = normalizar(texto)
    nomes: dict[str, str] = {}
    for r in cat["respostas"]:
        for n in [r["resposta"], *r["apelidos"]]:
            nomes.setdefault(normalizar(n), r["resposta"])
    pontas: dict[str, set[str]] = {}
    for n, resposta in nomes.items():
        partes = n.split()
        if len(partes) > 1:
            for p in (partes[0], partes[-1]):
                pontas.setdefault(p, set()).add(resposta)
    if alvo in pontas and len(pontas[alvo]) == 1:
        return "primeiro ou último nome", next(iter(pontas[alvo]))
    if alvo in pontas:
        return "nome de várias", " / ".join(sorted(pontas[alvo])[:4])
    perto = difflib.get_close_matches(alvo, list(nomes), n=1, cutoff=0.82)
    if perto:
        return "parecida", nomes[perto[0]]
    contem = [nomes[n] for n in nomes if len(alvo) >= 4 and alvo in n.split()]
    if contem:
        return "palavra de", " / ".join(sorted(set(contem))[:4])
    return "", ""


def main() -> None:
    dia = sys.argv[1] if len(sys.argv) > 1 else dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    linhas = []
    cache: dict[str, dict] = {}
    for r in baixar(dia):
        cid = r["categoria"]
        arq = CATEGORIAS / f"{cid}.txt"
        if not arq.exists():
            continue
        cat = cache.setdefault(cid, ler_categoria(arq))
        como, resposta = parecidas(r["texto"], cat)
        linhas.append({"categoria": cid, "texto": r["texto"], "n": r["n"], "como": como, "na_lista": resposta})
    linhas.sort(key=lambda l: (l["categoria"], -l["n"], l["texto"]))
    REVISAO.mkdir(parents=True, exist_ok=True)
    saida = REVISAO / f"recusadas-{dia}.csv"
    with saida.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["categoria", "texto", "n", "como", "na_lista"])
        w.writeheader()
        w.writerows(linhas)
    atual = None
    for l in linhas:
        if l["categoria"] != atual:
            atual = l["categoria"]
            print(f"\n## {atual}")
        dica = f"  -> {l['como']}: {l['na_lista']}" if l["como"] else ""
        print(f"  {l['n']:>3}  {l['texto']}{dica}")
    print(f"\n{len(linhas)} palavras recusadas em {dia} ({saida.relative_to(RAIZ)})")


if __name__ == "__main__":
    main()
