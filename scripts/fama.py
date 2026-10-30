#!/usr/bin/env python3
"""Fama no contexto da pergunta: simula 1000 jogadores e conta o que eles respondem.

Por que existe: o método antigo (agente_fama.py) estimava a lembrança resposta por resposta,
olhando a lista. Isso tinha dois defeitos que voltavam todo dia:
  1. A lista cresce (importações da Wikipédia), a estimativa não é refeita, e toda resposta sem
     estimativa contava como "ninguém lembra": virava rara. Coentro em Legumes valia 90.
  2. Visitas na Wikipédia e frequência em textos medem a fama GERAL, não o quanto alguém diria
     aquilo para AQUELA pergunta. Shrek é óbvio em Filmes e raríssimo em Coisas com camadas.

O método novo:
  1. Simulação (dados/sinais/lembranca/<cat>.txt): 1000 jogadores, de idades, regiões e gostos
     variados, respondem à pergunta como no jogo (25 segundos, uma resposta), SEM ver a lista.
     A contagem de cada resposta é a fama. A soma dá 1000 (o que falta até 1000 é a cauda:
     gente que deu respostas que só uma pessoa daria).
  2. Completude: o que a simulação diz e a lista não tem é resposta faltando (Setembro em Coisas
     amarelas, Rayan nos Craques da Seleção). --completar põe na lista.
  3. Fora da simulação = rara, por definição. Os sinais antigos (visitas, frequência em textos,
     a estimativa velha do LLM) só ordenam a cauda entre si.
  4. Régua fixa (pontuar.py): os pontos saem de "quantos em 1000 diriam", com o mesmo sentido
     em toda categoria. E "acima" = a parte dos jogadores que daria uma resposta mais óbvia que
     esta: é o "melhor que X% dos jogadores" que o jogo mostra.
  5. Trava: --conferir falha se uma categoria da fila (de hoje em diante) não tem simulação, se a
     pergunta mudou depois da simulação, ou se ainda há resposta faltando.

Formato de dados/sinais/lembranca/<cat>.txt (uma resposta por linha, "nome contagem"):
    # pergunta: Cite um legume ou uma verdura      (tem que ser igual à da categoria)
    # feito_por: ...
    Alface 140
    Batata inglesa = Batata 3      ("o que o jogador digita = a resposta da lista", quando o casamento sozinho não acha)
    ! Banana 4                     (gente diz, mas não vale: conta na soma, não entra na lista)
    ~ Homer Simpson 6              (criativa: associação lateral, não um membro literal; vira rara)

Uso:
    python3 scripts/fama.py                    # todas as categorias com simulação
    python3 scripts/fama.py legumes-e-verduras
    python3 scripts/fama.py --simular cat      # gera a simulação com o Claude (precisa de ANTHROPIC_API_KEY)
    python3 scripts/fama.py --completar        # põe na lista as respostas que faltam
    python3 scripts/fama.py --conferir         # trava: falha se alguma categoria da fila não passou
Depois: python3 scripts/pontuar.py (o fama.py já chama no fim, menos com --conferir).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agente_fama  # noqa: E402
import pontuar  # noqa: E402
from pontuar import CATEGORIAS, ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
LEMBRANCA = RAIZ / "dados" / "sinais" / "lembranca"
FAMA = RAIZ / "dados" / "sinais" / "fama"
REVISAO = RAIZ / "dados" / "sinais" / "revisao"
ORDEM = RAIZ / "dados" / "ordem.txt"
INICIO = dt.date(2026, 10, 28)  # dia #1
METODO = "simulacao"
# Na cauda, ninguém passa disto (em 1000): quem não apareceu em 1000 jogadores simulados é raro.
TETO_CAUDA = 0.9
TETO_CRIATIVA = 0.5  # em 1000: resposta criativa nunca passa disto, então é sempre rara
MIN_CAUDA = 40  # em 1000: no mínimo isto fica para a cauda (respostas que só uma pessoa daria)
MODELO = "claude-opus-5-5"


# ---------- leitura da simulação ----------


def ler_simulacao(cat_id: str) -> dict | None:
    arq = LEMBRANCA / f"{cat_id}.txt"
    if not arq.exists():
        return None
    meta, itens = {}, []
    for linha in arq.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        if linha.startswith("#"):
            chave, _, valor = linha[1:].partition(":")
            meta[chave.strip()] = valor.strip()
            continue
        invalida = linha.startswith("!")
        criativa = linha.startswith("~")
        linha = linha.lstrip("!~").strip()
        m = re.match(r"^(.*?)\s+([\d.,]+)$", linha)
        if not m:
            sys.exit(f"{arq.name}: linha sem contagem: {linha!r}")
        nome, n = m.group(1).strip(), float(m.group(2).replace(",", "."))
        dito, _, alvo = nome.partition("=")
        itens.append({"dito": dito.strip(), "alvo": alvo.strip() or None, "n": n, "invalida": invalida,
                      "criativa": criativa})
    return {"meta": meta, "itens": itens}


# ---------- casamento com a lista ----------


def variantes(texto: str) -> list[str]:
    """Formas para casar o que o jogador diz com a lista: sem acento, sem artigo, singular."""
    t = normalizar(texto)
    saida = [t]
    sem_artigo = re.sub(r"^(o|a|os|as|um|uma) ", "", t)
    saida.append(sem_artigo)
    for s in list(saida):
        saida.append(" ".join(singular(p) for p in s.split()))
    for s in list(saida):
        saida.append(s.replace(" ", ""))
    return list(dict.fromkeys(saida))


def singular(palavra: str) -> str:
    if len(palavra) <= 3:
        return palavra
    for fim, troca in (("oes", "ao"), ("aes", "ao"), ("res", "r"), ("is", "l"), ("es", ""), ("s", "")):
        if palavra.endswith(fim):
            return palavra[: -len(fim)] + troca
    return palavra


# Palavra genérica no começo do nome da lista que o jogador costuma pular ("Queijo minas" -> "minas").
PREFIXOS = ("queijo de ", "queijo ", "cao de ", "cao ", "programa ", "missao ", "raca ", "jogo de ", "jogo ")


ULTIMA = "\x00ultima:"  # chave do índice pela última palavra


def indice(cat: dict) -> dict[str, str]:
    idx: dict[str, str] = {}
    for r in cat["respostas"]:
        for nome in [r["resposta"], *r["apelidos"]]:
            for v in variantes(nome):
                idx.setdefault(v, r["resposta"])
    for r in cat["respostas"]:
        for nome in [r["resposta"], *r["apelidos"]]:
            t = normalizar(nome)
            for pre in PREFIXOS:
                if t.startswith(pre) and len(t) - len(pre) >= 4:
                    for v in variantes(t[len(pre):]):
                        idx.setdefault(v, r["resposta"])
                    break
    # pela última palavra do nome principal (ver casar)
    for r in cat["respostas"]:
        partes = normalizar(r["resposta"]).split()
        if len(partes) > 1:
            chave = ULTIMA + partes[-1]
            idx[chave] = (idx[chave] + "\n" + r["resposta"]) if chave in idx else r["resposta"]
    # o nome principal vence o apelido de outra resposta
    for r in cat["respostas"]:
        idx[normalizar(r["resposta"])] = r["resposta"]
    return idx


def casar(nome: str, idx: dict[str, str]) -> str | None:
    for v in variantes(nome):
        if v in idx:
            return idx[v]
    # uma palavra só ("Messi", "Uno"): casa com a única resposta da lista que termina nela
    # ("Lionel Messi", "Fiat Uno"). O --completar põe a palavra como apelido, para o jogo aceitar.
    t = normalizar(nome)
    if " " not in t and len(t) >= 3:
        achados = idx.get(ULTIMA + t)
        if achados and len(set(achados.split("\n"))) == 1:
            return achados.split("\n")[0]
    return None


# ---------- conta ----------


def calcular(cat: dict, sim: dict, base: pontuar.BaseICF) -> tuple[dict, list[dict]]:
    """Devolve (o arquivo de fama, as respostas que a simulação deu e a lista não tem)."""
    idx = indice(cat)
    contagem: dict[str, float] = {}
    criativas: set[str] = set()
    faltando = []
    for it in sim["itens"]:
        if it["invalida"]:
            continue
        alvo = casar(it["alvo"], idx) if it["alvo"] else casar(it["dito"], idx)
        if alvo is None:
            faltando.append({"categoria": cat["id"], "resposta": it["alvo"] or it["dito"], "em_1000": it["n"]})
            continue
        if not any(v in idx for v in variantes(it["dito"])):
            # o jogador digitaria "dito", e o jogo não aceitaria: falta o apelido
            faltando.append({"categoria": cat["id"], "resposta": it["dito"], "em_1000": it["n"], "apelido_de": alvo})
        contagem[alvo] = contagem.get(alvo, 0.0) + it["n"]
        if it["criativa"]:
            criativas.add(alvo)
    soma_simulada = sum(it["n"] for it in sim["itens"])
    # Em 1000 pessoas sempre sobra uma cauda de respostas que só uma pessoa dá. Se a simulação
    # passou disso, a cabeça encolhe na mesma proporção.
    if soma_simulada > 1000.0 - MIN_CAUDA:
        fator = (1000.0 - MIN_CAUDA) / soma_simulada
        contagem = {k: v * fator for k, v in contagem.items()}
        soma_simulada = 1000.0 - MIN_CAUDA
    massa_cauda = max(0.0, 1000.0 - soma_simulada)
    # Resposta criativa (associação lateral, "~" na simulação: Homer em Coisas amarelas, Panela em
    # Instrumentos): mesmo que algumas pessoas pensem nela, é a sacada que o jogo quer premiar.
    # Fica sempre rara, logo depois das raras literais que alguém da simulação citou.
    for nome in criativas:
        contagem[nome] = min(contagem[nome], TETO_CRIATIVA)

    # A cauda: ordem pelos sinais antigos (estimativa velha do LLM, visitas, texto), que o
    # agente_fama.py já sabe juntar. Só servem para desempatar quem a simulação não citou.
    velho = agente_fama.ler_json(agente_fama.LLM / f"{cat['id']}.json") or {"itens": []}
    antigo = agente_fama.combinar(cat, velho, base)["respostas"]
    cauda = sorted((r["resposta"] for r in cat["respostas"] if r["resposta"] not in contagem),
                   key=lambda n: (-antigo.get(n, {}).get("fama", 0.0), normalizar(n)))
    menor_cabeca = min(contagem.values(), default=1.0)
    teto = min(TETO_CAUDA, menor_cabeca * 0.9)
    harmonico = sum(1 / (i + 10) for i in range(len(cauda))) or 1.0
    lembra = dict(contagem)
    for i, nome in enumerate(cauda):
        lembra[nome] = round(min(teto, massa_cauda / harmonico / (i + 10)), 4)

    # "acima": a parte dos jogadores que daria uma resposta mais óbvia que esta (empate conta metade)
    total = sum(lembra.values()) or 1.0
    ordem = sorted(lembra.items(), key=lambda kv: -kv[1])
    acima, acumulado, i = {}, 0.0, 0
    while i < len(ordem):
        j = i
        while j + 1 < len(ordem) and ordem[j + 1][1] == ordem[i][1]:
            j += 1
        grupo = sum(v for _, v in ordem[i:j + 1])
        for nome, v in ordem[i:j + 1]:
            acima[nome] = round((acumulado + (grupo - v) / 2) / total, 4)
        acumulado += grupo
        i = j + 1

    maior = math.log1p(max(lembra.values(), default=1.0))
    respostas = {}
    for r in cat["respostas"]:
        nome = r["resposta"]
        a = antigo.get(nome, {})
        na_cabeca = nome in contagem
        # fama 0..1 só para ordenar: a cabeça (0,5 a 1) sempre antes da cauda (0 a 0,5)
        fama = 0.5 + 0.5 * math.log1p(lembra[nome]) / maior if na_cabeca else 0.5 * a.get("fama", 0.0)
        respostas[nome] = {
            "fama": round(fama, 4),
            "lembranca_em_1000": round(lembra[nome], 4),
            "na_simulacao": na_cabeca,
            "criativa": nome in criativas,
            "estimada": na_cabeca,
            "acima": acima[nome],
            "conhecem_pct": a.get("conhecem_pct"),
            "visitas_pt_12m": a.get("visitas_pt_12m"),
            "fama_antiga": a.get("fama"),
        }
    fama = {
        "categoria": cat["id"],
        "metodo": METODO,
        "gerado_em": dt.date.today().isoformat(),
        "pergunta": cat["pergunta"],
        "simulados": 1000,
        "na_simulacao": len(contagem),
        "massa_da_cauda": round(massa_cauda, 1),
        "respostas": respostas,
    }
    return fama, faltando


def suspeitas(cat: dict, fama: dict) -> list[dict]:
    """Fora da simulação, mas a estimativa velha do LLM dizia que bastante gente lembra.
    Não muda nada sozinho: é a lista para conferir se a simulação esqueceu algo."""
    velho = agente_fama.ler_json(agente_fama.LLM / f"{cat['id']}.json") or {"itens": []}
    saida = []
    por_nome = {normalizar(i["resposta"]): i for i in velho.get("itens", [])}
    for nome, r in fama["respostas"].items():
        v = por_nome.get(normalizar(nome))
        if not r["na_simulacao"] and v and float(v.get("respostas_em_1000") or 0) >= 5:
            saida.append({"categoria": cat["id"], "resposta": nome, "estimativa_antiga": v["respostas_em_1000"]})
    return saida


# ---------- simular com o Claude (quando houver chave) ----------

PEDIDO = """Você calibra um jogo diário brasileiro de palavras. Cada rodada tem uma pergunta; o \
jogador tem 25 segundos para digitar UMA resposta, e quanto menos gente der a mesma resposta, mais \
pontos ganha. O público é todo brasileiro que joga no celular: de 12 a 70 anos, de todas as regiões, \
com gostos variados (futebol, novela, games, cozinha, ciência, música). Quase ninguém é especialista.

