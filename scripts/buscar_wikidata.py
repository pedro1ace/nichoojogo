#!/usr/bin/env python3
"""Busca no Wikidata e na Wikipédia sinais de fama e apelidos de cada resposta.

Uso (precisa de internet, sem dependências):
    python3 scripts/buscar_wikidata.py luas-do-sistema-solar
    python3 scripts/buscar_wikidata.py                 # todas
    python3 scripts/buscar_wikidata.py --sem-visitas frutas   # só acha os itens (rápido, sem visitas)
    python3 scripts/buscar_wikidata.py --so-visitas frutas    # reaproveita os itens já achados

Para cada resposta da categoria:
    1. acha o item do Wikidata (Q...), procurando pelo nome e pelos apelidos e
       ficando com o primeiro resultado cuja descrição tem uma das palavras da
       categoria (ex.: "lua", "satélite", "moon"). Isso separa "Europa" a lua
       de "Europa" o continente. Categoria gerada pelo importar.py pula essa
       busca: o Q... vem da consulta guardada em dados/brutos/fontes/<cat>.json.
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
        (só se não houver os dumps: rode antes scripts/baixar_visitas.sh, bem mais rápido)
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
BRUTOS_FONTES = RAIZ / "dados" / "brutos" / "fontes"  # consultas guardadas pelo importar.py
AGENTE = "NichoJogo/0.1 (https://github.com/pedro1ace/nichoojogo)"
PAUSA = 0.5  # segundos entre chamadas, para não abusar da API

# Palavras que a descrição do item precisa ter (pt ou en) para valer.
# Categoria nova sem entrada aqui: aceita o primeiro resultado e marca "incerto".
PALAVRAS_DA_CATEGORIA = {
    "luas-do-sistema-solar": ["lua", "satélite", "satelite", "moon", "satellite"],
    "planetas-e-planetas-anoes": ["planeta", "planet"],
    "constelacoes": ["constelação", "constelacao", "constellation"],
    "estrelas": ["estrela", "star", "binária", "binary", "supergigante", "supergiant", "anã", "dwarf"],
    "paises": ["país", "pais", "country", "estado", "state", "república", "republic", "reino", "kingdom"],
    "estados-do-brasil": ["estado", "unidade federativa", "federative unit", "state of brazil"],
    "agencias-espaciais": ["agência", "agencia", "agency", "espacial", "space", "aeroespacial", "aerospace"],
    "capitais-do-brasil": ["capital", "município", "municipio", "municipality", "cidade", "city"],
    "cidades-do-brasil": ["município", "municipio", "municipality", "cidade", "city", "distrito", "vila", "village"],
    "paises-acima-do-equador": ["país", "pais", "country", "estado", "state", "república", "republic", "reino",
                                "kingdom", "território", "territory", "ilha", "island"],
    "corpos-do-sistema-solar": ["planeta", "planet", "lua", "satélite", "moon", "satellite", "asteroide",
                                "asteroid", "cometa", "comet", "anão", "dwarf", "transnetuniano", "trans-Neptunian"],
    "dinossauros": ["dinossauro", "dinosaur", "gênero", "genus", "réptil", "reptile", "pterossauro", "pterosaur"],
    "poetas-brasileiros": ["poeta", "poet", "escritor", "writer", "escritora", "cantor", "singer", "compositor"],
    "filmes-tom-hanks": ["filme", "film", "movie"],
    "marcas-de-carro": ["automóve", "automobile", "car ", "carro", "fabricante", "manufacturer", "marca", "brand"],
    "times-de-futebol": ["clube", "club", "futebol", "football", "soccer"],
    "racas-de-cachorro": ["raça", "raca", "breed", "cão", "dog"],
    "animais-do-brasil": ["espécie", "especie", "species", "gênero", "genus", "animal", "ave", "bird", "mamífero",
                          "mammal", "peixe", "fish", "réptil", "reptile", "serpente", "snake", "família", "family"],
    "frutas": ["fruta", "fruit", "fruto", "espécie", "species", "planta", "plant", "árvore", "tree", "gênero", "genus"],
    "esportes-olimpicos": ["esporte", "desporto", "sport", "modalidade", "discipline"],
    "instrumentos-musicais": ["instrumento", "instrument"],
    "plantas-de-casa": ["espécie", "species", "planta", "plant", "gênero", "genus", "erva", "herb"],
    "comidas-tipicas": ["prato", "dish", "comida", "food", "doce", "dessert", "culinária", "cuisine", "bebida", "drink"],
    "festa-junina": ["prato", "dish", "comida", "food", "doce", "dessert", "bebida", "drink", "culinária", "cuisine"],
}


def pegar_json(url: str, tentativas: int = 10) -> dict:
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
            if erro.code == 429:  # limite de pedidos: espera o que o servidor pedir
                time.sleep(int(erro.headers.get("Retry-After") or 0) + 2 ** i)
                continue
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


def detalhes(qids: list[str]) -> dict[str, dict]:
    """Lê os itens de 50 em 50 (o máximo do wbgetentities), em vez de um pedido por item."""
    saida = {}
    for k in range(0, len(qids), 50):
        dados = api_wikidata(
            action="wbgetentities", ids="|".join(qids[k:k + 50]),
            props="sitelinks|labels|aliases|descriptions", languages="pt|pt-br|en",
        )
        for qid, ent in dados.get("entities", {}).items():
            apelidos = set()
            for idioma in ("pt", "pt-br", "en"):
                if idioma in ent.get("labels", {}):
                    apelidos.add(ent["labels"][idioma]["value"])
                for a in ent.get("aliases", {}).get(idioma, []):
                    apelidos.add(a["value"])
            desc = ent.get("descriptions", {})
            saida[qid] = {
                "rotulo": ent.get("labels", {}).get("pt", {}).get("value"),
                "descricao": (desc.get("pt") or desc.get("en") or {}).get("value"),
                "sitelinks": len(ent.get("sitelinks", {})),
                "ptwiki": ent.get("sitelinks", {}).get("ptwiki", {}).get("title"),
                "apelidos_wikidata": sorted(apelidos),
            }
    return saida


MES_FINAL = f"{dt.date.today().replace(day=1) - dt.timedelta(days=1):%Y-%m}"  # último mês completo


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


def qids_da_receita(cat_id: str) -> dict[str, str]:
    """Categoria gerada pelo importar.py já sabe o Q... de cada resposta: lê da última consulta
    guardada em dados/brutos/fontes/<cat>.json (nome, rótulos e apelidos -> qid)."""
    bruto = BRUTOS_FONTES / f"{cat_id}.json"
    if not bruto.exists():
        return {}
    mapa: dict[str, str] = {}
    for linha in json.loads(bruto.read_text(encoding="utf-8")):
        qid = linha["item"]["value"].rsplit("/", 1)[-1]
        for campo in ("nomePtBr", "nomePt", "tituloPt", "itemLabel", "apelido"):
            if campo in linha:
                mapa.setdefault(normalizar(linha[campo]["value"]), qid)
    return mapa


VISITAS_LOCAIS = RAIZ / "dados" / "brutos" / "visitas"  # scripts/baixar_visitas.sh


def meses_do_periodo() -> list[str]:
    fim = dt.date.today().replace(day=1) - dt.timedelta(days=1)
    meses, d = [], fim
    for _ in range(12):
        meses.append(f"{d:%Y%m}")
        d = d.replace(day=1) - dt.timedelta(days=1)
    return meses


def visitas_locais(titulos: set[str]) -> dict[str, int] | None:
    """Soma as visitas dos 12 meses a partir dos dumps baixados. None se falta algum mês."""
    arquivos = [VISITAS_LOCAIS / f"pt-{m}.tsv" for m in meses_do_periodo()]
    if not all(a.exists() for a in arquivos):
        return None
    procurados = {t.replace(" ", "_") for t in titulos}
    soma = dict.fromkeys(procurados, 0)
    for arquivo in arquivos:
        with arquivo.open(encoding="utf-8", errors="replace") as f:
            for linha in f:
                titulo, _, n = linha.rstrip("\n").partition("\t")
                if titulo in soma:
                    soma[titulo] += int(n)
    return {t.replace("_", " "): v for t, v in soma.items()}


def buscar_categoria(cat_id: str, sem_visitas: bool = False, so_visitas: bool = False) -> None:
    cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
    destino = DESTINO / f"{cat_id}.json"
    antigo = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else {}
    palavras = PALAVRAS_DA_CATEGORIA.get(cat_id)
    da_receita = qids_da_receita(cat_id)
    escolha = {}
    for r in cat["respostas"]:
        nome = r["resposta"]
        anterior = antigo.get(nome, {})
        if anterior.get("conferido") and anterior.get("qid"):
            qid, metodo = anterior["qid"], "conferido"
        elif so_visitas and anterior.get("qid"):
            qid, metodo = anterior["qid"], anterior.get("metodo", "incerto")
        elif qid_receita := next((da_receita[normalizar(n)] for n in [nome, *r["apelidos"]]
                                  if normalizar(n) in da_receita), None):
            qid, metodo = qid_receita, "receita"
        else:
            qid, metodo = achar_qid([nome, *r["apelidos"]], palavras)
        escolha[nome] = (qid, metodo)

    info = detalhes(sorted({q for q, _ in escolha.values() if q}))
    locais = {} if sem_visitas else visitas_locais({i["ptwiki"] for i in info.values() if i["ptwiki"]})
    if locais is None:
        print("  (sem os dumps de visitas em dados/brutos/visitas: usando a API, que é lenta)")
    saida = {}
    for nome, (qid, metodo) in escolha.items():
        anterior = antigo.get(nome, {})
        linha = {"qid": qid, "metodo": metodo, "conferido": bool(anterior.get("conferido"))}
        if qid and qid in info:
            linha.update(info[qid])
            if sem_visitas:
                linha["visitas_pt_12m"] = anterior.get("visitas_pt_12m") if anterior.get("qid") == qid else None
            elif locais is not None:
                linha["visitas_pt_12m"] = locais.get(linha["ptwiki"], 0) if linha["ptwiki"] else 0
            elif anterior.get("qid") == qid and anterior.get("visitas_mes_final") == MES_FINAL:
                linha["visitas_pt_12m"] = anterior.get("visitas_pt_12m")  # já buscado para o mesmo período
            else:
                linha["visitas_pt_12m"] = visitas_12_meses(linha["ptwiki"]) if linha["ptwiki"] else 0
            linha["visitas_mes_final"] = MES_FINAL
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
    sem_visitas = "--sem-visitas" in sys.argv
    so_visitas = "--so-visitas" in sys.argv
    escolhidas = [a for a in sys.argv[1:] if not a.startswith("--")]
    escolhidas = escolhidas or [a.stem for a in sorted(CATEGORIAS.glob("*.txt"))]
    for cat_id in escolhidas:
        print(f"\n== {cat_id}")
        buscar_categoria(cat_id, sem_visitas, so_visitas)


if __name__ == "__main__":
    main()
