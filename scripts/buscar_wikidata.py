#!/usr/bin/env python3
"""Busca no Wikidata e na Wikipédia sinais de fama e apelidos de cada resposta.

Uso (precisa de internet, sem dependências):
    python3 scripts/buscar_wikidata.py luas-do-sistema-solar
    python3 scripts/buscar_wikidata.py                 # todas

Para cada resposta da categoria:
    1. acha o item do Wikidata (Q...), procurando pelo nome e pelos apelidos e
       ficando com o primeiro resultado cuja descrição tem uma das palavras da
       categoria (ex.: "lua", "satélite", "moon"). Isso separa "Europa" a lua
       de "Europa" o continente.
    2. lê do item: número de sitelinks (em quantas Wikipédias ele existe),
       título na Wikipédia em português, rótulos e apelidos em pt, pt-br e en.
    3. soma as visitas de pessoas (não robôs) na pt.wikipedia nos últimos 12 meses.

Saída: dados/sinais/wikidata/<cat>.json, lido pelo scripts/sinais.py.
O arquivo pode ser corrigido à mão: se o "qid" de uma resposta estiver errado,
troque e rode de novo; um qid já gravado com "conferido": true não é buscado de novo.
No fim, o script lista apelidos do Wikidata que ainda não estão na categoria.

APIs usadas (públicas, sem chave; mande um User-Agent com contato, regra da Wikimedia):
    https://www.wikidata.org/w/api.php          wbsearchentities, wbgetentities
    https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/...
Para milhares de itens, troque as chamadas pelos dumps (ver docs/BANCO-DE-PALAVRAS.md).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import CATEGORIAS, ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "dados" / "sinais" / "wikidata"
AGENTE = "NichoJogo/0.1 (https://github.com/pedro1ace/nichoojogo)"
PAUSA = 0.2  # segundos entre chamadas, para não abusar da API

# Palavras que a descrição do item precisa ter (pt ou en) para valer.
# Categoria nova sem entrada aqui: aceita o primeiro resultado e marca "incerto".
PALAVRAS_DA_CATEGORIA = {
    "luas-do-sistema-solar": ["lua", "satélite", "satelite", "moon", "satellite"],
    "planetas-e-planetas-anoes": ["planeta", "planet"],
    "constelacoes": ["constelação", "constelacao", "constellation"],
    "estrelas": ["estrela", "star", "binária", "binary", "supergigante", "supergiant", "anã", "dwarf"],
    "paises": ["país", "pais", "country", "estado", "state", "república", "republic", "reino", "kingdom"],
    "estados-do-brasil": ["estado", "unidade federativa", "federative unit", "state of brazil"],
    "capitais-do-brasil": ["capital", "município", "municipio", "municipality", "cidade", "city"],
}


def pegar_json(url: str, tentativas: int = 4) -> dict:
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(pedido, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as erro:
            if erro.code == 404:
                return {}
            if i == tentativas - 1:
                raise
        except urllib.error.URLError:
            if i == tentativas - 1:
                raise
        time.sleep(2 ** (i + 1))
    return {}


def api_wikidata(**params) -> dict:
    params = {"format": "json", **params}
    time.sleep(PAUSA)
    return pegar_json("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params))


def descricao_combina(desc: str, palavras: list[str]) -> bool:
    d = normalizar(desc)
    return any(normalizar(p) in d for p in palavras)


def achar_qid(nomes: list[str], palavras: list[str] | None) -> tuple[str | None, str]:
    """Devolve (qid, método). Método: 'descricao', 'incerto' ou 'nao_achado'."""
    primeiro = None
    for nome in nomes:
        for idioma in ("pt", "en"):
            busca = api_wikidata(
                action="wbsearchentities", search=nome, language=idioma, uselang=idioma, type="item", limit=10
            )
            for item in busca.get("search", []):
                primeiro = primeiro or item["id"]
                if palavras and descricao_combina(item.get("description", ""), palavras):
                    return item["id"], "descricao"
    return (primeiro, "incerto") if primeiro else (None, "nao_achado")


def detalhes(qid: str) -> dict:
    dados = api_wikidata(
        action="wbgetentities", ids=qid, props="sitelinks|labels|aliases|descriptions", languages="pt|pt-br|en"
    )
    ent = dados.get("entities", {}).get(qid, {})
    apelidos = set()
    for idioma in ("pt", "pt-br", "en"):
        if idioma in ent.get("labels", {}):
            apelidos.add(ent["labels"][idioma]["value"])
        for a in ent.get("aliases", {}).get(idioma, []):
            apelidos.add(a["value"])
    desc = ent.get("descriptions", {})
    return {
        "rotulo": ent.get("labels", {}).get("pt", {}).get("value"),
        "descricao": (desc.get("pt") or desc.get("en") or {}).get("value"),
        "sitelinks": len(ent.get("sitelinks", {})),
        "ptwiki": ent.get("sitelinks", {}).get("ptwiki", {}).get("title"),
        "apelidos_wikidata": sorted(apelidos),
    }


def visitas_12_meses(titulo: str) -> int | None:
    fim = dt.date.today().replace(day=1) - dt.timedelta(days=1)  # fim do mês passado
    inicio = (fim.replace(day=1) - dt.timedelta(days=330)).replace(day=1)
    artigo = urllib.parse.quote(titulo.replace(" ", "_"), safe="")
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/pt.wikipedia/all-access/user/"
        f"{artigo}/monthly/{inicio:%Y%m%d}00/{fim:%Y%m%d}00"
    )
    time.sleep(PAUSA)
    itens = pegar_json(url).get("items")
    return sum(i["views"] for i in itens) if itens else None


def buscar_categoria(cat_id: str) -> None:
    cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
    destino = DESTINO / f"{cat_id}.json"
    antigo = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else {}
    palavras = PALAVRAS_DA_CATEGORIA.get(cat_id)
    saida = {}
    for r in cat["respostas"]:
        nome = r["resposta"]
        anterior = antigo.get(nome, {})
        if anterior.get("conferido") and anterior.get("qid"):
            qid, metodo = anterior["qid"], "conferido"
        else:
            qid, metodo = achar_qid([nome, *r["apelidos"]], palavras)
        linha = {"qid": qid, "metodo": metodo, "conferido": bool(anterior.get("conferido"))}
        if qid:
            linha.update(detalhes(qid))
            linha["visitas_pt_12m"] = visitas_12_meses(linha["ptwiki"]) if linha["ptwiki"] else 0
        saida[nome] = linha
        print(f"  {nome:28} {qid or '-':12} {metodo:10} sitelinks={linha.get('sitelinks', '-')}"
              f" visitas={linha.get('visitas_pt_12m', '-')}")
    DESTINO.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    conhecidos = {normalizar(n) for r in cat["respostas"] for n in [r["resposta"], *r["apelidos"]]}
    print(f"\n{cat_id}: gravado em {destino}")
    print("Apelidos do Wikidata que ainda não estão na categoria (revise antes de adicionar):")
    for nome, linha in saida.items():
        novos = [a for a in linha.get("apelidos_wikidata", []) if normalizar(a) not in conhecidos]
        if novos:
            print(f"  {nome} | " + " | ".join(novos))
    duvidas = [n for n, l in saida.items() if l["metodo"] in ("incerto", "nao_achado")]
    if duvidas:
        print("Confira à mão (item incerto ou não achado): " + ", ".join(duvidas))


def main() -> None:
    escolhidas = sys.argv[1:] or [a.stem for a in sorted(CATEGORIAS.glob("*.txt"))]
    for cat_id in escolhidas:
        print(f"\n== {cat_id}")
        buscar_categoria(cat_id)


if __name__ == "__main__":
    main()
