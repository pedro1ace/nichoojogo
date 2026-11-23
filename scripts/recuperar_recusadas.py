#!/usr/bin/env python3
"""Põe na lista as respostas que a IA aprovou em QUALQUER dia e que ainda estão fora.

O plantão diário só olha o dia que está no ar. O que escapou (Friends em Séries, Calcinha Preta em
Bandas, Harry Potter em Livros) fica recusado para sempre, inclusive para quem joga pelo arquivo.
Este script passa por todos os dados/sinais/revisao/recusadas-<dia>.csv, fica com o que a IA aceitou
e a busca de hoje ainda não acha (node scripts/avaliar_busca.mjs --faltando), e usa a mesma regra do
plantão (plantao_automatico.adicionar_aprovadas): bloqueadas não entram, pedaço ou sinônimo de outra
resposta não vira apelido, e o que parece mais de uma resposta fica só como sugestão.

As respostas que entram são só as aprovadas na revisão (dados/sinais/revisao/curadoria-recuperadas.csv):
a IA às vezes aceita o que não vale (Sydney como capital, Romã como grão, Elon Musk como astronauta).

Os pontos da resposta nova saem de quantos jogadores a digitaram num dia (dados/sinais/recusadas/<cat>.json,
lido pelo pontuar.py): Friends, que mais de 100 pessoas deram num dia, não pode cair no Espaço Profundo.

Uso: python3 scripts/recuperar_recusadas.py [--so-mostrar]
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import plantao_automatico as plantao  # noqa: E402
from pontuar import ler_categoria  # noqa: E402


RAIZ = Path(__file__).resolve().parent.parent
CATEGORIAS = RAIZ / "dados" / "categorias"
SINAIS = RAIZ / "dados" / "sinais" / "recusadas"


def faltando() -> list[dict]:
    saida = subprocess.run(["node", str(RAIZ / "scripts" / "avaliar_busca.mjs"), "--faltando"],
                           capture_output=True, text=True, check=True).stdout
    return json.loads(saida)


CURADORIA = RAIZ / "dados" / "sinais" / "revisao" / "curadoria-recuperadas.csv"


def ler_curadoria() -> dict[tuple[str, str], dict]:
    """(categoria, nome que a IA deu) -> {"nome": nome final, "apelidos": [...]}, só as aprovadas.
    O que não está ali com "sim" fica de fora: a IA aceitou, mas a revisão não (Sydney não é
    capital, Elon Musk não é astronauta, Romã não é grão, Xexenia não existe)."""
    import csv  # noqa: PLC0415

    aprovadas = {}
    with CURADORIA.open(encoding="utf-8") as f:
        for l in csv.DictReader(f):
            if l["decisao"].strip() != "sim":
                continue
            apelidos = [a.strip() for a in (l["apelidos"] or "").split("|") if a.strip()]
            aprovadas[(l["categoria"], l["nome_da_ia"])] = {"nome": (l["nome_final"] or l["nome_da_ia"]).strip(),
                                                          "apelidos": apelidos}
    return aprovadas


def main() -> None:
    so_mostrar = "--so-mostrar" in sys.argv
    linhas = faltando()
    if so_mostrar:
        for l in sorted(linhas, key=lambda x: -x["n"])[:60]:
            print(f"{l['n']:>4}  {l['categoria']}: {l['texto']} -> {l['ia_nome']}")
        print(f"{len(linhas)} grafias")
        return
    curadoria = ler_curadoria()
    grupos: dict[tuple[str, str], dict] = {}
    for l in linhas:
        dec = curadoria.get((l["categoria"], l["ia_nome"] or l["texto"]))
        if not dec:
            continue
        g = grupos.setdefault((l["categoria"], dec["nome"]), {"formas": list(dec["apelidos"]), "vezes": 0, "dias": set()})
        g["vezes"] += l["n"]
        if l["texto"] not in g["formas"]:
            g["formas"].append(l["texto"])
    recusadas = contagem_por_dia()
    novas, apelidos, fora = 0, 0, 0
    sinais: dict[str, dict] = {}
    for (cid, nome), g in sorted(grupos.items()):
        arq = CATEGORIAS / f"{cid}.txt"
        cat = ler_categoria(arq)
        dono: dict[str, str] = {}
        for r in cat["respostas"]:
            for n in [r["resposta"], *r["apelidos"]]:
                for k in plantao.fama.chaves(n, cid):
                    dono.setdefault(k, r["resposta"])
        ja = {dono[k] for k in plantao.fama.chaves(nome, cid) if k in dono}
        if len(ja) > 1:
            print(f"  fica de fora (parece mais de uma resposta: {sorted(ja)}): {cid}: {nome}")
            fora += 1
            continue
        alvo = next(iter(ja)) if ja else None
        formas = []
        for f in g["formas"]:
            if plantao.normalizar(f) == plantao.normalizar(alvo or nome):
                continue
            if all(dono.get(k, alvo) == alvo for k in plantao.fama.chaves(f, cid)) and f not in formas:
                formas.append(f)
        texto = arq.read_text(encoding="utf-8").splitlines()
        if alvo:
            if not formas:
                continue
            for i, linha in enumerate(texto):
                if not linha.startswith("#") and linha.split("|")[0].strip() == alvo:
                    texto[i] = " | ".join([linha.rstrip(), *formas])
                    break
            apelidos += 1
        else:
            texto.append(" | ".join([nome, *formas]))
            novas += 1
            sinais.setdefault(cid, {})[nome] = recusadas.get((cid, nome), 1)
        arq.write_text("\n".join(texto) + "\n", encoding="utf-8")
    # quantos jogadores digitaram cada resposta nova, para o pontuar.py não jogar ela no Espaço Profundo
    SINAIS.mkdir(parents=True, exist_ok=True)
    for cid, novos in sinais.items():
        caminho = SINAIS / f"{cid}.json"
        atual = json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else {}
        atual.update(novos)
        caminho.write_text(json.dumps(dict(sorted(atual.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{novas} respostas novas, {apelidos} com apelidos novos, {fora} de fora")
    for cid in sorted({c for c, _ in grupos}):
        subprocess.run([sys.executable, "-X", "utf8", str(RAIZ / "scripts" / "fama.py"), cid], check=True,
                       stdout=subprocess.DEVNULL)


def contagem_por_dia() -> dict[tuple[str, str], int]:
    """(categoria, nome final) -> jogadores que digitaram a resposta no dia em que mais digitaram.
    O CSV de um dia às vezes repete o anterior (o plantão lê hoje e ontem), então soma não serve."""
    import csv  # noqa: PLC0415

    curadoria = ler_curadoria()
    maior: dict[tuple[str, str], int] = {}
    for arq in sorted((RAIZ / "dados" / "sinais" / "revisao").glob("recusadas-*.csv")):
        do_dia: dict[tuple[str, str], int] = {}
        with arq.open(encoding="utf-8") as f:
            for l in csv.DictReader(f):
                dec = curadoria.get((l["categoria"], l.get("ia_nome") or l["texto"]))
                if dec and l.get("ia") == "aceita":
                    k = (l["categoria"], dec["nome"])
                    do_dia[k] = do_dia.get(k, 0) + int(l["n"] or 1)
        for k, n in do_dia.items():
            maior[k] = max(maior.get(k, 0), n)
    return maior


if __name__ == "__main__":
    main()
