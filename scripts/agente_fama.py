#!/usr/bin/env python3
"""Agente de fama: mede o quanto cada resposta vem à cabeça de um brasileiro, e não só
o quanto se lê sobre ela, e reordena as categorias do jogo.

Por que existe: nos testes, quase todo mundo só tirava óbvia e comum. A ordem vinha do
ICF (frequência em textos) ou das visitas na Wikipédia, que medem o quanto se LÊ sobre
algo. O jogo precisa do quanto se LEMBRA na hora de responder: Malta é muito citada
em notícias, mas quase ninguém diz "Malta" quando pedem um país.

Uso:
    python3 scripts/agente_fama.py                    # todas as categorias do jogo
    python3 scripts/agente_fama.py paises frutas      # só algumas
    python3 scripts/agente_fama.py --so-relatorio     # não chama nada, só recombina e compara

Passos, para cada categoria:
    1. lembrança (LLM): "se 1000 brasileiros respondessem esta pergunta, quantos dariam
       esta resposta?" e "quantos por cento reconheceriam?". Vai em lotes de LOTE
       respostas, e só as que ainda não estão em dados/sinais/llm/<cat>.json (o cache).
       Precisa de ANTHROPIC_API_KEY e `pip install anthropic`. Sem chave, usa só o cache.
    2. tendência (Wikipédia pt): visitas mês a mês, dos dumps baixados por
       scripts/baixar_visitas.sh, para os artigos já achados por scripts/buscar_wikidata.py.
       tendência = visitas dos 6 últimos meses / visitas dos 6 anteriores. Acima de 1 = em alta.
       (6 contra 6, e não 3 contra o ano, para quem teve um pico recente, como a Artemis 2 em
       abril, não aparecer "em baixa" só porque o pico já passou.) O efeito é proporcional ao
       tamanho das visitas: artigo pouco lido varia muito por acaso.
       (Google Trends não tem API pública estável; as visitas fazem o mesmo papel.)
    3. combinação: cada sinal é posto entre 0 e 1 dentro da categoria (1 = mais famosa) e
       entra com o peso de PESOS. A tendência soma ou tira até TENDENCIA_MAX.
       Grava dados/sinais/fama/<cat>.json, que o pontuar.py usa para ordenar a categoria.
    4. pontuar.py de novo e relatório: dados/sinais/revisao/agente-mudancas.csv lista o
       que mudou de faixa, com antes, depois e os sinais de cada resposta.

Ajustes manuais (dados/ajustes/<cat>.csv): a coluna supernova continua mandando. A coluna peso
vira um dos sinais ("revisao"), porque quase todas as categorias tinham peso para todas as
respostas, e ele passaria por cima da medida do agente. Para forçar uma resposta numa
posição, edite a lembrança dela em dados/sinais/llm/<cat>.json e rode com --so-relatorio.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import llm_nicho  # noqa: E402
import pontuar  # noqa: E402
from pontuar import CATEGORIAS, SAIDA, ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
SINAIS = RAIZ / "dados" / "sinais"
LLM = SINAIS / "llm"
FAMA = SINAIS / "fama"
VISITAS_LOCAIS = RAIZ / "dados" / "brutos" / "visitas"
RELATORIO = SINAIS / "revisao" / "agente-mudancas.csv"

LOTE = 60  # respostas por pedido ao LLM (listas grandes estouram a resposta)
# Peso de cada sinal na fama. A lembrança é o que o jogo mede, então manda.
# "conhecem" desempata a cauda (muita coisa que ninguém cita, mas uns reconhecem).
# "revisao" é o peso escrito antes em dados/ajustes/<cat>.csv (uma revisão feita de uma vez só);
# vira mais um palpite, não a palavra final. "visitas" (Wikipédia pt) e "texto" (ICF, frequência
# em textos) medem o quanto se lê: entram pouco.
PESOS = {"lembranca": 0.65, "conhecem": 0.10, "revisao": 0.15, "visitas": 0.07, "texto": 0.03}
TENDENCIA_MAX = 0.05  # quanto a tendência mexe na fama (0 a 1), para cima ou para baixo
FAIXAS = [(60, "rara"), (35, "incomum"), (18, "comum"), (0, "óbvia")]  # jogo/cena.js


def faixa(pontos: int, supernova: bool = False) -> str:
    if supernova:
        return "supernova"
    return next(nome for corte, nome in FAIXAS if pontos >= corte)


def ler_json(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else {}


# ---------- 1. lembrança (LLM, em lotes, com cache) ----------


def lembranca(cat: dict, chamar: bool) -> dict:
    """Devolve o arquivo dados/sinais/llm/<cat>.json, completando o que falta se puder."""
    destino = LLM / f"{cat['id']}.json"
    atual = ler_json(destino) or {"modelo": llm_nicho.MODELO, "amostras": 1, "itens": [], "faltando": []}
    pergunta = cat["pergunta"] or cat["titulo"]
    if atual.get("pergunta") not in (None, pergunta):
        print(f"  a pergunta mudou ('{atual['pergunta']}' -> '{pergunta}'): o cache inteiro é refeito")
        atual = {"modelo": llm_nicho.MODELO, "amostras": 1, "itens": [], "faltando": []}
    atual["pergunta"] = pergunta
    feitos = {normalizar(i["resposta"]) for i in atual["itens"]}
    faltam = [r for r in cat["respostas"] if normalizar(r["resposta"]) not in feitos]
    if not faltam:
        return atual
    if not chamar:
        print(f"  {len(faltam)} respostas sem estimativa de lembrança (sem ANTHROPIC_API_KEY)")
        return atual

    import anthropic

    cliente = anthropic.Anthropic()
    todas = ", ".join(r["resposta"] for r in cat["respostas"])
    for k in range(0, len(faltam), LOTE):
        lote = faltam[k:k + LOTE]
        print(f"  lembrança: lote {k // LOTE + 1} de {-(-len(faltam) // LOTE)} ({len(lote)} respostas)")
        pedido = llm_nicho.montar_pedido({**cat, "respostas": lote})
        if len(lote) < len(cat["respostas"]):
            pedido += (
                "\n\nEstime só as respostas acima. Para calibrar, a lista completa aceita na rodada é: "
                + todas
            )
        resultado = llm_nicho.juntar_amostras({**cat, "respostas": lote}, [llm_nicho.perguntar(cliente, pedido)])
        atual["itens"].extend(resultado["itens"])
        atual["faltando"] = sorted(set(atual.get("faltando", [])) | set(resultado["faltando"]))
        LLM.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(atual, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")  # cache a cada lote
    return atual


# ---------- 2. tendência (visitas mês a mês na Wikipédia pt) ----------


def meses_disponiveis() -> list[Path]:
    """Os 12 dumps mensais mais recentes que existem, do mais novo ao mais velho."""
    return sorted(VISITAS_LOCAIS.glob("pt-??????.tsv"), reverse=True)[:12]


_SERIES: dict[str, list[int]] = {}


def visitas_por_mes(titulos: set[str]) -> dict[str, list[int]]:
    """título -> visitas em cada mês (mais novo primeiro). Vazio se não há dumps.
    Cada dump tem uns 100 MB; por isso main() pede os títulos de todas as categorias de uma vez."""
    faltam = titulos - set(_SERIES)
    arquivos = meses_disponiveis()
    if not arquivos or not titulos:
        return {}
    if faltam:
        _SERIES.update(_ler_dumps(faltam, arquivos))
    return {t: _SERIES[t] for t in titulos if t in _SERIES}


def _ler_dumps(titulos: set[str], arquivos: list[Path]) -> dict[str, list[int]]:
    procurados = {t.replace(" ", "_"): t for t in titulos}
    serie = {t: [0] * len(arquivos) for t in titulos}
    for i, arquivo in enumerate(arquivos):
        with arquivo.open(encoding="utf-8", errors="replace") as f:
            for linha in f:
                titulo, _, n = linha.rstrip("\n").partition("\t")
                if titulo in procurados:
                    serie[procurados[titulo]][i] += int(n)
    return serie


def tendencia(serie: list[int]) -> float | None:
    """Metade mais nova do período contra a mais velha. None com pouco dado ou artigo novo."""
    if len(serie) < 6 or sum(serie) < 120:  # menos de ~10 visitas por mês é ruído
        return None
    meio = len(serie) // 2
    novo, velho = sum(serie[:meio]), sum(serie[meio:])
    if not velho or 0 in serie:  # artigo criado no meio do período: não dá para comparar
        return None
    return round(novo / velho, 2)


# ---------- 3. combinação ----------


def escala(valores: dict[str, float]) -> dict[str, float]:
    """Põe o sinal entre 0 (menor da categoria) e 1 (maior), mantendo as distâncias.
    Não usa a posição (percentil): numa lista de 680 astronautas, 0,1 e 0,01 em 1000 são
    os dois "ninguém lembra", e pela posição o 0,1 pularia à frente de centenas de nomes."""
    menor, maior = min(valores.values()), max(valores.values())
    if maior == menor:
        return dict.fromkeys(valores, 0.5)
    return {k: (v - menor) / (maior - menor) for k, v in valores.items()}


def combinar(cat: dict, llm: dict, base: pontuar.BaseICF) -> dict:
    respostas = [r["resposta"] for r in cat["respostas"]]
    itens = {normalizar(i["resposta"]): i for i in llm.get("itens", [])}
    wikidata = ler_json(SINAIS / "wikidata" / f"{cat['id']}.json")

    brutos: dict[str, dict[str, float]] = {s: {} for s in PESOS}
    ajustes = pontuar.ler_ajustes(cat["id"])
    for r in cat["respostas"]:
        nome = r["resposta"]
        item = itens.get(normalizar(nome))
        if item:
            # log: entre 300 e 400 em 1000 a diferença importa menos que entre 0 e 5
            brutos["lembranca"][nome] = math.log1p(float(item["respostas_em_1000"]))
            if item.get("conhecem_pct") is not None:
                brutos["conhecem"][nome] = float(item["conhecem_pct"])
        manual = (ajustes.get(normalizar(nome), {}).get("peso") or "").strip()
        if manual:
            brutos["revisao"][nome] = -float(manual)  # peso alto = nichada
        icf = pontuar.icf_de(nome, base)
        if icf is not None:
            brutos["texto"][nome] = -icf  # ICF alto = palavra rara
        visitas = (wikidata.get(nome) or {}).get("visitas_pt_12m")
        if isinstance(visitas, (int, float)):
            brutos["visitas"][nome] = math.log1p(visitas)
    # Resposta sem estimativa de lembrança conta como "ninguém lembra" (0), e não como média:
    # as listas cresceram com milhares de respostas nichadas, e elas não podem cair no meio.
    # O LLM estima as conhecidas; o resto se ordena pelos outros sinais (peso manual, visitas, texto).
    for sinal in ("lembranca", "conhecem"):
        if brutos[sinal]:
            for nome in respostas:
                brutos[sinal].setdefault(nome, 0.0)
    pcts = {s: escala(v) for s, v in brutos.items() if len(v) >= len(respostas) / 2}
    pesos = PESOS

    titulos = {(wikidata.get(n) or {}).get("ptwiki") for n in respostas} - {None}
    series = visitas_por_mes(titulos)

    linhas = {}
    for nome in respostas:
        soma = total = 0.0
        for sinal, p in pcts.items():
            if nome in p:
                soma += pesos[sinal] * p[nome]
                total += pesos[sinal]
        fama = soma / total if total else 0.5
        titulo = (wikidata.get(nome) or {}).get("ptwiki")
        t = tendencia(series[titulo]) if titulo in series else None
        if t is not None:
            # dobro = +TENDENCIA_MAX; metade = -TENDENCIA_MAX. Vezes o tamanho das visitas (0 a 1 na
            # categoria): artigo com 20 visitas por mês sobe e desce 5 vezes por acaso, e numa lista
            # enorme, em que a cauda está toda empatada, isso bagunçaria a ordem.
            tamanho = pcts.get("visitas", {}).get(nome, 0.0)
            fama += TENDENCIA_MAX * tamanho * max(-1.0, min(1.0, math.log2(t)))
        item = itens.get(normalizar(nome)) or {}
        linhas[nome] = {
            "fama": round(min(max(fama, 0.0), 1.0), 4),
            "lembranca_em_1000": item.get("respostas_em_1000"),
            # estimada de verdade (não o valor padrão de listas de nomes próprios): só estas
            # podem sair de rara, ver pontuar.py
            "estimada": item.get("origem") == "estimado",
            "conhecem_pct": item.get("conhecem_pct"),
            "visitas_pt_12m": (wikidata.get(nome) or {}).get("visitas_pt_12m"),
            "tendencia": t,
        }
    return {
        "categoria": cat["id"],
        "gerado_em": dt.date.today().isoformat(),
        "sinais": sorted(pcts),
        "meses_de_visitas": [a.stem[3:] for a in meses_disponiveis()] if series else [],
        "pesos": {k: round(v, 3) for k, v in pesos.items() if k in pcts},
        "estimadas_pelo_llm": len(itens),
        "respostas": linhas,
    }


# ---------- 4. relatório ----------


def retrato() -> dict[str, dict[str, tuple[int, str]]]:
    """categoria -> resposta -> (pontos, faixa), a partir de dados/pesos/."""
    saida = {}
    for j in SAIDA.glob("*.json"):
        if j.name == "indice.json":
            continue
        d = ler_json(j)
        saida[d["id"]] = {
            r["resposta"]: (r["pontos"], faixa(r["pontos"], r["resposta"] == d.get("supernova")))
            for r in d["respostas"]
        }
    return saida


ORDEM_FAIXA = {"óbvia": 0, "comum": 1, "incomum": 2, "rara": 3, "supernova": 4}


def relatorio(antes: dict, depois: dict, cats: list[str]) -> list[dict]:
    linhas = []
    for cat_id in cats:
        fama = ler_json(FAMA / f"{cat_id}.json").get("respostas", {})
        for nome, (pontos, f) in depois.get(cat_id, {}).items():
            p0, f0 = antes.get(cat_id, {}).get(nome, (None, ""))
            if f0 == f:
                continue
            s = fama.get(nome, {})
            linhas.append({
                "categoria": cat_id,
                "resposta": nome,
                "faixa_antes": f0,
                "pontos_antes": p0,
                "faixa_agora": f,
                "pontos_agora": pontos,
                "saltos": ORDEM_FAIXA[f] - ORDEM_FAIXA.get(f0, ORDEM_FAIXA[f]),
                "lembranca_em_1000": s.get("lembranca_em_1000"),
                "conhecem_pct": s.get("conhecem_pct"),
                "visitas_pt_12m": s.get("visitas_pt_12m"),
                "tendencia": s.get("tendencia"),
            })
    linhas.sort(key=lambda l: (-abs(l["saltos"]), l["categoria"], l["saltos"], l["resposta"]))
    if linhas:
        RELATORIO.parent.mkdir(parents=True, exist_ok=True)
        with RELATORIO.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0]))
            w.writeheader()
            w.writerows(linhas)
    return linhas


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("categorias", nargs="*")
    p.add_argument("--so-relatorio", action="store_true", help="não chama o LLM, só recombina o que já existe")
    args = p.parse_args()

    fora = pontuar.fora_do_jogo()
    cats = args.categorias or [a.stem for a in sorted(CATEGORIAS.glob("*.txt")) if a.stem not in fora]
    chamar = not args.so_relatorio and bool(os.environ.get("ANTHROPIC_API_KEY"))
    if not chamar and not args.so_relatorio:
        print("Sem ANTHROPIC_API_KEY: só o que já está em dados/sinais/llm/ entra na conta.\n")

    antes = retrato()
    base = pontuar.BaseICF()
    # lê os dumps de visitas uma vez só, com os artigos de todas as categorias
    todos = set()
    for cat_id in cats:
        wikidata = ler_json(SINAIS / "wikidata" / f"{cat_id}.json")
        todos |= {l.get("ptwiki") for l in wikidata.values()} - {None}
    visitas_por_mes(todos)
    FAMA.mkdir(parents=True, exist_ok=True)
    for cat_id in cats:
        cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
        print(f"== {cat_id}")
        llm = lembranca(cat, chamar)
        if not llm["itens"]:
            print("  sem lembrança: a categoria fica com a ordem antiga (ICF ou visitas)")
            (FAMA / f"{cat_id}.json").unlink(missing_ok=True)
            continue
        fama = combinar(cat, llm, base)
        (FAMA / f"{cat_id}.json").write_text(json.dumps(fama, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        top = sorted(fama["respostas"].items(), key=lambda kv: -kv[1]["fama"])
        print(f"  sinais: {', '.join(fama['sinais'])}. Mais famosas: {', '.join(n for n, _ in top[:5])}")

    print("\n== pontuar.py")
    sys.argv = [sys.argv[0], *([] if not args.categorias else cats)]
    pontuar.main()
    linhas = relatorio(antes, retrato(), cats)
    subiram = sum(l["saltos"] > 0 for l in linhas)
    print(f"\n{len(linhas)} respostas mudaram de faixa ({subiram} ficaram mais raras, "
          f"{len(linhas) - subiram} mais óbvias). Lista: {RELATORIO.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
