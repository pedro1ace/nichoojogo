#!/usr/bin/env python3
"""Protótipo: casar o que o jogador digitou com uma resposta da categoria.

Uso:
    python3 scripts/casar.py luas-do-sistema-solar "phobos" "a lua europa" "ganimede"
    python3 scripts/casar.py --avaliar      # mede acertos e casamentos errados

Camadas, da mais segura para a menos segura (para na primeira que achar):
    1. exato        igual a uma resposta ou apelido, sem acento, artigo ou espaço
    1b. forma       igual depois de tirar plural, "de/do/e/com" e a palavra do tema
                    (o jogo também faz, e aceita direto: ver chaves_soltas)
    2. enfeite      igual depois de tirar palavras do tema ("planeta Marte",
                    "constelação de Órion", "estado do Acre")
    3. início       primeira palavra de um nome composto ("Cruzeiro" -> Cruzeiro do Sul);
                    se servir para mais de uma ("Cão"), volta como ambígua para perguntar
    4. som          igual pela chave fonética ("Fobos" = "Phobos", "Titan" ~ "Titã")
    5. digitação    poucas letras de diferença, MAS só se a melhor opção for única
                    (nada de empate entre duas respostas) e se o que foi digitado
                    não for outra palavra comum do português (o problema "sea donkey":
                    "lira" não pode virar "Lua" só porque está perto; "Macapá" não pode
                    virar "Amapá", porque Macapá é outro nome conhecido)
Se nada casar, a resposta volta como "nao_achada" e deve ir para a fila de revisão
(LLM + humano), que decide se é apelido novo, resposta nova ou erro do jogador.

O jogo (jogo/jogo.js) hoje faz as camadas 1, 1b e 5, sem as travas da 5.
--avaliar compara as duas versões com erros de digitação gerados e com respostas
de outras categorias, que não deveriam casar.
"""
from __future__ import annotations

import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import CATEGORIAS, ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
LEXICO = RAIZ / "dados" / "brutos" / "pt-br" / "lexico"

ARTIGOS = re.compile(r"^(o|a|os|as|um|uma) ")
# Palavras que o jogador costuma pôr antes da resposta. Por categoria, porque
# "lua" é enfeite em luas mas é a própria resposta em outras perguntas.
ENFEITES = {
    "luas-do-sistema-solar": ["lua", "satelite", "satelite natural"],
    "planetas-e-planetas-anoes": ["planeta", "planeta anao"],
    "constelacoes": ["constelacao", "constelacao de", "constelacao do", "constelacao da"],
    "estrelas": ["estrela"],
    "estados-do-brasil": ["estado", "estado de", "estado do", "estado da"],
    "capitais-do-brasil": ["cidade", "cidade de", "capital"],
    "paises": ["pais", "republica", "republica de", "republica do", "reino", "reino de", "reino do"],
}


def compactar(texto: str) -> str:
    """Igual ao jogo: sem acento, sem artigo no começo, sem espaço."""
    return ARTIGOS.sub("", normalizar(texto)).replace(" ", "")


# ---------- formas da mesma resposta (igual a jogo/jogo.js: chavesSoltas) ----------
# Plural, "de/do/e/com" no meio e a palavra do tema na frente não mudam a resposta.
# O jogo aceita direto (sem perguntar) quando a chave solta serve para uma resposta só.
CONECTORES = {"de", "do", "da", "dos", "das", "d", "e", "com", "ao", "aos", "a", "o", "os", "as"}
# Categorias em que a forma conta (5 letras do Termo): aí só vale a grafia exata.
SEM_FORMAS = {"palavras-do-termo"}
ENFEITES_SOLTOS = {
    "luas-do-sistema-solar": ["lua", "satelite natural", "satelite"],
    "planetas-e-planetas-anoes": ["planeta anao", "planeta"],
    "corpos-do-sistema-solar": ["planeta anao", "planeta", "cometa", "asteroide"],
    "constelacoes": ["constelacao"],
    "estrelas": ["estrela"],
    "estados-do-brasil": ["estado"],
    "capitais-do-brasil": ["cidade", "capital"],
    "capitais-do-mundo": ["cidade", "capital"],
    "cidades-do-brasil": ["cidade", "municipio"],
    "cidades-do-mundo": ["cidade"],
    "paises": ["pais", "republica", "reino"],
    "paises-acima-do-equador": ["pais", "republica", "reino"],
    "idiomas": ["lingua", "idioma", "dialeto"],
    "racas-de-cachorro": ["cachorro", "cao", "raca"],
    "queijos": ["queijo"],
    "times-de-futebol": ["time", "clube", "esporte clube"],
    "jogos-de-videogame": ["jogo"],
    "brincadeiras": ["jogo", "brincadeira"],
    "missoes-espaciais": ["missao", "programa"],
    "ritmos-musicais": ["ritmo", "estilo"],
    "elementos-quimicos": ["elemento"],
    "marcas-de-carro": ["marca", "carro"],
}
PREFIXOS_DA_LISTA = {
    "queijos": ["queijo"],
    "racas-de-cachorro": ["cao", "raca"],
    "missoes-espaciais": ["programa", "missao"],
    "brincadeiras": ["jogo"],
    "jogos-de-videogame": ["jogo"],
}


