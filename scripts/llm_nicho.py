#!/usr/bin/env python3
"""Protótipo: pede a um LLM (Claude) uma estimativa de quão óbvia é cada resposta.

Uso:
    python3 scripts/llm_nicho.py luas-do-sistema-solar            # só mostra o pedido (não gasta nada)
    pip install anthropic && export ANTHROPIC_API_KEY=...
    python3 scripts/llm_nicho.py luas-do-sistema-solar --executar --amostras 3

A pergunta feita ao modelo é a mesma coisa que os jogadores vão medir depois:
"se 1000 brasileiros adultos jogassem esta pergunta, quantos dariam esta resposta?".
Assim o número do LLM e a contagem real dos jogadores ficam na mesma escala e dá
para comparar direto (scripts/sinais.py faz isso).

Com --amostras N, o pedido é feito N vezes e fica a mediana de cada resposta. A
dispersão entre as amostras sai no arquivo: resposta com dispersão alta é onde o
modelo está chutando, e vale revisão humana.

Saída: dados/sinais/llm/<cat>.json
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pontuar import CATEGORIAS, ler_categoria, normalizar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "dados" / "sinais" / "llm"
MODELO = "claude-opus-5-5"

INSTRUCOES = """Você ajuda a calibrar um jogo diário brasileiro de palavras. Cada rodada tem uma \
pergunta-tema; o jogador tem 25 segundos para digitar UMA resposta, e quanto menos gente der a \
mesma resposta, mais pontos ele ganha. O público é o brasileiro adulto médio que joga no celular, \
não um especialista.

Para cada resposta da lista, estime:
- respostas_em_1000: se 1000 desses jogadores respondessem a pergunta, quantos dariam ESTA \
resposta. A soma da lista inteira deve dar perto de 1000 (alguns erram ou deixam em branco). \
Pense no que vem à cabeça primeiro sob pressão de tempo, não em quem "conhece" o termo.
- conhecem_pct: de 0 a 100, quantos por cento reconheceriam a resposta como certa ao vê-la.
- apelidos: outras formas como um brasileiro escreveria esta mesma resposta (grafia em inglês, \
sem acento comum, abreviação, nome popular). Lista vazia se não houver.
- confusoes: respostas de OUTRA categoria ou palavras comuns que alguém poderia digitar achando \
que é esta (ex.: "Europa" o continente). Lista vazia se não houver.
- observacao: uma frase curta só se algo for estranho (duplo sentido, termo que só existe em \
inglês, resposta que não deveria estar na lista). Vazio caso contrário.

Responda só com o JSON pedido. Use a grafia da resposta exatamente como veio na lista."""

ESQUEMA = {
    "type": "object",
    "properties": {
        "itens": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "resposta": {"type": "string"},
                    "respostas_em_1000": {"type": "number"},
                    "conhecem_pct": {"type": "number"},
                    "apelidos": {"type": "array", "items": {"type": "string"}},
                    "confusoes": {"type": "array", "items": {"type": "string"}},
                    "observacao": {"type": "string"},
                },
                "required": ["resposta", "respostas_em_1000", "conhecem_pct", "apelidos", "confusoes", "observacao"],
                "additionalProperties": False,
            },
        },
        "faltando": {
            "type": "array",
            "items": {"type": "string"},
            "description": "respostas certas e plausíveis que não estão na lista",
        },
    },
    "required": ["itens", "faltando"],
    "additionalProperties": False,
}


def montar_pedido(cat: dict) -> str:
    linhas = [f"Pergunta: {cat['pergunta'] or cat['titulo']}", "", "Respostas aceitas:"]
    for r in cat["respostas"]:
        extra = f"  (também aceita: {', '.join(r['apelidos'])})" if r["apelidos"] else ""
        linhas.append(f"- {r['resposta']}{extra}")
    return "\n".join(linhas)


def perguntar(cliente, pedido: str) -> dict:
    # fallbacks="default": se o modelo recusar por engano, a API tenta outro modelo sozinha
    resposta = cliente.beta.messages.create(
        model=MODELO,
        max_tokens=16000,
        system=INSTRUCOES,
        messages=[{"role": "user", "content": pedido}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": ESQUEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if resposta.stop_reason == "refusal":
        raise RuntimeError("o modelo recusou o pedido")
    if resposta.stop_reason == "max_tokens":
        raise RuntimeError("resposta cortada (max_tokens); divida a categoria em partes")
    texto = next(b.text for b in resposta.content if b.type == "text")
    return json.loads(texto)


def juntar_amostras(cat: dict, amostras: list[dict]) -> dict:
    por_nome: dict[str, list[dict]] = {}
    for a in amostras:
        for item in a["itens"]:
            por_nome.setdefault(normalizar(item["resposta"]), []).append(item)
    itens = []
    for r in cat["respostas"]:
        lista = por_nome.get(normalizar(r["resposta"]), [])
        if not lista:
            continue
        valores = [i["respostas_em_1000"] for i in lista]
        itens.append({
            "resposta": r["resposta"],
            "respostas_em_1000": statistics.median(valores),
            "dispersao": round(max(valores) - min(valores), 1),
            "conhecem_pct": statistics.median(i["conhecem_pct"] for i in lista),
            "apelidos": sorted({a for i in lista for a in i["apelidos"]}),
            "confusoes": sorted({c for i in lista for c in i["confusoes"]}),
            "observacao": " / ".join(sorted({i["observacao"] for i in lista if i["observacao"]})),
        })
    faltando = sorted({f for a in amostras for f in a["faltando"]})
    return {"modelo": MODELO, "amostras": len(amostras), "itens": itens, "faltando": faltando}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("categoria")
    p.add_argument("--executar", action="store_true", help="chama a API (sem isto, só mostra o pedido)")
    p.add_argument("--amostras", type=int, default=3)
    args = p.parse_args()

    cat = ler_categoria(CATEGORIAS / f"{args.categoria}.txt")
    pedido = montar_pedido(cat)
    if not args.executar:
        print("=== instruções ===\n" + INSTRUCOES + "\n\n=== pedido ===\n" + pedido)
        print(f"\n(nada foi enviado; use --executar para chamar {MODELO} {args.amostras} vezes)")
        return

    import anthropic

    cliente = anthropic.Anthropic()
    amostras = []
    for i in range(args.amostras):
        print(f"amostra {i + 1}/{args.amostras}...")
        amostras.append(perguntar(cliente, pedido))
    resultado = juntar_amostras(cat, amostras)
    DESTINO.mkdir(parents=True, exist_ok=True)
    destino = DESTINO / f"{args.categoria}.json"
    destino.write_text(json.dumps(resultado, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"gravado em {destino}")
    duvidosas = sorted(resultado["itens"], key=lambda i: -i["dispersao"])[:5]
    print("maior dispersão entre amostras (revise):", ", ".join(f"{i['resposta']} ±{i['dispersao']}" for i in duvidosas))
    if resultado["faltando"]:
        print("o modelo sugere incluir:", ", ".join(resultado["faltando"]))


if __name__ == "__main__":
    main()
