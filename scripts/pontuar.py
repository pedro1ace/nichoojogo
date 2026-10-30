#!/usr/bin/env python3
"""Calcula o peso de "nicho" de cada resposta, por categoria.

Uso:
    python3 scripts/pontuar.py                 # todas as categorias
    python3 scripts/pontuar.py constelacoes    # só uma

Entrada:
    dados/brutos/pt-br/icf          frequência inversa (rode scripts/baixar_dados.sh)
    dados/categorias/<cat>.txt      respostas aceitas
    dados/ajustes/<cat>.csv         (opcional) correções manuais
Saída:
    dados/pesos/<cat>.json          o que o jogo carrega
    dados/pesos/revisao/<cat>.csv   tabela para revisar à mão
    dados/pesos/indice.json         lista de categorias prontas
    jogo/dados.js e jogar.html      atualizados no fim (scripts/montar_jogo.py)

Como o peso é calculado (0 a 1, onde 1 = muito nichado):
    1. ICF da resposta: quanto maior, mais rara a palavra no português em geral.
       Nomes com várias palavras usam a média das palavras (sem "de", "do"...).
       Nomes que não existem na base recebem ICF_SEM_DADO e saem marcados
       com sem_dado=True para revisão manual.
    2. percentil: posição da resposta dentro da própria categoria (0 = a mais
       comum da categoria, 1 = a mais rara). É o que mais pesa, porque "Marte"
       é óbvio para planetas mesmo não sendo uma palavra tão comum no geral.
    3. raridade_global: o ICF normalizado entre o mínimo e o máximo da base.
    peso = PESO_PERCENTIL * percentil + (1 - PESO_PERCENTIL) * raridade_global
    4. régua da categoria: o peso acima (ou o manual) só decide a ORDEM das
       respostas. Depois a ordem é espalhada pela RÉGUA, para toda categoria ter
       todas as faixas do jogo, como no Krillion: 2% óbvias (8 a 15 pontos, de 3 a 15
       respostas), 5% comuns (18 a 34, de 5 a 40), 15% incomuns (35 a 58, de 10 a 150)
       e todo o resto raro (60 a 90). A supernova vale sempre 100 (50, dobrada no jogo).
       O peso de antes fica salvo em "fama", para revisão. "peso" = raiz(pontos/100).
    Exceção: se mais da metade das respostas não está na base (nomes próprios) e a
    categoria tem visitas da Wikipédia (dados/sinais/wikidata/<cat>.json), a ordem
    vem das visitas: a mais visitada é a mais óbvia, a menos visitada a mais rara.
    Acima das duas: se existe dados/sinais/fama/<cat>.json (scripts/agente_fama.py), a
    ordem vem da fama medida pelo agente (lembrança estimada por LLM, quem reconhece,
    visitas e tendência na Wikipédia, e o peso manual como mais um sinal). Aí a supernova
    é, entre as raras, a que mais gente reconheceria: rara de lembrar, mas fácil de aceitar
    como certa. A coluna supernova dos ajustes continua mandando.

Categorias fora do jogo: ids em dados/fora_do_jogo.txt (um por linha, # comenta).
Continuam no repositório, mas não entram em dados/pesos/ nem no jogo.

Ajustes manuais (dados/ajustes/<cat>.csv), cabeçalho: resposta,peso,supernova
    peso em 0-100 substitui o calculado (deixe vazio para manter);
    supernova=1 marca a resposta secreta da rodada (o "krillion" do Nicho).
    O jogo dobra os pontos dela, e aqui ela é ajustada para, dobrada, valer
    sempre mais que a maior resposta da categoria.
"""
from __future__ import annotations

import csv
import json
import math
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ICF_ARQUIVO = RAIZ / "dados" / "brutos" / "pt-br" / "icf"
CATEGORIAS = RAIZ / "dados" / "categorias"
AJUSTES = RAIZ / "dados" / "ajustes"
SAIDA = RAIZ / "dados" / "pesos"
SINAIS_WIKIDATA = RAIZ / "dados" / "sinais" / "wikidata"
SINAIS_FAMA = RAIZ / "dados" / "sinais" / "fama"  # scripts/agente_fama.py