def radical(p: str) -> str:
    """Tira o plural e o "e" final (dos dois lados): leoes = leao, flores = flor, tigres = tigre."""
    if len(p) <= 3:
        return p
    if re.search(r"(oes|aes|aos)$", p):
        p = p[:-3] + "ao"
    elif len(p) > 4 and re.search(r"(ais|eis|ois|uis)$", p):
        p = p[:-2] + "l"
    elif p.endswith("ns"):
        p = p[:-2] + "m"
    elif p.endswith("s"):
        p = p[:-1]
    if len(p) > 3 and p.endswith("e"):
        p = p[:-1]
    return p


def palavras_soltas(texto: str) -> list[str]:
    todas = normalizar(texto.replace("&", " e ")).split()
    sem = [p for p in todas if p not in CONECTORES]
    return sem or todas


def tirar_da_frente(palavras: list[str], enfeites) -> list[str] | None:
    for e in enfeites or []:
        partes = e.split()
        if len(palavras) > len(partes) and palavras[: len(partes)] == partes:
            return palavras[len(partes):]
    return None


def chaves_soltas(texto: str, cat_id: str) -> list[str]:
    palavras = palavras_soltas(texto)
    chaves = ["".join(radical(p) for p in palavras)]
    sem = tirar_da_frente(palavras, ENFEITES_SOLTOS.get(cat_id))
    if sem:
        chaves.append("".join(radical(p) for p in sem))
    return chaves


def indice_solto(cat_id: str, respostas: list[dict]) -> dict[str, str | None]:
    """chave solta -> resposta; None quando serve para duas (aí não adivinha)."""
    soltas: dict[str, str | None] = {}

    def guardar(chave: str, resposta: str) -> None:
        if not chave:
            return
        if chave not in soltas:
            soltas[chave] = resposta
        elif soltas[chave] is not None and soltas[chave] != resposta:
            soltas[chave] = None

    for r in respostas:
        for nome in [r["resposta"], *r["apelidos"]]:
            palavras = palavras_soltas(nome)
            guardar("".join(radical(p) for p in palavras), r["resposta"])
            sem = tirar_da_frente(palavras, PREFIXOS_DA_LISTA.get(cat_id))
            if sem and len("".join(sem)) >= 4:
                guardar("".join(radical(p) for p in sem), r["resposta"])
    return soltas


def casar_solto(texto: str, cat_id: str, soltas: dict[str, str | None]) -> str | None:
    if cat_id in SEM_FORMAS:
        return None
    for chave in chaves_soltas(texto, cat_id):
        if soltas.get(chave):
            return soltas[chave]
    return None


def tirar_enfeite(texto: str, cat_id: str) -> str:
    t = ARTIGOS.sub("", normalizar(texto))
    for enfeite in sorted(ENFEITES.get(cat_id, []), key=len, reverse=True):
        if t.startswith(enfeite + " "):
            t = t[len(enfeite) + 1 :]
            break
    return t.replace(" ", "")


def chave_som(texto: str) -> str:
    """Chave fonética simples para português (e nomes vindos do inglês/latim)."""
    t = compactar(texto)
    for de, para in [("ph", "f"), ("th", "t"), ("ch", "x"), ("sh", "x"), ("lh", "li"), ("nh", "ni"),
                     ("qu", "k"), ("gu", "g"), ("y", "i"), ("w", "v"), ("ck", "k"), ("c", "k"),
                     ("ss", "s"), ("z", "s"), ("h", "")]:
        t = t.replace(de, para)
    t = re.sub(r"(.)\1+", r"\1", t)          # letras dobradas
    t = re.sub(r"[eo]$", "", t)               # Titã/Titan, Caronte/Charon: final mudo
    t = re.sub(r"n$|m$", "", t)               # Titan -> tita, Oberon -> obero
    return t