Pergunta: "{pergunta}"

Simule 1000 desses jogadores respondendo, cada um com o que vem à cabeça primeiro, e conte. \
Liste toda resposta que pelo menos 0,3 de 1000 daria, da mais dita para a menos dita, uma por \
linha, no formato "Resposta contagem" (ex.: "Alface 140"). A soma deve dar 1000 menos a cauda \
(respostas que só uma pessoa em mil daria, que você não lista). Conte apelidos e grafias da mesma \
coisa juntos. Respostas que muita gente dá mas estão erradas para a pergunta vão com "! " na frente. \
Respostas criativas, que respondem por uma associação lateral e não por ser um exemplo literal \
(Homer Simpson para "algo amarelo", panela para "instrumento musical"), vão com "~ " na frente. \
Pense em coisas atuais também (elencos, lançamentos, gente famosa de {ano}). Só as linhas, sem comentário."""


def simular(cat: dict) -> None:
    import anthropic

    cliente = anthropic.Anthropic()
    texto = PEDIDO.format(pergunta=cat["pergunta"] or cat["titulo"], ano=dt.date.today().year)
    resposta = cliente.messages.create(model=MODELO, max_tokens=8000, messages=[{"role": "user", "content": texto}])
    corpo = "".join(b.text for b in resposta.content if b.type == "text").strip()
    LEMBRANCA.mkdir(parents=True, exist_ok=True)
    cabecalho = (f"# pergunta: {cat['pergunta']}\n# feito_por: {MODELO}, simulação de 1000 jogadores\n"
                 f"# data: {dt.date.today().isoformat()}\n")
    (LEMBRANCA / f"{cat['id']}.txt").write_text(cabecalho + corpo + "\n", encoding="utf-8")


# ---------- completar a lista ----------


def completar(cat_id: str, faltando: list[dict]) -> int:
    """Respostas novas vão para o fim da lista; apelidos novos, para a linha da resposta."""
    arq = CATEGORIAS / f"{cat_id}.txt"
    linhas = arq.read_text(encoding="utf-8").rstrip("\n").split("\n")
    # Primeiro as respostas novas (sem repetir), depois os apelidos: um apelido pode ser de uma resposta nova.
    novas = list(dict.fromkeys(f["resposta"] for f in faltando if not f.get("apelido_de")))
    if novas:
        linhas += ["# entraram pela simulação de jogadores (scripts/fama.py --completar)", *novas]
    for f in faltando:
        if not f.get("apelido_de"):
            continue
        for i, linha in enumerate(linhas):
            if not linha.startswith("#") and linha.split("|")[0].strip() == f["apelido_de"]:
                linhas[i] = linha.rstrip() + " | " + f["resposta"]
                break
    arq.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return len(faltando)


# ---------- trava ----------


def fila_de_hoje_em_diante() -> list[str]:
    linhas = ORDEM.read_text(encoding="utf-8").splitlines()
    fila = [l.strip() for l in linhas if l.strip() and not l.startswith(("#", "-"))]
    fora = pontuar.fora_do_jogo()
    fila = [c for c in fila if c not in fora and (CATEGORIAS / f"{c}.txt").exists()]
    hoje = (dt.date.today() - INICIO).days
    return fila[max(0, hoje) * 7:]


def conferir(cats: list[str], base: pontuar.BaseICF) -> list[str]:
    problemas = []
    for cat_id in cats:
        cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
        sim = ler_simulacao(cat_id)
        if sim is None:
            problemas.append(f"{cat_id}: sem simulação de jogadores (dados/sinais/lembranca/{cat_id}.txt)")
            continue
        if sim["meta"].get("pergunta") != cat["pergunta"]:
            problemas.append(f"{cat_id}: a pergunta mudou depois da simulação; simule de novo")
        _, faltando = calcular(cat, sim, base)
        if faltando:
            nomes = ", ".join(f["resposta"] for f in faltando[:8])
            problemas.append(f"{cat_id}: {len(faltando)} respostas da simulação faltam na lista ({nomes})")
        fama = agente_fama.ler_json(FAMA / f"{cat_id}.json")
        if fama.get("metodo") != METODO or set(fama.get("respostas", {})) != {r["resposta"] for r in cat["respostas"]}:
            problemas.append(f"{cat_id}: a fama está velha (a lista mudou); rode scripts/fama.py {cat_id}")
    return problemas


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("categorias", nargs="*")
    p.add_argument("--simular", action="store_true", help="gera a simulação com o Claude (ANTHROPIC_API_KEY)")
    p.add_argument("--completar", action="store_true", help="põe na lista as respostas que faltam")
    p.add_argument("--conferir", action="store_true", help="falha se alguma categoria da fila não passou")
    p.add_argument("--sem-pontuar", action="store_true", help="não roda o pontuar.py no fim")
    args = p.parse_args()
    base = pontuar.BaseICF()

    if args.conferir:
        cats = args.categorias or fila_de_hoje_em_diante()
        problemas = conferir(cats, base)
        for linha in problemas:
            print("FALTA:", linha)
        print(f"{len(cats)} categorias conferidas, {len(problemas)} problemas")
        sys.exit(1 if problemas else 0)

    cats = args.categorias or sorted(a.stem for a in LEMBRANCA.glob("*.txt"))
    if args.simular:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            sys.exit("--simular precisa de ANTHROPIC_API_KEY (e pip install anthropic)")
        for cat_id in cats:
            print(f"simulando {cat_id}...")
            simular(ler_categoria(CATEGORIAS / f"{cat_id}.txt"))

    todas_faltando, todas_suspeitas = [], []
    FAMA.mkdir(parents=True, exist_ok=True)
    for cat_id in cats:
        sim = ler_simulacao(cat_id)
        if sim is None:
            print(f"{cat_id}: sem simulação, fica como estava")
            continue
        cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
        fama, faltando = calcular(cat, sim, base)
        if faltando and args.completar:
            print(f"{cat_id}: {completar(cat_id, faltando)} respostas novas na lista")
            cat = ler_categoria(CATEGORIAS / f"{cat_id}.txt")
            fama, faltando = calcular(cat, sim, base)
        (FAMA / f"{cat_id}.json").write_text(json.dumps(fama, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        todas_faltando += faltando
        todas_suspeitas += suspeitas(cat, fama)
        aviso = f", {len(faltando)} faltando na lista" if faltando else ""
        print(f"{cat_id}: {fama['na_simulacao']} respostas na simulação, cauda de {fama['massa_da_cauda']:.0f} em 1000{aviso}")

    REVISAO.mkdir(parents=True, exist_ok=True)
    for nome, linhas, campos in (("faltando.csv", todas_faltando, ["categoria", "resposta", "em_1000", "apelido_de"]),
                                 ("suspeitas.csv", todas_suspeitas, ["categoria", "resposta", "estimativa_antiga"])):
        with (REVISAO / nome).open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=campos)
            w.writeheader()
            w.writerows(linhas)
    print(f"\n{len(todas_faltando)} respostas faltando (dados/sinais/revisao/faltando.csv), "
          f"{len(todas_suspeitas)} suspeitas (dados/sinais/revisao/suspeitas.csv)")

    if not args.sem_pontuar:
        sys.argv = [sys.argv[0], *args.categorias]
        pontuar.main()


if __name__ == "__main__":
    main()
