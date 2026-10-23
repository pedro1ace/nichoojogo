#!/usr/bin/env python3
"""Protótipo: junta vários sinais de "fama" por resposta e propõe um peso novo.

Não mexe no jogo. Só lê as categorias e grava uma tabela para comparar com o
peso atual do pontuar.py. Detalhes e motivação em docs/BANCO-DE-PALAVRAS.md.

Uso:
    pip install wordfreq                    # opcional, mas recomendado
    python3 scripts/sinais.py               # todas as categorias
    python3 scripts/sinais.py constelacoes  # só uma

Sinais (cada um vira um percentil dentro da categoria, 1 = a mais famosa):
    icf         frequência no corpus da base fserb/pt-br (já usada hoje)
    zipf        frequência do wordfreq (Wikipédia, legendas, notícias, web, Twitter)
    sitelinks   em quantas Wikipédias o item existe   (scripts/buscar_wikidata.py)
    visitas     visitas na Wikipédia em português       (scripts/buscar_wikidata.py)
    llm         "de 1000 brasileiros, quantos dariam essa resposta" (scripts/llm_nicho.py)
    jogadores   quantas vezes a resposta foi dada de verdade (dados/sinais/jogadores/<cat>.csv)
Sinais que faltam para uma categoria são ignorados e os pesos se redistribuem.

Saída:
    dados/sinais/revisao/<cat>.csv   um sinal por coluna, o peso novo e o atual
    resumo no terminal: concordância entre os sinais (Spearman) e com o peso atual,
    e o "número efetivo de respostas" (2^entropia) quando houver LLM ou jogadores
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import CATEGORIAS, CURVA, SAIDA, BaseICF, icf_de, ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
SINAIS = RAIZ / "dados" / "sinais"

# Quanto cada sinal pesa quando existe. Os de jogadores e LLM medem direto o que
# importa (quem pensaria nessa resposta), então pesam mais que os de corpus.
PESOS_SINAIS = {
    "icf": 1.0,
    "zipf": 1.0,
    "sitelinks": 1.0,
    "visitas": 1.5,
    "llm": 2.0,
    "jogadores": 4.0,
}
# Com poucos jogadores, a contagem é ruído. Abaixo disto o sinal de jogadores é
# misturado com a média dos outros (suavização bayesiana, ver o relatório).
JOGADORES_PRIOR = 200


def percentil_fama(valores: dict[str, float | None]) -> dict[str, float]:
    """Percentil dentro da categoria. 1 = maior valor (mais famosa). Empates na média."""
    itens = [(k, v) for k, v in valores.items() if v is not None]
    n = len(itens)
    if n == 0:
        return {}
    if n == 1:
        return {itens[0][0]: 0.5}
    itens.sort(key=lambda kv: kv[1])
    saida: dict[str, float] = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and itens[j + 1][1] == itens[i][1]:
            j += 1
        p = ((i + j) / 2) / (n - 1)
        for k in range(i, j + 1):
            saida[itens[k][0]] = p
        i = j + 1
    return saida


def spearman(a: dict[str, float], b: dict[str, float]) -> float | None:
    chaves = [k for k in a if k in b]
    if len(chaves) < 4:
        return None
    ra = percentil_fama({k: a[k] for k in chaves})
    rb = percentil_fama({k: b[k] for k in chaves})
    ma = sum(ra.values()) / len(chaves)
    mb = sum(rb.values()) / len(chaves)
    cov = sum((ra[k] - ma) * (rb[k] - mb) for k in chaves)
    va = math.sqrt(sum((ra[k] - ma) ** 2 for k in chaves))
    vb = math.sqrt(sum((rb[k] - mb) ** 2 for k in chaves))
    return cov / (va * vb) if va and vb else None


# ---------- leitura de cada sinal (valor bruto: maior = mais famosa) ----------


def sinal_icf(respostas: list[dict], base: BaseICF) -> dict[str, float | None]:
    saida = {}
    for r in respostas:
        valores = [icf_de(n, base) for n in [r["resposta"], *r["apelidos"]]]
        valores = [v for v in valores if v is not None]
        # ICF alto = raro, então a fama é o negativo do menor ICF entre as grafias
        saida[r["resposta"]] = -min(valores) if valores else None
    return saida


def sinal_zipf(respostas: list[dict]) -> dict[str, float | None]:
    try:
        from wordfreq import zipf_frequency
    except ImportError:
        return {}
    saida = {}
    for r in respostas:
        melhor = 0.0
        for nome in [r["resposta"], *r["apelidos"]]:
            melhor = max(melhor, zipf_frequency(nome.lower(), "pt"))
        # 0 no wordfreq quer dizer "não visto": raro, mas é um dado, não ausência
        saida[r["resposta"]] = melhor
    return saida


def ler_json(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else {}


def sinal_wikidata(respostas: list[dict], cat_id: str, campo: str) -> dict[str, float | None]:
    dados = ler_json(SINAIS / "wikidata" / f"{cat_id}.json")
    if not dados:
        return {}
    saida = {}
    for r in respostas:
        v = (dados.get(r["resposta"]) or {}).get(campo)
        # log porque visitas e sitelinks têm cauda longa; o percentil não liga,
        # mas facilita ler a tabela
        saida[r["resposta"]] = math.log10(1 + v) if isinstance(v, (int, float)) else None
    return saida


def sinal_llm(respostas: list[dict], cat_id: str) -> dict[str, float | None]:
    dados = ler_json(SINAIS / "llm" / f"{cat_id}.json")
    itens = {normalizar(i["resposta"]): i for i in dados.get("itens", [])}
    if not itens:
        return {}
    saida = {}
    for r in respostas:
        item = itens.get(normalizar(r["resposta"]))
        saida[r["resposta"]] = float(item["respostas_em_1000"]) if item else None
    return saida


def sinal_jogadores(respostas: list[dict], cat_id: str) -> tuple[dict[str, float | None], int]:
    caminho = SINAIS / "jogadores" / f"{cat_id}.csv"
    if not caminho.exists():
        return {}, 0
    contagem: dict[str, int] = {}
    with caminho.open(encoding="utf-8") as f:
        for linha in csv.DictReader(f):
            contagem[normalizar(linha["resposta"])] = int(linha["contagem"])
    total = sum(contagem.values())
    return {r["resposta"]: float(contagem.get(normalizar(r["resposta"]), 0)) for r in respostas}, total


def respostas_efetivas(contagens: dict[str, float | None]) -> float | None:
    """2^H, a entropia da categoria em "número efetivo de respostas".
    Perto de 1: quase todo mundo dá a mesma resposta (categoria fechada)."""
    valores = [v for v in contagens.values() if v]
    total = sum(valores)
    if not total:
        return None
    h = -sum(v / total * math.log2(v / total) for v in valores)
    return 2**h


# ---------- combinação ----------


def combinar(cat_id: str, base: BaseICF) -> tuple[list[dict], dict]:
    cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
    respostas = cat["respostas"]
    brutos = {
        "icf": sinal_icf(respostas, base),
        "zipf": sinal_zipf(respostas),
        "sitelinks": sinal_wikidata(respostas, cat_id, "sitelinks"),
        "visitas": sinal_wikidata(respostas, cat_id, "visitas_pt_12m"),
        "llm": sinal_llm(respostas, cat_id),
    }
    jogadores, total_jogadores = sinal_jogadores(respostas, cat_id)
    if jogadores:
        brutos["jogadores"] = jogadores
    brutos = {k: v for k, v in brutos.items() if v}
    pcts = {k: percentil_fama(v) for k, v in brutos.items()}

    atual = ler_json(SAIDA / f"{cat_id}.json")
    peso_atual = {r["resposta"]: r["peso"] for r in atual.get("respostas", [])}

    linhas = []
    for r in respostas:
        nome = r["resposta"]
        soma = peso_total = 0.0
        for sinal, p in pcts.items():
            if nome not in p or sinal == "jogadores":
                continue
            soma += PESOS_SINAIS[sinal] * p[nome]
            peso_total += PESOS_SINAIS[sinal]
        fama_sem_jogadores = soma / peso_total if peso_total else 0.5
        fama = fama_sem_jogadores
        if "jogadores" in pcts:
            # quanto mais jogadores, mais a contagem real manda
            confianca = total_jogadores / (total_jogadores + JOGADORES_PRIOR)
            fama = (1 - confianca) * fama_sem_jogadores + confianca * pcts["jogadores"][nome]
        peso = 1 - fama
        linha = {"resposta": nome}
        for sinal in PESOS_SINAIS:
            linha[sinal] = round(pcts[sinal][nome], 3) if sinal in pcts and nome in pcts[sinal] else ""
        linha["peso_novo"] = round(peso, 3)
        linha["pontos_novo"] = max(1, round(100 * peso**CURVA))
        linha["peso_atual"] = peso_atual.get(nome, "")
        linhas.append(linha)
    linhas.sort(key=lambda l: l["peso_novo"])

    # concordância: cada sinal contra os outros e contra o peso atual (invertido em fama)
    concordancia = {}
    nomes = list(pcts)
    if peso_atual:
        pcts_atual = {k: 1 - v for k, v in peso_atual.items()}
        nomes_ref = [*nomes, "atual"]
        pcts = {**pcts, "atual": pcts_atual}
    else:
        nomes_ref = nomes
    for fonte in ("llm", "jogadores"):
        if fonte in brutos:
            efetivas = respostas_efetivas(brutos[fonte])
            if efetivas:
                concordancia[f"respostas efetivas ({fonte})"] = round(efetivas, 1)
    for i, a in enumerate(nomes_ref):
        for b in nomes_ref[i + 1 :]:
            rho = spearman(pcts[a], pcts[b])
            if rho is not None:
                concordancia[f"{a}~{b}"] = round(rho, 2)
    return linhas, concordancia


def salvar(cat_id: str, linhas: list[dict]) -> Path:
    destino = SINAIS / "revisao" / f"{cat_id}.csv"
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0]))
        w.writeheader()
        w.writerows(linhas)
    return destino


def main() -> None:
    base = BaseICF()
    escolhidas = sys.argv[1:] or [a.stem for a in sorted(CATEGORIAS.glob("*.txt"))]
    for cat_id in escolhidas:
        linhas, concordancia = combinar(cat_id, base)
        destino = salvar(cat_id, linhas)
        print(f"\n{cat_id}: {len(linhas)} respostas -> {destino.relative_to(RAIZ)}")
        print("  concordância (Spearman, 1 = mesma ordem):")
        for par, rho in concordancia.items():
            if par.startswith("respostas efetivas"):
                print(f"  {par}: {rho}  (2^entropia; perto de 1 = categoria fechada)")
            else:
                print(f"    {par:24} {rho:+.2f}")


if __name__ == "__main__":
    main()
