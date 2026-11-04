"""Descrição da singularidade (a resposta escondida) de cada pergunta: dados/singularidades.txt.

O jogo mostra a descrição no cartão do resultado, quando o jogador acha a singularidade,
e na lista de respostas do fim. Toda categoria do jogo precisa ter a sua, e ela tem que
ser da singularidade de agora: se o pontuar.py escolher outra resposta, a descrição antiga
deixa de valer. montar_jogo.py e sincronizar_d1.py chamam conferir() e param se faltar alguma.

Conferir sem montar nada: python3 scripts/singularidades.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQUIVO = RAIZ / "dados" / "singularidades.txt"
PESOS = RAIZ / "dados" / "pesos"


def ler() -> dict[str, tuple[str, str]]:
    """{categoria: (resposta, descrição)} das linhas "categoria | resposta | descrição"."""
    saida = {}
    if not ARQUIVO.exists():
        return saida
    for linha in ARQUIVO.read_text(encoding="utf-8").splitlines():
        if not linha.strip() or linha.startswith("#"):
            continue
        partes = [p.strip() for p in linha.split("|", 2)]
        if len(partes) == 3:
            saida[partes[0]] = (partes[1], partes[2])
    return saida


def comeca_com_maiuscula(texto: str) -> bool:
    """A primeira letra (ou número) é maiúscula; aspas e sinais no começo não contam."""
    for c in texto:
        if c.isalnum():
            return c.isupper() or c.isdigit()
    return False


def problemas(categorias: dict[str, dict]) -> list[str]:
    """O que está errado nas descrições das categorias dadas ({id: categoria de dados/pesos})."""
    descricoes = ler()
    erros = []
    for cid, cat in categorias.items():
        sn = cat.get("supernova")
        if cid not in descricoes:
            erros.append(f"{cid}: falta a descrição da singularidade ({sn!r})")
            continue
        resposta, texto = descricoes[cid]
        if resposta != sn:
            erros.append(f"{cid}: a descrição é de {resposta!r}, mas a singularidade agora é {sn!r}")
        if not texto:
            erros.append(f"{cid}: descrição vazia")
        elif not comeca_com_maiuscula(texto):
            erros.append(f"{cid}: a descrição tem que começar com letra maiúscula")
    return erros


def conferir(categorias: dict[str, dict]) -> None:
    """Para o script (SystemExit) se alguma categoria estiver sem descrição válida."""
    erros = problemas(categorias)
    if erros:
        raise SystemExit(f"ERRO em {ARQUIVO.relative_to(RAIZ)} (toda singularidade precisa de descrição):\n  "
                         + "\n  ".join(erros))


def descricao(cid: str) -> str | None:
    return ler().get(cid, (None, None))[1]


def main() -> None:
    indice = json.loads((PESOS / "indice.json").read_text(encoding="utf-8"))
    cats = {c["id"]: json.loads((PESOS / f"{c['id']}.json").read_text(encoding="utf-8")) for c in indice}
    conferir(cats)
    sobra = sorted(set(ler()) - set(cats))
    if sobra:
        print("AVISO: descrição de categoria que não está no jogo: " + ", ".join(sobra))
    print(f"{len(cats)} singularidades com descrição")


if __name__ == "__main__":
    sys.exit(main())