PESO_PERCENTIL = 0.7
FORA_DO_JOGO = RAIZ / "dados" / "fora_do_jogo.txt"
# Régua, como no Krillion: pouquíssimas óbvias, poucas comuns e a cauda longa rara.
# (parte da lista, mínimo, máximo de respostas, pontos no começo e no fim da faixa),
# da mais famosa para a menos famosa. A rara fica com todo o resto.
# Os cortes das faixas no jogo (FAIXAS em jogo/cena.js) são 18, 35 e 60 pontos.
# Com o agente de fama, a cota é só o máximo: para entrar numa faixa a resposta precisa de um
# mínimo de lembrança (quantos em 1000 brasileiros a dariam, dados/sinais/llm). Sem isso, numa lista
# enorme com poucas respostas lembradas, as cotas puxavam para incomum nomes que ninguém diria.
LEMBRANCA_MINIMA = [5.0, 1.0, 0.1]  # óbvia, comum, incomum. Abaixo de 0,1 em 1000 é rara.
REGUA = [
    (0.02, 3, 15, 8, 15),     # óbvia
    (0.05, 5, 40, 18, 34),    # comum
    (0.15, 10, 150, 35, 58),  # incomum
    (1.00, 0, 10**9, 60, 90),  # rara: o resto
]
SUPERNOVA_PONTOS = 50  # dobrada no jogo: 100, acima da maior rara (90)
CURVA = 2.0
# ICF usado quando a palavra não existe na base. Fica perto da mediana da base
# (20,9): "provavelmente rara", mas sem chutar o máximo. Essas linhas saem com
# sem_dado=True e devem ser revisadas à mão ou com ajuda de um LLM.
ICF_SEM_DADO = 20.0
PALAVRAS_VAZIAS = {"de", "do", "da", "dos", "das", "e", "o", "a", "os", "as", "d"}


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, hífen vira espaço. Igual ao jogo (jogo/jogo.js)."""
    texto = unicodedata.normalize("NFD", texto.lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    texto = "".join(c if c.isalnum() else " " for c in texto)
    return " ".join(texto.split())


class BaseICF:
    """Procura primeiro a grafia exata (com acento) e só depois sem acento,
    para "Pará" não virar a preposição "para"."""

    def __init__(self) -> None:
        if not ICF_ARQUIVO.exists():
            sys.exit("Base não encontrada. Rode antes: ./scripts/baixar_dados.sh")
        self.exato: dict[str, float] = {}
        self.sem_acento: dict[str, float] = {}
        with ICF_ARQUIVO.open(encoding="utf-8") as f:
            for linha in f:
                palavra, _, valor = linha.strip().rpartition(",")
                if not palavra:
                    continue
                v = float(valor)
                self.exato[palavra.lower()] = v
                chave = normalizar(palavra)
                # várias grafias caem na mesma chave sem acento: fica a mais comum
                if chave not in self.sem_acento or v < self.sem_acento[chave]:
                    self.sem_acento[chave] = v
        self.minimo = min(self.exato.values())
        self.maximo = max(self.exato.values())

    def palavra(self, p: str) -> float | None:
        p = p.lower()
        if p in self.exato:
            return self.exato[p]
        return self.sem_acento.get(normalizar(p))


def ler_categoria(caminho: Path) -> dict:
    meta = {"id": caminho.stem, "titulo": caminho.stem, "pergunta": ""}
    respostas = []
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        if linha.startswith("#"):
            chave, _, valor = linha[1:].partition(":")
            if chave.strip() in ("titulo", "pergunta"):
                meta[chave.strip()] = valor.strip()
            continue
        nomes = [n.strip() for n in linha.split("|") if n.strip()]
        respostas.append({"resposta": nomes[0], "apelidos": nomes[1:]})
    meta["respostas"] = respostas
    return meta


def icf_de(nome: str, base: BaseICF) -> float | None:
    """ICF de um nome. Com várias palavras, usa a média das que existem na base."""
    inteiro = base.palavra(nome)
    if inteiro is not None:
        return inteiro
    partes = [p for p in nome.lower().replace("-", " ").split() if normalizar(p) not in PALAVRAS_VAZIAS]
    conhecidas = [v for v in (base.palavra(p) for p in partes) if v is not None]
    if len(partes) > 1 and conhecidas:
        return sum(conhecidas) / len(conhecidas)
    return None


def ler_ajustes(cat_id: str) -> dict[str, dict]:
    caminho = AJUSTES / f"{cat_id}.csv"
    if not caminho.exists():
        return {}
    with caminho.open(encoding="utf-8") as f:
        return {normalizar(l["resposta"]): l for l in csv.DictReader(f)}


def ler_visitas(cat_id: str) -> dict[str, int]:
    """Visitas na pt.wikipedia em 12 meses, por resposta (dados/sinais/wikidata/<cat>.json)."""
    caminho = SINAIS_WIKIDATA / f"{cat_id}.json"
    if not caminho.exists():
        return {}
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    return {nome: l.get("visitas_pt_12m") or 0 for nome, l in dados.items()}


def ler_fama(cat_id: str) -> dict[str, dict]:
    """Fama medida pelo agente (dados/sinais/fama/<cat>.json): 1 = todo mundo pensa nela."""
    caminho = SINAIS_FAMA / f"{cat_id}.json"
    if not caminho.exists():
        return {}
    return json.loads(caminho.read_text(encoding="utf-8")).get("respostas", {})


def metodo_da_fama(cat_id: str) -> str:
    caminho = SINAIS_FAMA / f"{cat_id}.json"
    if not caminho.exists():
        return ""
    return json.loads(caminho.read_text(encoding="utf-8")).get("metodo", "agente")


# Régua fixa da simulação (scripts/fama.py): os pontos saem de "quantos em 1000 jogadores dariam
# esta resposta", e não da posição na lista. Assim 20 pontos querem dizer a mesma coisa em toda
# categoria. (de quantos em 1000, até quantos, pontos no "de", pontos no "até"), em escala log.
REGUA_FIXA = [
    (150.0, 15.0, 8, 15),   # óbvia: 15 ou mais em 1000
    (15.0, 4.0, 18, 34),    # comum: de 4 a 15
    (4.0, 1.0, 35, 58),     # incomum: de 1 a 4
]
RARA = (60, 90)
PONTOS_CRIATIVA = 70  # resposta criativa (scripts/fama.py, "~"): Homer em Coisas amarelas, Panela em Instrumentos  # menos de 1 em 1000: os pontos sobem pela ordem da cauda


def pontos_fixos(lembra: float) -> int | None:
    """Pontos pela régua fixa, ou None se é rara (menos de 1 em 1000)."""
    for de, ate, p_de, p_ate in REGUA_FIXA:
        if lembra >= ate:
            k = (math.log(min(lembra, de)) - math.log(de)) / (math.log(ate) - math.log(de))
            return round(p_de + (p_ate - p_de) * max(0.0, min(1.0, k)))
    return None


def percentis(valores: list[float]) -> list[float]:
    """Percentil com empates na média: 0 = menor ICF, 1 = maior."""
    n = len(valores)
    if n == 1:
        return [1.0]
    ordem = sorted(range(n), key=lambda i: valores[i])
    resultado = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and valores[ordem[j + 1]] == valores[ordem[i]]:
            j += 1
        p = ((i + j) / 2) / (n - 1)
        for k in range(i, j + 1):
            resultado[ordem[k]] = p
        i = j + 1
    return resultado


def cotas(n: int) -> list[int]:
    """Quantas respostas cada faixa da RÉGUA recebe numa lista de n."""
    resto, saida = n, []
    for parte, minimo, maximo, _, _ in REGUA[:-1]:
        c = min(resto, max(minimo, min(maximo, round(parte * n))))
        saida.append(c)
        resto -= c
    return saida + [resto]


def cotas_com_teto(n: int, tetos: list[int]) -> list[int]:
    """cotas(n), mas com no máximo tetos[k] respostas nas faixas 0..k juntas (k = óbvia, comum,
    incomum). O que não cabe desce de faixa; no fim, o resto é rara."""
    saida = cotas(n)
    acumulado = 0
    for k, teto in enumerate(tetos):
        saida[k] = max(0, min(saida[k], teto - acumulado))
        acumulado += saida[k]
    saida[-1] = n - sum(saida[:-1])
    return saida


def na_regua(i: int, n: int, faixas: list[int] | None = None) -> int:
    """Pontos da i-ésima resposta (0 = a mais famosa) de n, pela RÉGUA.
    Cada faixa recebe a sua cota exata, e dentro dela os pontos sobem por igual."""
    inicio = 0
    for cota, (_, _, _, de, ate) in zip(faixas or cotas(n), REGUA):
        if i < inicio + cota:
            k = (i - inicio) / (cota - 1) if cota > 1 else 0.5
            return round(de + (ate - de) * k)
        inicio += cota
    return REGUA[-1][4]


def fora_do_jogo() -> set[str]:
    if not FORA_DO_JOGO.exists():
        return set()
    linhas = FORA_DO_JOGO.read_text(encoding="utf-8").splitlines()
    return {l.split("#")[0].strip() for l in linhas if l.split("#")[0].strip()}


def pontuar(caminho: Path, base: BaseICF) -> dict:
    cat = ler_categoria(caminho)
    ajustes = ler_ajustes(cat["id"])
    respostas = cat["respostas"]

    for r in respostas:
        valor = icf_de(r["resposta"], base)
        for apelido in r["apelidos"]:
            if valor is not None:
                break
            if len(apelido) <= 3:
                continue
            valor = icf_de(apelido, base)
        r["sem_dado"] = valor is None
        r["icf"] = round(ICF_SEM_DADO if valor is None else valor, 3)

    # Nomes próprios (astronautas, exoplanetas...) quase nunca estão na base de palavras, e aí o
    # ICF não diz nada. Se mais da metade está sem dado e há visitas da Wikipédia
    # (scripts/buscar_wikidata.py), a categoria inteira é ordenada pelas visitas.
    visitas = ler_visitas(cat["id"])
    sem = sum(r["sem_dado"] for r in respostas)
    cat["fonte_peso"] = "visitas" if visitas and sem > len(respostas) / 2 else "icf"
    fama_agente = ler_fama(cat["id"])
    if fama_agente:
        cat["fonte_peso"] = "agente"
        # sem medida do agente (resposta nova na lista) conta como a menos famosa: rara.
        # Rode o agente_fama.py de novo para ela ganhar medida.
        # Quem passa de um mínimo de LEMBRANCA_MINIMA vem sempre antes de quem não passa.
        def degrau(r: dict) -> int:
            m = fama_agente.get(r["resposta"]) or {}
            lembra = (m.get("lembranca_em_1000") or 0) if m.get("estimada", True) else 0
            return sum(lembra >= x for x in LEMBRANCA_MINIMA)

        ordem = percentis([-((fama_agente.get(r["resposta"]) or {}).get("fama", 0.0) + degrau(r))
                           for r in respostas])
    elif cat["fonte_peso"] == "visitas":
        # menos visitas = mais nichado; sem artigo conta como zero visita
        ordem = percentis([-visitas.get(r["resposta"], 0) for r in respostas])
    else:
        ordem = percentis([r["icf"] for r in respostas])

    for r, p in zip(respostas, ordem):
        if cat["fonte_peso"] == "agente":
            medida = fama_agente.get(r["resposta"]) or {}
            r["lembranca"] = medida.get("lembranca_em_1000")
            r["conhecem"] = medida.get("conhecem_pct")
            r["visitas"] = medida.get("visitas_pt_12m") or 0
            peso = p
        elif cat["fonte_peso"] == "visitas":
            r["visitas"] = visitas.get(r["resposta"], 0)
            peso = p
        else:
            global_ = (r["icf"] - base.minimo) / (base.maximo - base.minimo)
            peso = PESO_PERCENTIL * p + (1 - PESO_PERCENTIL) * global_
        ajuste = ajustes.get(normalizar(r["resposta"]), {})
        r["ajustado"] = bool((ajuste.get("peso") or "").strip())
        # com o agente, o peso manual já entrou como um dos sinais da fama (scripts/agente_fama.py)
        if r["ajustado"] and cat["fonte_peso"] != "agente":
            peso = float(ajuste["peso"]) / 100
        r["percentil"] = round(p, 3)
        r["fama"] = round(min(max(peso, 0.0), 1.0), 3)
        r["supernova_manual"] = (ajuste.get("supernova") or "").strip() == "1"

    # Posição de cada resposta na ordem da fama. Empates são desfeitos pelo ICF ou pelas
    # visitas (e depois pelo nome), para cada faixa receber exatamente a sua cota:
    # empatar tudo no meio deixava faixas mais raras com mais respostas que as comuns.
    agente = cat["fonte_peso"] == "agente"
    ordenadas = sorted(respostas, key=lambda r: (-degrau(r) if agente else 0, r["fama"], r["percentil"],
                                                 normalizar(r["resposta"])))
    n = len(ordenadas)
    faixas = cotas(n)
    if agente:
        degraus = [degrau(r) for r in respostas]
        faixas = cotas_com_teto(n, [sum(d >= 3 - k for d in degraus) for k in range(3)])
    for i, r in enumerate(ordenadas):
        r["pontos"] = na_regua(i, n, faixas)
        r["peso"] = round((r["pontos"] / 100) ** (1 / CURVA), 3)
    if metodo_da_fama(cat["id"]) == "simulacao":
        cat["metodo"] = "simulacao"
        # régua fixa: óbvia, comum e incomum pela contagem; a cauda (rara) se espalha de 60 a 90
        # na ordem da fama, como antes
        raras = []
        for r in ordenadas:
            medida = fama_agente.get(r["resposta"]) or {}
            r["lembranca"] = medida.get("lembranca_em_1000", 0.0)
            r["acima"] = medida.get("acima", 0.0)
            p = pontos_fixos(r["lembranca"])
            if p is None:
                raras.append(r)
            else:
                r["pontos"] = p
        for i, r in enumerate(raras):
            k = i / (len(raras) - 1) if len(raras) > 1 else 0.5
            r["pontos"] = round(RARA[0] + (RARA[1] - RARA[0]) * k)
        for r in ordenadas:
            # resposta criativa (associação lateral, "~" na simulação): a sacada vale no mínimo isto
            if (fama_agente.get(r["resposta"]) or {}).get("criativa"):
                r["pontos"] = max(r["pontos"], PONTOS_CRIATIVA)
            r["peso"] = round((r["pontos"] / 100) ** (1 / CURVA), 3)

    marcadas = [r for r in respostas if r["supernova_manual"]]
    if cat["fonte_peso"] == "agente":
        # rara de lembrar, mas que muita gente reconhece ao ver: a graça da supernova
        candidatas = sorted((r for r in respostas if r["pontos"] >= REGUA[-1][3]),
                            key=lambda r: (-(r["conhecem"] or 0), -(r["lembranca"] or 0), -r["visitas"], r["resposta"]))
    elif cat["fonte_peso"] == "visitas":
        # pela visita, a de mais pontos é quase sempre uma que ninguém conhece (zero visita).
        # A supernova deve ser rara mas possível: a mais visitada entre as que valem 50 ou mais.
        candidatas = sorted((r for r in respostas if r["pontos"] >= REGUA[-1][3]), key=lambda r: -r["visitas"])
    else:
        candidatas = sorted(respostas, key=lambda r: -r["pontos"])
    supernova = (marcadas or candidatas or respostas)[0]
    cat["supernova"] = supernova["resposta"]
    # O jogo dobra os pontos da supernova: 50 vira 100, acima de qualquer outra resposta.
    supernova["pontos"] = SUPERNOVA_PONTOS
    supernova["peso"] = round((SUPERNOVA_PONTOS / 100) ** (1 / CURVA), 3)
    respostas.sort(key=lambda r: (r["pontos"], r["resposta"]))
    for r in respostas:
        del r["supernova_manual"]
    return cat


def salvar(cat: dict) -> None:
    (SAIDA / "revisao").mkdir(parents=True, exist_ok=True)
    (SAIDA / f"{cat['id']}.json").write_text(
        json.dumps(cat, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    campos = ["resposta", "apelidos", "icf", "sem_dado", "percentil", "fama", "peso", "pontos", "ajustado"]
    if cat["fonte_peso"] == "visitas":
        campos.insert(4, "visitas")
    if cat["fonte_peso"] == "agente":
        campos[4:4] = ["lembranca", "conhecem", "visitas"]
    with (SAIDA / "revisao" / f"{cat['id']}.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        for r in cat["respostas"]:
            w.writerow({**{k: r[k] for k in campos}, "apelidos": " | ".join(r["apelidos"])})


def main() -> None:
    base = BaseICF()
    escolhidas = sys.argv[1:]
    fora = fora_do_jogo()
    arquivos = [a for a in sorted(CATEGORIAS.glob("*.txt")) if a.stem not in fora]
    for velho in fora:  # tira o que já tinha saído para o jogo
        for caminho in (SAIDA / f"{velho}.json", SAIDA / "revisao" / f"{velho}.csv"):
            caminho.unlink(missing_ok=True)
    if escolhidas:
        arquivos = [a for a in arquivos if a.stem in escolhidas]
    for arquivo in arquivos:
        cat = pontuar(arquivo, base)
        salvar(cat)
        sem = sum(r["sem_dado"] for r in cat["respostas"])
        print(f"{cat['id']}: {len(cat['respostas'])} respostas, {sem} sem dado, peso por {cat['fonte_peso']},"
              f" supernova = {cat['supernova']}")

    indice = []
    for j in sorted(SAIDA.glob("*.json")):
        if j.name == "indice.json":
            continue
        dados = json.loads(j.read_text(encoding="utf-8"))
        indice.append({"id": dados["id"], "titulo": dados["titulo"], "pergunta": dados["pergunta"]})
    (SAIDA / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # atualiza jogo/dados.js e jogar.html com os pesos novos
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import montar_jogo

    montar_jogo.main()


if __name__ == "__main__":
    main()
