#!/usr/bin/env python3
"""Guarda o que os jogadores responderam de verdade, dia a dia, para a raridade sair das partidas.

O /api/respostas (functions/api/respostas.js) só devolve o dia de hoje e o de ontem. Este script
baixa os dois e grava em dados/sinais/partidas/<dia>.json, para a contagem não se perder. O de
ontem é regravado com a contagem final (o de hoje ainda está crescendo). O plantão diário roda
este script; para rodar à mão:

    python3 scripts/partidas.py                 # ontem e hoje
    python3 scripts/partidas.py 2026-11-21      # um dia (só hoje ou ontem: a API não guarda mais)
    python3 scripts/partidas.py --resumo        # quantos jogadores por categoria, somando os dias

Formato: {"dia", "baixado_em", "final", "categorias": {cat: {"total": N, "contagem": {resposta: n}}}}
"final" é false para o dia de hoje (contagem parcial). O pontuar.py só usa dias com final = true.
Categorias com menos de MIN_DO_DIA respostas no dia são descartadas: são partidas do modo teste
ou do arquivo, não a categoria que estava no ar.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PARTIDAS = RAIZ / "dados" / "sinais" / "partidas"
API = "https://nichoojogo.com/api/respostas"
MIN_DO_DIA = 50
BRASIL = dt.timezone(dt.timedelta(hours=-3))


def hoje() -> str:
    return dt.datetime.now(BRASIL).date().isoformat()


def baixar(dia: str) -> dict:
    pedido = urllib.request.Request(f"{API}?dia={dia}", headers={"User-Agent": "nicho-partidas/1"})
    with urllib.request.urlopen(pedido, timeout=60) as r:
        return json.load(r)


def gravar(dia: str) -> None:
    dados = baixar(dia)
    if "categorias" not in dados:
        print(f"{dia}: a API não devolveu o dia ({dados.get('erro', '?')})")
        return
    cats = {c: v for c, v in dados["categorias"].items() if v.get("total", 0) >= MIN_DO_DIA}
    final = dia < hoje()
    caminho = PARTIDAS / f"{dia}.json"
    if caminho.exists() and not final:
        velho = json.loads(caminho.read_text(encoding="utf-8"))
        if velho.get("final"):
            print(f"{dia}: já gravado como final, não troco por uma contagem parcial")
            return
    PARTIDAS.mkdir(parents=True, exist_ok=True)
    corpo = {"dia": dia, "baixado_em": dt.datetime.now(BRASIL).isoformat(timespec="minutes"),
             "final": final, "categorias": dict(sorted(cats.items()))}
    caminho.write_text(json.dumps(corpo, ensure_ascii=False, indent=1, sort_keys=False) + "\n", encoding="utf-8")
    resumo = ", ".join(f"{c} {v['total']}" for c, v in sorted(cats.items()))
    print(f"{dia}{'' if final else ' (parcial)'}: {resumo or 'nenhuma categoria'}")


def ler(so_finais: bool = True) -> dict[str, dict]:
    """Soma todos os dias gravados: {cat: {"total": N, "contagem": {resposta: n}, "dias": [...]}}."""
    soma: dict[str, dict] = {}
    for arq in sorted(PARTIDAS.glob("*.json")):
        dados = json.loads(arq.read_text(encoding="utf-8"))
        if so_finais and not dados.get("final"):
            continue
        for cat, v in dados["categorias"].items():
            s = soma.setdefault(cat, {"total": 0, "contagem": {}, "dias": []})
            s["total"] += v["total"]
            s["dias"].append(dados["dia"])
            for resposta, n in v["contagem"].items():
                s["contagem"][resposta] = s["contagem"].get(resposta, 0) + n
    return soma


def main() -> None:
    args = sys.argv[1:]
    if "--resumo" in args:
        for cat, v in sorted(ler().items()):
            print(f"{cat}: {v['total']} jogadores em {len(v['dias'])} dia(s), {len(v['contagem'])} respostas diferentes")
        return
    dias = args or [(dt.date.fromisoformat(hoje()) - dt.timedelta(days=1)).isoformat(), hoje()]
    for dia in dias:
        gravar(dia)


if __name__ == "__main__":
    main()
