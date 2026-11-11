"""O que o jogador digitou é de fato a resposta da lista? Igual a jogo/jogo.js (comoBate).

O juiz (functions/api/juiz.js) às vezes junta o que foi digitado com uma resposta que a lista já
tem: "estrela" vira Estrela-do-mar, mas também "gaúcha" vira Chula gaúcha e "Megamente" vira
Megara. No jogo, só vale a resposta da lista, com os pontos dela, quando o jogador escreveu de fato
aquilo ("inteira"). Por isso o plantão (scripts/plantao_automatico.py) só grava como apelido as
formas "inteiras": as outras ficam para o juiz decidir na hora, com no máximo os pontos dele.

    como_bate("deixar o chinelo virado", ["Chinelo virado"])   -> "inteira"
    como_bate("estrela", ["Estrela-do-mar"])                     -> "parte"
    como_bate("megamente", ["Megara"])                           -> None

Se mudar aqui, mude lá (som, mesmoComeco, palavraBate, comoBate).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from casar import distancia, palavras_soltas, radical, tirar_da_frente  # noqa: E402


def tolerancia(tamanho: int) -> int:
    """A do jogo (jogo/jogo.js), que é mais rígida que a do protótipo casar.py."""
    if tamanho <= 3:
        return 0
    if tamanho <= 7:
        return 1
    if tamanho <= 11:
        return 2
    return 3


def som(t: str) -> str:
    """Como a palavra soa: "xinelo" = "chinelo", "kuzco" = "cuzco", "nosses" = "nozes"."""
    t = re.sub(r"^h", "", t)
    for de, para in [(r"ph", "f"), (r"[cs]h", "x"), (r"lh", "li"), (r"nh", "ni"), (r"qu(?=[ei])", "k"),
                     (r"gu(?=[ei])", "g"), (r"c(?=[ei])", "s"), (r"g(?=[ei])", "j"), (r"[kq]", "c"),
                     (r"y", "i"), (r"w", "u"), (r"z", "s"), (r"m$", "n")]:
        t = re.sub(de, para, t)
    return re.sub(r"(.)\1+", r"\1", t)


_LINHAS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
_POS = {c: (x + y * 0.5, y) for y, linha in enumerate(_LINHAS) for x, c in enumerate(linha)}


def vizinhas(a: str, b: str) -> bool:
    p, q = _POS.get(a), _POS.get(b)
    return bool(p and q and a != b and abs(p[1] - q[1]) <= 1 and abs(p[0] - q[0]) <= 1)


def mesmo_comeco(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a[0] == b[0] or (len(a) > 1 and len(b) > 1 and a[0] == b[1] and a[1] == b[0]):
        return True
    sa, sb = som(a), som(b)
    if sa[:1] == sb[:1]:
        return True
    if len(a) >= 6 or len(b) >= 6:
        if b[1:3] == a[:2] or a[1:3] == b[:2]:
            return True
    return False


def erros(a: str, b: str) -> float:
    crua = distancia(a, b)
    if crua <= 1:
        return crua
    return min(crua, distancia(som(a), som(b)) + 0.5)


def palavra_bate(p: str, q: str, folga: int = 0) -> bool:
    if p == q or radical(p) == radical(q):
        return True
    if not mesmo_comeco(p, q):
        return len(p) >= 4 and ((vizinhas(p[0], q[0]) and p[1:] == q[1:]) or p == q[1:])
    extra = folga if len(p) >= 5 and len(p) == len(q) else 0
    return erros(p, q) <= max(1, tolerancia(len(p))) + extra


def como_bate(texto: str, nomes: list[str], enfeites=None) -> str | None:
    a0 = palavras_soltas(texto)
    a = tirar_da_frente(a0, enfeites) or a0
    melhor = None
    for nome in nomes:
        b = palavras_soltas(nome)
        usadas: set[int] = set()
        m = 0
        for p in a:
            k = next((i for i, q in enumerate(b) if i not in usadas and palavra_bate(p, q)), -1)
            if k >= 0:
                usadas.add(k)
                m += 1
        cobre_nome = len(usadas) == len(b)
        comeco_igual = bool(a and b and palavra_bate(a[0], b[0]))
        if cobre_nome and (comeco_igual or m >= 2 or m >= len(a) - 1):
            return "inteira"
        if m == len(a) or (m >= 2 and m >= len(a) - 1 and m >= len(b) - 1 and comeco_igual):
            melhor = "parte"
    return melhor


if __name__ == "__main__":
    for t, n in [("deixar o chinelo virado", "Chinelo virado"), ("estrela", "Estrela-do-mar"),
                 ("megamente", "Megara"), ("gaucha", "Chula gaúcha"),
                 ("chinelo de ponta cabeca", "Ferradura de ponta-cabeça"), ("contar antes", "Contar vantagem"),
                 ("passar embaixo da escada", "Passar debaixo da escada")]:
        print(f"{t!r} x {n!r}: {como_bate(t, [n])}")
