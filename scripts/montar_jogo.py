#!/usr/bin/env python3
"""Prepara o jogo para abrir com dois cliques, sem servidor.

Uso: python3 scripts/montar_jogo.py   (o pontuar.py já chama no fim)

Gera:
    jogo/dados.js   as perguntas de dados/pesos/ num arquivo JS (o navegador
                    não deixa uma página aberta do computador ler arquivos JSON)
    jogar.html      o jogo inteiro num arquivo só: estilo, código e perguntas.
                    Dá para mandar esse arquivo para alguém e abrir direto.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import singularidades  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PESOS = RAIZ / "dados" / "pesos"
JOGO = RAIZ / "jogo"


# O jogo só lê o nome, os apelidos e os pontos de cada resposta. Os sinais da conta
# (icf, visitas, fama...) ficam em dados/pesos/ e deixariam o dados.js com o dobro do tamanho.
# "acima" (só nas categorias com simulação de jogadores, scripts/fama.py): a parte dos jogadores
# que daria uma resposta mais óbvia que esta. É o "melhor que X% dos jogadores" do diário de bordo.
CAMPOS_RESPOSTA = ("resposta", "apelidos", "pontos", "acima", "espertalhao", "frase")


def enxugar(cat: dict) -> dict:
    # "curiosidade": a descrição da singularidade (dados/singularidades.txt), que o jogo mostra
    # no cartão do resultado e na lista de respostas do fim
    return {**cat, "curiosidade": singularidades.descricao(cat["id"]),
            "respostas": [{k: r[k] for k in CAMPOS_RESPOSTA if k in r} for r in cat["respostas"]]}


ORDEM = RAIZ / "dados" / "ordem.txt"

# Regra do banco: toda categoria aberta precisa de pelo menos 1000 respostas.
# As fechadas (o mundo só tem aquele tanto) são exceção e ficam com o tamanho real.
MINIMO_RESPOSTAS = 1000
FECHADAS = {
    "capitais-do-mundo", "constelacoes", "elementos-quimicos", "esportes-olimpicos",
    "astronautas", "filmes-tom-hanks", "jogadores-da-selecao", "novelas-brasileiras",
    "ossos-do-corpo", "paises", "paises-acima-do-equador",
    "palavras-astro-e-cosmo", "turma-da-monica",
}


def contar_respostas(cid: str) -> int:
    arq = RAIZ / "dados" / "categorias" / f"{cid}.txt"
    return sum(1 for l in arq.read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("#"))


def avisar_pequenas(fila: list[str]) -> None:
    """Avisa das categorias abertas da fila que ainda não chegaram a MINIMO_RESPOSTAS."""
    import datetime as dt
    hoje = (dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date() - dt.date(2026, 10, 28)).days  # índice do dia de hoje no Brasil (UTC-3)
    pequenas = [(i // 7 + 1, cid, n) for i, cid in enumerate(fila)
                if cid not in FECHADAS and (n := contar_respostas(cid)) < MINIMO_RESPOSTAS]
    futuras = [p for p in pequenas if p[0] > hoje + 1]  # o dia de hoje já está no ar
    if futuras:
        print(f"AVISO: {len(futuras)} categorias abertas ainda não foram ao ar e têm menos de "
              f"{MINIMO_RESPOSTAS} respostas:")
        for dia, cid, n in futuras:
            print(f"  dia #{dia}: {cid} ({n})")


def ordem_dos_dias(indice: list[dict]) -> list[str]:
    """A fila de categorias do jogo (dados/ordem.txt). Categoria que ainda não está na fila
    entra no fim, e o arquivo é regravado: os dias que já passaram nunca mudam."""
    linhas = ORDEM.read_text(encoding="utf-8").splitlines() if ORDEM.exists() else []
    # "- id" = categoria tirada do jogo: nunca entra na fila
    tiradas = {l[1:].strip() for l in linhas if l.startswith("-")}
    ordem = [l.strip() for l in linhas if l.strip() and not l.startswith(("#", "-"))]
    novas = sorted(c["id"] for c in indice if c["id"] not in ordem and c["id"] not in tiradas)
    if novas:
        ORDEM.write_text("\n".join(linhas + novas) + "\n", encoding="utf-8")
        print(f"dados/ordem.txt: {len(novas)} categorias novas no fim da fila")
    existentes = {c["id"] for c in indice}
    fila = [i for i in ordem + novas if i in existentes]
    # aviso de quando a fila acaba (depois disso as categorias começariam a se repetir)
    import datetime as dt
    ultimo = dt.date(2026, 10, 28) + dt.timedelta(days=len(fila) // 7 - 1)
    print(f"dados/ordem.txt: {len(fila)} categorias, dá até o dia #{len(fila) // 7} ({ultimo:%d/%m/%Y})")
    escrever_dias(indice, fila)
    avisar_pequenas(fila)
    avisar_sem_simulacao(fila)
    return fila


def avisar_sem_simulacao(fila: list[str]) -> None:
    """Trava da fama: categoria que ainda vai ao ar precisa da simulação de jogadores
    (dados/sinais/lembranca/<id>.txt, scripts/fama.py) com a mesma pergunta. Como nenhuma categoria
    se repete, não dá para corrigir depois: a conferência completa é `python3 scripts/fama.py --conferir`."""
    import datetime as dt
    hoje = (dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date() - dt.date(2026, 10, 28)).days
    faltam = []
    for i, cid in enumerate(fila[max(0, hoje) * 7:], start=max(0, hoje) * 7):
        sim = RAIZ / "dados" / "sinais" / "lembranca" / f"{cid}.txt"
        cat = RAIZ / "dados" / "categorias" / f"{cid}.txt"
        pergunta = next((l for l in cat.read_text(encoding="utf-8").splitlines() if l.startswith("# pergunta:")), "")
        if not sim.exists():
            faltam.append((i // 7 + 1, cid, "sem simulação de jogadores"))
        elif pergunta not in sim.read_text(encoding="utf-8").splitlines():
            faltam.append((i // 7 + 1, cid, "a pergunta mudou depois da simulação"))
    if faltam:
        print(f"AVISO: {len(faltam)} categorias que ainda vão ao ar não passaram pela fama nova (scripts/fama.py):")
        for dia, cid, motivo in faltam:
            print(f"  dia #{dia}: {cid} ({motivo})")


def escrever_dias(indice: list[dict], fila: list[str]) -> None:
    """DIAS.md: os nichos de cada dia (dia, data, as 7 perguntas e quantas respostas cada uma tem),
    para consultar sem abrir o jogo. Gerado a partir da fila; não edite à mão."""
    import datetime as dt
    por_id = {c["id"]: c for c in indice}
    inicio = dt.date(2026, 10, 28)
    semana = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]
    linhas = ["# Nichos de cada dia", "",
              "Gerado por `scripts/montar_jogo.py` a partir de `dados/ordem.txt`. Não edite à mão.",
              "Nenhuma categoria se repete; categoria nova entra no fim da fila.", ""]
    for d in range(len(fila) // 7):
        data = inicio + dt.timedelta(days=d)
        linhas += [f"## Dia {d + 1} · {semana[data.weekday()]} {data:%d/%m/%Y}", "",
                   "| # | Categoria | Pergunta | Respostas |", "|---|---|---|---|"]
        for k, cid in enumerate(fila[7 * d:7 * d + 7], 1):
            c = por_id[cid]
            n = contar_respostas(cid)
            linhas.append(f"| {k} | {c['titulo']} | {c['pergunta']} | {n} |")
        linhas.append("")
    sobra = fila[len(fila) // 7 * 7:]
    if sobra:
        linhas += ["## Na fila (ainda não formam um dia)", ""] + [f"- {por_id[c]['titulo']}" for c in sobra] + [""]
    (RAIZ / "DIAS.md").write_text("\n".join(linhas), encoding="utf-8")


def gerar_dados_js() -> str:
    indice = json.loads((PESOS / "indice.json").read_text(encoding="utf-8"))
    brutas = {c["id"]: json.loads((PESOS / f"{c['id']}.json").read_text(encoding="utf-8")) for c in indice}
    singularidades.conferir(brutas)  # toda singularidade precisa de descrição
    categorias = {cid: enxugar(cat) for cid, cat in brutas.items()}
    dados = json.dumps({"indice": indice, "ordem": ordem_dos_dias(indice), "categorias": categorias}, ensure_ascii=False, separators=(",", ":"))
    return "// Gerado por scripts/montar_jogo.py. Não edite à mão.\nwindow.NICHO_DADOS = " + dados + ";\n"


def main() -> None:
    dados_js = gerar_dados_js()
    (JOGO / "dados.js").write_text(dados_js, encoding="utf-8")

    html = (JOGO / "index.html").read_text(encoding="utf-8")
    css = (JOGO / "estilo.css").read_text(encoding="utf-8")
    # embute todo <script src="..."> de jogo/index.html, na mesma ordem
    nomes = re.findall(r'<script src="([^"]+)"></script>', html)
    scripts = {n: dados_js if n == "dados.js" else (JOGO / n).read_text(encoding="utf-8") for n in nomes}
    html = html.replace('<link rel="stylesheet" href="estilo.css">', "<style>\n" + css + "</style>")
    acentos = (JOGO / "fonte-acentos.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="fonte-acentos.css">', "<style>\n" + acentos + "</style>")
    fontes = (JOGO / "fontes.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="fontes.css">', "<style>\n" + fontes + "</style>")
    for nome, codigo in scripts.items():
        marca = f'<script src="{nome}"></script>'
        assert marca in html, f"faltou {marca} em jogo/index.html"
        html = html.replace(marca, "<script>\n" + codigo.replace("</script", "<\\/script") + "</script>")
    # jogar.html fica na raiz, ao lado de privacidade.html, termos.html e creditos.html
    for pagina in ("privacidade", "termos", "creditos"):
        html = html.replace(f'href="../{pagina}.html"', f'href="{pagina}.html"')
    (RAIZ / "jogar.html").write_text(html, encoding="utf-8")
    print("jogo/dados.js e jogar.html atualizados")


if __name__ == "__main__":
    main()
