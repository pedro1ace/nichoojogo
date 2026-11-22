"""Procura buracos de apelido: forma que o fama.py casa com uma resposta e o JOGO recusa.

O fama.py casa solto ("maluca" -> Corrida maluca, "sirio" -> Pão sírio: sem a palavra do tema, só a
última palavra, sem "queijo de"...). Se o jogo não aceita a mesma forma, o jogador digita, é recusado
e ninguém percebe, porque na revisão a palavra parece "já casada". Foi o que deixou "australiano"
e "maluca" de fora em novembro. Aqui cada forma é passada pela busca do jogo (scripts/conferir_jogo.mjs).

Uso:
    python3 scripts/testar_buracos.py                 # todas as categorias de dados/ordem.txt
    python3 scripts/testar_buracos.py molhos hobbies  # só estas
Sai com código 1 se o jogo recusar alguma (aceitar como OUTRA resposta parecida só é listado: em geral
são duas respostas que são a mesma, como Corrida de rato e Corrida de ratos).
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fama  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent


def categorias_da_ordem() -> list[str]:
    ids = []
    for l in (RAIZ / "dados" / "ordem.txt").read_text(encoding="utf-8").splitlines():
        l = l.strip()
        if l and not l.startswith("#") and not l.startswith("- "):
            ids.append(l)
    return ids


# Palavras do tema que o jogador pula ("Pão sírio" -> "sírio", "Biscoito Nikito" -> "nikito").
# Além destas, contam as palavras do próprio id da categoria ("tipos-de-corrida" -> corrida).
GENERICAS = {
    "pao", "biscoito", "bolacha", "molho", "queijo", "sorvete", "pastel", "bolo", "suco", "doce", "torta",
    "sopa", "salada", "praia", "rio", "mar", "lago", "lagoa", "ilha", "monte", "serra", "danca", "jogo",
    "corrida", "festa", "time", "clube", "estadio", "flor", "arvore", "massa", "macarrao", "chocolate",
    "bala", "cerveja", "vinho", "cha", "cafe", "pizza", "sanduiche", "carne", "peixe", "cor", "dia", "raca",
    "cao", "gato", "passaro", "planta", "fruta", "musica", "banda", "filme", "livro", "carro", "moto",
}
CONECT = {"de", "do", "da", "dos", "das", "e", "com", "a", "o", "em", "na", "no"}


def _raiz(p: str) -> str:
    return p[:-1] if len(p) > 3 and p.endswith("s") else p


def formas(cat: dict) -> list[tuple[str, str]]:
    """(forma, resposta): o nome sem a palavra do tema na frente ou no fim, quando só uma resposta dá nela."""
    tema = {_raiz(p) for p in cat["id"].split("-") if len(p) >= 3 and p not in CONECT}
    tema |= {_raiz(p) for p in cat["id"].split("-") if len(p) >= 3 and p not in CONECT for p in [p[:-2] + "l" if p.endswith("is") else p]}
    nomes = {}
    for r in cat["respostas"]:
        for n in [r["resposta"], *r["apelidos"]]:
            nomes.setdefault(fama.normalizar(n), set()).add(r["resposta"])
    candidatas: dict[str, set[str]] = {}
    for r in cat["respostas"]:
        for n in [r["resposta"], *r["apelidos"]]:
            ps = fama.normalizar(n).replace("-", " ").split()
            if len(ps) < 2:
                continue
            for corte in ("frente", "fim"):
                qs = list(ps)
                if corte == "frente" and _raiz(qs[0]) in tema:
                    qs = qs[1:]
                    while qs and qs[0] in CONECT:
                        qs = qs[1:]
                elif corte == "fim" and _raiz(qs[-1]) in tema:
                    qs = qs[:-1]
                    while qs and qs[-1] in CONECT:
                        qs = qs[:-1]
                else:
                    continue
                resto = " ".join(qs)
                if len(resto.replace(" ", "")) >= 3:
                    candidatas.setdefault(resto, set()).add(r["resposta"])
    saida = []
    for resto, rs in candidatas.items():
        if len(rs) == 1 and nomes.get(resto, rs) == rs:
            saida.append((resto, next(iter(rs))))
    return saida


def conferir(pares: list[list[str]]) -> list[list]:
    feito = subprocess.run(["node", str(RAIZ / "scripts" / "conferir_jogo.mjs")], input=json.dumps(pares),
                           capture_output=True, text=True, check=True)
    return json.loads(feito.stdout)


def buracos(ids: list[str]) -> list[tuple[str, str, str, str | None]]:
    pares, esperado = [], {}
    for cid in ids:
        arq = RAIZ / "dados" / "categorias" / f"{cid}.txt"
        if not arq.exists():
            continue
        for forma, resposta in formas(fama.ler_categoria(arq)):
            if len(forma.replace(" ", "")) < 3:
                continue
            pares.append([cid, forma])
            esperado[(cid, forma)] = resposta
    achados = []
    for cid, forma, jogo in conferir(pares):
        if jogo != esperado[(cid, forma)]:
            achados.append((cid, forma, esperado[(cid, forma)], jogo))
    return achados


def main() -> None:
    ids = sys.argv[1:] or categorias_da_ordem()
    achados = buracos(ids)
    for cid, forma, resposta, jogo in achados:
        print(f"{cid}: '{forma}' devia ser {resposta}, o jogo {'deu ' + jogo if jogo else 'recusa'}")
    print(f"\n{len(achados)} buracos em {len(ids)} categorias")
    sys.exit(1 if any(j is None for *_, j in achados) else 0)


if __name__ == "__main__":
    main()
