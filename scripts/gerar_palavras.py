"""Gera as categorias de palavras (palavras-em-ao, palavras-com-z, palavras-com-x) a partir do léxico pt-BR.

Uso: python3 scripts/gerar_palavras.py   (precisa de ./scripts/baixar_dados.sh antes)
Depois: python3 scripts/fama.py palavras-em-ao palavras-com-z palavras-com-x --completar
"""
import re, sys
from pathlib import Path
R = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
B = R/'dados/brutos/pt-br'
lex=[l.strip() for l in open(B/'lexico',encoding='utf-8') if l.strip()]
S=set(lex)
conj=set(l.strip() for l in open(B/'conjugações',encoding='utf-8'))
verbs=set(l.strip() for l in open(B/'listas/verbos',encoding='utf-8'))
icf={}
for l in open(B/'icf',encoding='utf-8'):
    w,_,v=l.strip().rpartition(',')
    try: icf[w]=float(v)
    except ValueError: pass
# fora: sexo, drogas, palavrão, ofensa
RUIM = re.compile(r"(sex|porn|puta|putar|buceta|caralh|piroc|tesã|tesao|xoxot|xana$|xereca|xibiu|xavasc|"
    r"cocaín|maconh|heroín|crack|bêbad|bebedeir|cachaç|droga|zoofil|pedof|estupr|cuzã|fod[ae]|merd|"
    r"bunda|peid|bost|cagã|mijã|viad|bicha|sapatã|macacã|crioul|negrã|xibungo|chibung|bichon|"
    r"suicid|nazis|holocaus|xota|xoroca|cabrã|ladrã|bundã|safadã|rabã|putã|tetã|peitã|pirocã|"
    r"pintã|bolã|chupã|mamã$|rolã$|xochota|xibio)")
FLEX = re.compile(r'(mos|ram|rem|ste|stes|sse|ssem|va|vam|ria|riam|rei|ndo|ou|ei|am|em|as|es|ais|eis|ia|iam|rão|rá)$')
def ok(w):
    return (w.isalpha() and w.islower() and len(w)>=2 and not RUIM.search(w)
            and not (w.endswith('s') and (w[:-1] in S or w[:-2] in S))
            and (w in verbs or w not in conj or not FLEX.search(w)))
CATS = {
 'palavras-em-ao': ('Palavras terminadas em -ão', 'Cite uma palavra que termina em "-ão"', lambda w: w.endswith('ão')),
 'palavras-com-z': ('Palavras com Z no começo', 'Cite uma palavra que começa com Z', lambda w: w.startswith('z')),
 'palavras-com-x': ('Palavras com X no começo', 'Cite uma palavra que começa com X', lambda w: w.startswith('x')),
}
for cid,(tit,perg,f) in CATS.items():
    import unicodedata
    def chave(w): return ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')
    melhor = {}
    for w in (w for w in lex if ok(w) and f(w)):
        k = chave(w)
        # entre grafias que só diferem no acento, fica a mais usada (menor ICF)
        if k not in melhor or (icf.get(w, 99), w) < (icf.get(melhor[k], 99), melhor[k]):
            melhor[k] = w
    ws = sorted(melhor.values(), key=lambda w: (icf.get(w, 99), w))
    linhas=[f"# titulo: {tit}", f"# pergunta: {perg}",
            '# formato: uma resposta por linha; apelidos separados por " | "',
            "# fonte: léxico pt-BR (fserb/pt-br), sem formas conjugadas nem plurais; ordem por frequência (ICF)"]
    linhas+= [w[0].upper()+w[1:] for w in ws]
    (R/'dados/categorias'/f'{cid}.txt').write_text("\n".join(linhas)+"\n",encoding='utf-8')
    print(cid,len(ws))
