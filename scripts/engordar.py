#!/usr/bin/env python3
"""Engorda uma categoria: acrescenta respostas novas (com apelidos) sem tirar nenhuma.

As respostas novas vêm de arquivos em dados/fontes/engordar/<cat>*.txt, no mesmo formato da
lista ("Nome | apelido | apelido", uma por linha, "#" é comentário). Cada arquivo é uma fonte:
    <cat>.txt            escrita à mão
    <cat>.wiki.txt       gerada por scripts/coletar_wikipedia.py (categorias e redirecionamentos
                         da Wikipédia PT, a partir dos dumps públicos)
E de outras categorias do jogo, quando toda resposta delas também vale nesta
(dados/fontes/engordar/emprestimos.json: {"supermercado": ["frutas", "queijos", ...]}).

Regras (as mesmas que o fama.py --conferir cobra):
  - resposta que já está na lista (por nome ou apelido, nas formas de fama.chaves) não entra de novo;
    os apelidos novos dela vão para a linha que já existe, se não forem de outra resposta;
  - apelido que já é de outra resposta sai (não pode ligar duas respostas);
  - nada que caia em dados/bloqueadas.js entra.
As novas vão para o fim da lista, debaixo de um comentário com a fonte. Rodar de novo não repete nada.

Uso:
    python3 scripts/engordar.py flores            # uma categoria
    python3 scripts/engordar.py                   # todas que têm fonte em dados/fontes/engordar/
    python3 scripts/engordar.py flores --ver      # só conta, não grava
Depois: python3 scripts/fama.py <cat> (refaz a fama e os pontos).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fama  # noqa: E402
from plantao_automatico import bloqueada, ler_bloqueadas  # noqa: E402
from pontuar import ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = RAIZ / "dados" / "categorias"
FONTES = RAIZ / "dados" / "fontes" / "engordar"


def ler_fonte(arq: Path) -> list[list[str]]:
    saida = []
    for linha in arq.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#"):
            continue
        nomes = [n.strip() for n in linha.split("|") if n.strip()]
        if nomes:
            saida.append(nomes)
    return saida


def emprestimos() -> dict[str, list[str]]:
    arq = FONTES / "emprestimos.json"
    if not arq.exists():
        return {}
    return {k: v for k, v in json.loads(arq.read_text(encoding="utf-8")).items() if not k.startswith("_")}


def limpo(nome: str) -> bool:
    t = normalizar(nome)
    return len(t.replace(" ", "")) >= 2 and not t.isdigit()


def chaves(nome: str, cat_id: str) -> set[str]:
    # fama.chaves ignora formas com menos de 3 letras; "Og" (rei de Basã) ainda é uma resposta
    return fama.chaves(nome, cat_id) or ({normalizar(nome)} if limpo(nome) else set())


def engordar(cat_id: str, gravar: bool = True) -> tuple[int, int, int]:
    """Devolve (respostas antes, respostas novas, apelidos novos em respostas antigas)."""
    arq = CATEGORIAS / f"{cat_id}.txt"
    cat = ler_categoria(arq)
    lista_negra = ler_bloqueadas()
    dono: dict[str, str] = {}  # chave -> resposta (só as que já estão ou já entraram)
    for r in cat["respostas"]:
        for nome in [r["resposta"], *r["apelidos"]]:
            for k in chaves(nome, cat_id):
                dono.setdefault(k, r["resposta"])
    linhas = arq.read_text(encoding="utf-8").rstrip("\n").split("\n")
    pos = {l.split("|")[0].strip(): i for i, l in enumerate(linhas) if l.strip() and not l.startswith("#")}
    novas_total, apelidos_velhos = 0, 0
    fontes = sorted(FONTES.glob(f"{cat_id}.txt")) + sorted(FONTES.glob(f"{cat_id}.*.txt"))
    fontes += [CATEGORIAS / f"{c}.txt" for c in emprestimos().get(cat_id, [])]
    for fonte in fontes:
        novas: list[str] = []
        for nomes in ler_fonte(fonte):
            nomes = [n for n in dict.fromkeys(nomes) if limpo(n) and not bloqueada(n, lista_negra)]
            if not nomes:
                continue
            chaves_nome = chaves(nomes[0], cat_id)
            ja = {dono[k] for k in chaves_nome if k in dono}
            if ja:
                # já existe: só os apelidos que ninguém tem vão para a linha dela
                alvo = sorted(ja)[0]
                if len(ja) > 1 or alvo not in pos:
                    continue
                extras = []
                for ap in nomes[1:]:
                    ks = chaves(ap, cat_id)
                    if ks and not any(k in dono for k in ks):
                        extras.append(ap)
                        for k in ks:
                            dono[k] = alvo
                if extras:
                    linhas[pos[alvo]] = " | ".join([linhas[pos[alvo]].rstrip(), *extras])
                    apelidos_velhos += len(extras)
                continue
            if not chaves_nome:
                continue
            principal = nomes[0]
            aceitos = [principal]
            for k in chaves_nome:
                dono[k] = principal
            for ap in nomes[1:]:
                ks = chaves(ap, cat_id)
                if not ks or any(k in dono and dono[k] != principal for k in ks):
                    continue
                aceitos.append(ap)
                for k in ks:
                    dono[k] = principal
            novas.append(" | ".join(aceitos))
        if novas:
            linhas += [f"# entraram por scripts/engordar.py ({fonte.relative_to(RAIZ)})", *novas]
            for i in range(len(linhas) - len(novas), len(linhas)):
                pos[linhas[i].split("|")[0].strip()] = i
            novas_total += len(novas)
    if gravar and (novas_total or apelidos_velhos):
        arq.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return len(cat["respostas"]), novas_total, apelidos_velhos


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("categorias", nargs="*")
    ap.add_argument("--ver", action="store_true", help="só conta, não grava")
    args = ap.parse_args()
    todas = {re.sub(r"\..*$", "", p.stem) for p in FONTES.glob("*.txt")} | set(emprestimos())
    # quem empresta de outras vai depois, para levar também o que as outras acabaram de ganhar
    cats = args.categorias or sorted(todas, key=lambda c: (c in emprestimos(), c))
    for cat_id in cats:
        if not (CATEGORIAS / f"{cat_id}.txt").exists():
            print(f"{cat_id}: categoria não existe", file=sys.stderr)
            continue
        antes, novas, apelidos = engordar(cat_id, gravar=not args.ver)
        print(f"{cat_id}: {antes} -> {antes + novas} respostas (+{novas}; +{apelidos} apelidos nas antigas)")


if __name__ == "__main__":
    main()