def distancia(a: str, b: str) -> int:
    """Damerau-Levenshtein restrita, igual a jogo/jogo.js."""
    d = [[i] + [0] * len(b) for i in range(len(a) + 1)]
    for j in range(1, len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            custo = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def tolerancia(tamanho: int) -> int:
    if tamanho <= 3:
        return 0
    if tamanho <= 5:
        return 1
    if tamanho <= 9:
        return 2
    return 3


class Lexico:
    """Palavras comuns do português. Se o jogador digitou uma delas, não é erro de digitação."""

    def __init__(self) -> None:
        self.palavras: set[str] = set()
        if LEXICO.exists():
            self.palavras = {compactar(l) for l in LEXICO.read_text(encoding="utf-8").splitlines() if l.strip()}

    def adicionar(self, nomes) -> None:
        """Junta nomes próprios conhecidos (o "gazetteer"). No protótipo são as respostas
        de todas as categorias; em produção, todos os rótulos pt do Wikidata."""
        self.palavras.update(compactar(n) for n in nomes)

    def tem(self, compacto: str) -> bool:
        return compacto in self.palavras


class Categoria:
    def __init__(self, cat_id: str, lexico: Lexico) -> None:
        self.id = cat_id
        self.lexico = lexico
        cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
        self.exato: dict[str, str] = {}
        self.som: dict[str, set[str]] = {}
        for r in cat["respostas"]:
            for nome in [r["resposta"], *r["apelidos"]]:
                self.exato[compactar(nome)] = r["resposta"]
                self.som.setdefault(chave_som(nome), set()).add(r["resposta"])
        self.respostas = [r["resposta"] for r in cat["respostas"]]
        self.nomes = cat["respostas"]
        self.soltas = indice_solto(cat_id, cat["respostas"])

    def casar(self, texto: str) -> tuple[str | None, str]:
        """Devolve (resposta, camada): exato, enfeite, inicio, som, digitacao, ambigua ou nao_achada."""
        alvo = compactar(texto)
        if not alvo:
            return None, "nao_achada"
        if alvo in self.exato:
            return self.exato[alvo], "exato"
        solta = casar_solto(texto, self.id, self.soltas)
        if solta:
            return solta, "forma"
        sem_enfeite = tirar_enfeite(texto, self.id)
        if sem_enfeite in self.exato:
            return self.exato[sem_enfeite], "enfeite"
        som = self.som.get(chave_som(sem_enfeite), set())
        if len(som) == 1:
            return next(iter(som)), "som"
        if len(som) > 1:
            return None, "ambigua"
        # começo de um nome composto: "cão" -> Cão Maior ou Cão Menor?
        if len(sem_enfeite) >= 3:
            inicio = {r for c, r in self.exato.items() if c.startswith(sem_enfeite) and c != sem_enfeite
                      and any(compactar(p) == sem_enfeite for p in r.split()[:1])}
            if len(inicio) == 1:
                return next(iter(inicio)), "inicio"
            if len(inicio) > 1:
                return None, "ambigua"

        limite = tolerancia(len(sem_enfeite))
        # palavra comum que não é resposta: só aceita erro de 1 letra, e em palavra longa
        if self.lexico.tem(sem_enfeite):
            limite = 1 if len(sem_enfeite) >= 7 else 0
        if limite == 0:
            return None, "nao_achada"
        por_resposta: dict[str, int] = {}
        for chave, resposta in self.exato.items():
            if abs(len(chave) - len(sem_enfeite)) > limite:
                continue
            d = distancia(sem_enfeite, chave)
            if d < por_resposta.get(resposta, 99):
                por_resposta[resposta] = d
        if not por_resposta:
            return None, "nao_achada"
        ordem = sorted(por_resposta.items(), key=lambda kv: kv[1])
        melhor, d = ordem[0]
        if d > limite:
            return None, "nao_achada"
        if len(ordem) > 1 and ordem[1][1] == d:
            return None, "ambigua"  # empate: melhor perguntar do que chutar
        return melhor, "digitacao"

    def casar_como_o_jogo(self, texto: str) -> str | None:
        """Réplica do buscar() de jogo/jogo.js, para comparar."""
        alvo = compactar(texto)
        if not alvo:
            return None
        if alvo in self.exato:
            return self.exato[alvo]
        solta = casar_solto(texto, self.id, self.soltas)
        if solta:
            return solta
        limite = tolerancia(len(alvo))
        melhor, menor = None, 99
        for chave, resposta in self.exato.items():
            if abs(len(chave) - len(alvo)) > limite:
                continue
            d = distancia(alvo, chave)
            if d < menor:
                menor, melhor = d, resposta
        return melhor if menor <= limite else None


# ---------- avaliação ----------

VIZINHAS = dict(zip("qwertyuiopasdfghjklzxcvbnm", "wqrtyuiopsadfghjklzxcvbnmn"))


def erros_de_digitacao(nome: str, sorteio: random.Random) -> list[str]:
    n = normalizar(nome)
    if len(n) < 4:
        return []
    saida = []
    i = sorteio.randrange(1, len(n) - 1)
    saida.append(n[:i] + n[i + 1 :])                        # letra a menos
    saida.append(n[:i] + n[i + 1] + n[i] + n[i + 2 :])      # duas trocadas
    c = n[i]
    saida.append(n[:i] + VIZINHAS.get(c, c) + n[i + 1 :])   # tecla vizinha
    saida.append(n[:i] + n[i] + n[i:])                      # letra a mais
    return [s for s in saida if s != n]


def avaliar() -> None:
    ids = [a.stem for a in sorted(CATEGORIAS.glob("*.txt"))]
    print("Sem nomes conhecidos de fora (só o léxico comum):")
    _avaliar(ids, Lexico())
    lexico = Lexico()
    lexico.adicionar(n for i in ids for r in ler_categoria(CATEGORIAS / f"{i}.txt")["respostas"]
                     for n in [r["resposta"], *r["apelidos"]])
    print("\nCom nomes conhecidos (as respostas de todas as categorias, simulando o Wikidata):")
    _avaliar(ids, lexico)


def _avaliar(ids: list[str], lexico: Lexico) -> None:
    cats = {i: Categoria(i, lexico) for i in ids}
    sorteio = random.Random(42)
    total = {"novo": [0, 0, 0], "jogo": [0, 0, 0]}  # certo, errado, sem resposta
    falsos = {"novo": 0, "jogo": 0}
    n_neg = 0
    exemplos_jogo = []
    for cat in cats.values():
        conhecidos = {compactar(n) for r in cat.nomes for n in [r["resposta"], *r["apelidos"]]}
        # positivos: erros de digitação e enfeites em cima das respostas
        for r in cat.nomes:
            entradas = erros_de_digitacao(r["resposta"], sorteio)
            if ENFEITES.get(cat.id):
                entradas.append(f"{ENFEITES[cat.id][0]} {r['resposta']}")
            for e in entradas:
                for qual, achado in (("novo", cat.casar(e)[0]), ("jogo", cat.casar_como_o_jogo(e))):
                    if achado == r["resposta"]:
                        total[qual][0] += 1
                    elif achado is None:
                        total[qual][2] += 1
                    else:
                        total[qual][1] += 1
        # negativos: respostas de outras categorias que não são desta
        for outra in cats.values():
            if outra.id == cat.id:
                continue
            for r in outra.nomes:
                if compactar(r["resposta"]) in conhecidos:
                    continue
                n_neg += 1
                novo = cat.casar(r["resposta"])[0]
                jogo = cat.casar_como_o_jogo(r["resposta"])
                falsos["novo"] += novo is not None
                falsos["jogo"] += jogo is not None
                if jogo is not None and len(exemplos_jogo) < 12 and sorteio.random() < 0.1:
                    exemplos_jogo.append(f"{r['resposta']!r} em {cat.id} -> {jogo!r}")

    for qual in ("jogo", "novo"):
        certo, errado, nada = total[qual]
        n = certo + errado + nada
        print(f"{qual:5}: digitação/enfeite {certo / n:6.1%} certo, {errado / n:5.1%} resposta errada, "
              f"{nada / n:5.1%} sem resposta | outras categorias aceitas por engano: "
              f"{falsos[qual]}/{n_neg} ({falsos[qual] / n_neg:.1%})")
    print("\nExemplos de casamentos estranhos do jogo atual:")
    for e in exemplos_jogo:
        print("  " + e)


def main() -> None:
    if sys.argv[1:2] == ["--avaliar"]:
        avaliar()
        return
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cat = Categoria(sys.argv[1], Lexico())
    for texto in sys.argv[2:]:
        resposta, camada = cat.casar(texto)
        print(f"{texto!r:30} -> {resposta or '-':24} ({camada})")


if __name__ == "__main__":
    main()
