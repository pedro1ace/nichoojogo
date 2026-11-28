"""Palavras que os jogadores digitaram e a lista recusou, com a resposta mais parecida da lista.

Lê /api/respostas?dia=...&recusadas=1 (functions/api/respostas.js) e, para cada palavra, procura
na lista da categoria: mesmo nome sem acento, só o primeiro ou o último nome ("Taylor" para
"Taylor Swift"), ou parecida (erro de digitação). Serve para dois usos:

  1. No dia que está no ar: aceitar mais (apelido ou resposta nova), sem mexer nos pontos de ninguém.
  2. Para os próximos dias: ver que tipo de resposta válida a lista não pegou e ajustar o fama.py.

Cada palavra também passa pela busca do jogo de hoje (scripts/conferir_jogo.mjs), na coluna jogo_agora.
No topo sai o aviso de BURACO: palavra que a revisão casa com uma resposta da lista ("maluca" ->
Corrida maluca) e o jogo continua recusando. Esse é o erro que não pode passar: o jogador sabia a
resposta e ficou sem ela. Buraco no dia que está no ar vira apelido na hora.

Uso:
    python3 scripts/recusadas.py              # hoje
    python3 scripts/recusadas.py 2026-10-30
Grava dados/sinais/revisao/recusadas-<dia>.csv.
"""
from __future__ import annotations

import csv
import datetime as dt
import subprocess
import difflib
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import ler_categoria, normalizar  # noqa: E402
import fama  # noqa: E402

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


def no_jogo(linhas: list[dict]) -> list[str]:
    """O que a busca do jogo de hoje aceita para cada palavra ("" quando recusa)."""
    pares = [[l["categoria"], l["texto"]] for l in linhas]
    feito = subprocess.run(["node", str(RAIZ / "scripts" / "conferir_jogo.mjs")], input=json.dumps(pares),
                           capture_output=True, text=True, check=True)
    return [r or "" for _, _, r in json.loads(feito.stdout)]


def main() -> None:
    dia = sys.argv[1] if len(sys.argv) > 1 else dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    linhas = []
    cache: dict[str, dict] = {}
    indices: dict[str, dict] = {}
    for r in baixar(dia):
        cid = r["categoria"]
        arq = CATEGORIAS / f"{cid}.txt"
        if not arq.exists():
            continue
        cat = cache.setdefault(cid, ler_categoria(arq))
        como, resposta = parecidas(r["texto"], cat)
        casada = fama.casar(r["texto"], indices.setdefault(cid, fama.indice(cat)))
        if casada and not como:
            como, resposta = "casa no fama.py", casada
        linhas.append({"categoria": cid, "texto": r["texto"], "n": r["n"], "como": como, "na_lista": resposta})
    linhas.sort(key=lambda l: (l["categoria"], -l["n"], l["texto"]))
    for l, jogo in zip(linhas, no_jogo(linhas) if linhas else []):
        l["jogo_agora"] = jogo
    REVISAO.mkdir(parents=True, exist_ok=True)
    saida = REVISAO / f"recusadas-{dia}.csv"
    with saida.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["categoria", "texto", "n", "como", "na_lista", "jogo_agora"])
        w.writeheader()
        w.writerows(linhas)
    certeiras = ("primeiro ou último nome", "casa no fama.py")
    # com 2 ou mais jogadores: com 1 só é muito ruído ("laranja" -> Laranja mofada); as outras ficam no CSV
    buracos = [l for l in linhas if l["como"] in certeiras and not l["jogo_agora"] and l["n"] >= 2]
    if buracos:
        print(f"!!! BURACO: {len(buracos)} palavras que a lista tem e o jogo ainda recusa "
              f"({sum(l['n'] for l in buracos)} jogadores). Apelido já, antes de tudo:")
        for l in sorted(buracos, key=lambda l: -l["n"]):
            print(f"  {l['n']:>3}  {l['categoria']}: {l['texto']} -> {l['na_lista']}")
    corrigidas = [l for l in linhas if l["jogo_agora"]]
    if corrigidas:
        print(f"\n{len(corrigidas)} palavras recusadas no dia que o jogo de hoje já aceita "
              f"({sum(l['n'] for l in corrigidas)} jogadores)")
    atual = None
    for l in linhas:
        if l["categoria"] != atual:
            atual = l["categoria"]
            print(f"\n## {atual}")
        dica = f"  -> {l['como']}: {l['na_lista']}" if l["como"] else ""
        if l["jogo_agora"]:
            dica += f"  [o jogo agora aceita: {l['jogo_agora']}]"
        print(f"  {l['n']:>3}  {l['texto']}{dica}")
    print(f"\n{len(linhas)} palavras recusadas em {dia} ({saida.relative_to(RAIZ)})")


if __name__ == "__main__":
    main()
