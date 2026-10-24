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
       todas as faixas do jogo: uns 25% óbvias, 35% comuns, 25% incomuns e 15% raras.
       O peso de antes fica salvo em "fama", para revisão.
    pontos ("anos-luz") = max(1, round(100 * peso ** CURVA))
    A curva faz as respostas óbvias valerem quase nada, como no Krillion.
    Exceção: se mais da metade das respostas não está na base (nomes próprios) e a
    categoria tem visitas da Wikipédia (dados/sinais/wikidata/<cat>.json), a ordem
    vem das visitas: a mais visitada é a mais óbvia, a menos visitada a mais rara.

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
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ICF_ARQUIVO = RAIZ / "dados" / "brutos" / "pt-br" / "icf"
CATEGORIAS = RAIZ / "dados" / "categorias"
AJUSTES = RAIZ / "dados" / "ajustes"
SAIDA = RAIZ / "dados" / "pesos"
SINAIS_WIKIDATA = RAIZ / "dados" / "sinais" / "wikidata"

PESO_PERCENTIL = 0.7
SUPERNOVA_FOLGA = 10  # a supernova (já dobrada) vale ao menos a maior resposta + isto
FORA_DO_JOGO = RAIZ / "dados" / "fora_do_jogo.txt"
# (percentil dentro da categoria, peso). Os pontos de corte das faixas do jogo
# (jogo/cena.js) são 5, 20 e 50 pontos, ou seja, peso 0,224, 0,447 e 0,707.
REGUA = [(0.0, 0.10), (0.25, 0.2236), (0.60, 0.4473), (0.85, 0.7072), (1.0, 0.95)]
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


def na_regua(p: float) -> float:
    """Interpolação linear do percentil na RÉGUA."""
    for (p0, v0), (p1, v1) in zip(REGUA, REGUA[1:]):
        if p <= p1:
            return v0 + (v1 - v0) * (p - p0) / (p1 - p0)
    return REGUA[-1][1]


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
    if cat["fonte_peso"] == "visitas":
        # menos visitas = mais nichado; sem artigo conta como zero visita
        ordem = percentis([-visitas.get(r["resposta"], 0) for r in respostas])
    else:
        ordem = percentis([r["icf"] for r in respostas])

    for r, p in zip(respostas, ordem):
        if cat["fonte_peso"] == "visitas":
            r["visitas"] = visitas.get(r["resposta"], 0)
            peso = p
        else:
            global_ = (r["icf"] - base.minimo) / (base.maximo - base.minimo)
            peso = PESO_PERCENTIL * p + (1 - PESO_PERCENTIL) * global_
        ajuste = ajustes.get(normalizar(r["resposta"]), {})
        r["ajustado"] = bool((ajuste.get("peso") or "").strip())
        if r["ajustado"]:
            peso = float(ajuste["peso"]) / 100
        r["percentil"] = round(p, 3)
        r["fama"] = round(min(max(peso, 0.0), 1.0), 3)
        r["supernova_manual"] = (ajuste.get("supernova") or "").strip() == "1"

    for r, p in zip(respostas, percentis([r["fama"] for r in respostas])):
        r["peso"] = round(na_regua(p), 3)
        r["pontos"] = max(1, round(100 * r["peso"] ** CURVA))

    marcadas = [r for r in respostas if r["supernova_manual"]]
    if cat["fonte_peso"] == "visitas":
        # pela visita, a de mais pontos é quase sempre uma que ninguém conhece (zero visita).
        # A supernova deve ser rara mas possível: a mais visitada entre as que valem 50 ou mais.
        candidatas = sorted((r for r in respostas if r["pontos"] >= 50), key=lambda r: -r["visitas"])
    else:
        candidatas = sorted(respostas, key=lambda r: -r["pontos"])
    supernova = (marcadas or candidatas or respostas)[0]
    cat["supernova"] = supernova["resposta"]
    # O jogo dobra os pontos da supernova. Ela tem que valer mais que qualquer outra
    # resposta da categoria: dobrada, fica pelo menos SUPERNOVA_FOLGA acima da maior.
    maior = max((r["pontos"] for r in respostas if r is not supernova), default=0)
    minimo = -(-(maior + SUPERNOVA_FOLGA) // 2)
    if supernova["pontos"] < minimo:
        supernova["pontos"] = minimo
        supernova["peso"] = round((minimo / 100) ** (1 / CURVA), 3)
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
