#!/usr/bin/env python3
"""Transforma listas prontas da base pt-BR em arquivos de categoria do jogo.

Uso: python3 scripts/importar_listas.py
Lê dados/brutos/pt-br/listas/* e escreve dados/categorias/<nome>.txt.
Só cria o arquivo se ele ainda não existir, para não apagar edições manuais.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LISTAS = RAIZ / "dados" / "brutos" / "pt-br" / "listas"
CATEGORIAS = RAIZ / "dados" / "categorias"

# arquivo da base -> (nome da categoria, título, pergunta)
IMPORTAR = {
    "paises": ("paises", "Países", "Cite um país"),
    "estados-br": ("estados-do-brasil", "Estados do Brasil", "Cite um estado brasileiro"),
}


def main() -> None:
    CATEGORIAS.mkdir(parents=True, exist_ok=True)
    for origem, (nome, titulo, pergunta) in IMPORTAR.items():
        destino = CATEGORIAS / f"{nome}.txt"
        if destino.exists():
            print(f"pulando {destino.name} (já existe)")
            continue
        itens = [l.strip() for l in (LISTAS / origem).read_text(encoding="utf-8").splitlines() if l.strip()]
        cabecalho = [
            f"# titulo: {titulo}",
            f"# pergunta: {pergunta}",
            '# formato: uma resposta por linha; apelidos separados por " | "',
        ]
        destino.write_text("\n".join(cabecalho + itens) + "\n", encoding="utf-8")
        print(f"criado {destino.name} com {len(itens)} respostas")


if __name__ == "__main__":
    main()
