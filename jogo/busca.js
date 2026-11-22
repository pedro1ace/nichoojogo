// Busca das respostas: normalização, autocorreção e as formas da mesma resposta.
// Roda no navegador (script comum, antes do jogo.js) e no servidor: o scripts/montar_jogo.py copia
// este arquivo para servidor/busca.js com um "export" no fim, para o /api/conferir achar as respostas
// escondidas de quem não está logado com a mesma regra do jogo. Edite só aqui.
// ---------- texto e autocorreção ----------

// Mesma regra de scripts/pontuar.py: minúsculas, sem acento, hífen vira espaço.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Tira artigos do começo ("o Acre", "a Lua") e espaços, para comparar.
function compactar(texto) {
  return normalizar(texto).replace(/^(o|a|os|as|um|uma) /, "").replaceAll(" ", "");
}

// Distância de edição com troca de letras vizinhas: quantas letras faltam,
// sobram, estão erradas ou trocadas de lugar ("eroupa" -> "europa" = 1).
// Com "teto", para de contar assim que passa dele (devolve teto + 1): a busca
// só quer saber das palavras bem parecidas, e isso deixa a digitação leve.
function distancia(a, b, teto = Infinity) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let menorDaLinha = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      if (d[i][j] < menorDaLinha) menorDaLinha = d[i][j];
    }
    // a troca de vizinhas olha duas linhas para trás, então só desiste com duas linhas acima do teto
    if (menorDaLinha > teto && i > 1 && Math.min(...d[i - 1].slice(1)) > teto) return teto + 1;
  }
  return d[a.length][b.length];
}

// Quantos erros de digitação a correção aceita, pelo tamanho do que foi digitado.
// Bem rígido de propósito: corrigir para uma palavra que o jogador não quis dizer
// (às vezes uma mais nichada!) é pior do que pedir para ele digitar de novo.
// Até 3 letras: só a palavra exata. 4 a 7: 1 erro. 8 a 11: 2 erros. 12 ou mais: 3.
// (Com 4 letras, o erro tem que ser letra errada ou trocada: "gatp" -> "gato".)
function tolerancia(tamanho) {
  if (tamanho <= 3) return 0;
  if (tamanho <= 7) return 1;
  if (tamanho <= 11) return 2;
  return 3;
}

// ---------- formas da mesma resposta ----------
// Mesma regra de scripts/casar.py (chave_solta). Se mudar aqui, mude lá.
// Plural, "de/do/e/com/na/em" no meio e a palavra do tema na frente não mudam a resposta:
// "Leões" = Leão, "arco flecha" = "Arco e flecha", "constelação de Órion" = Órion.
const CONECTORES = new Set([
  "de", "do", "da", "dos", "das", "d", "e", "com", "ao", "aos", "a", "o", "os", "as",
  "em", "no", "na", "nos", "nas", "num", "numa", "um", "uma", "pra", "pro", "para", "por", "pelo", "pela",
]);
// Categorias em que a forma conta (5 letras do Termo): aí só vale a grafia exata.
const SEM_FORMAS = new Set(["palavras-do-termo"]);

// Palavras do tema que o jogador põe antes da resposta (só são tiradas do que ele digitou).
const ENFEITES = {
  "luas-do-sistema-solar": ["lua", "satelite natural", "satelite"],
  "planetas-e-planetas-anoes": ["planeta anao", "planeta"],
  "corpos-do-sistema-solar": ["planeta anao", "planeta", "cometa", "asteroide"],
  constelacoes: ["constelacao"],
  estrelas: ["estrela"],
  "estados-do-brasil": ["estado"],
  "capitais-do-brasil": ["cidade", "capital"],
  "capitais-do-mundo": ["cidade", "capital"],
  "cidades-do-brasil": ["cidade", "municipio"],
  "cidades-do-mundo": ["cidade"],
  paises: ["pais", "republica", "reino"],
  "paises-acima-do-equador": ["pais", "republica", "reino"],
  idiomas: ["lingua", "idioma", "dialeto"],
  "racas-de-cachorro": ["cachorro", "cao", "raca"],
  queijos: ["queijo"],
  "times-de-futebol": ["time", "clube", "esporte clube"],
  "jogos-de-videogame": ["jogo"],
  brincadeiras: ["jogo", "brincadeira"],
  "missoes-espaciais": ["missao", "programa"],
  "ritmos-musicais": ["ritmo", "estilo"],
  "elementos-quimicos": ["elemento"],
  "marcas-de-carro": ["marca", "carro"],
  estadios: ["estadio"],
};

// Palavra do tema que fica no começo do nome da lista e o jogador pula ("Queijo minas" -> "minas").
const PREFIXOS_DA_LISTA = {
  queijos: ["queijo"],
  "racas-de-cachorro": ["cao", "raca"],
  "missoes-espaciais": ["programa", "missao"],
  brincadeiras: ["jogo"],
  "jogos-de-videogame": ["jogo"],
  estadios: ["estadio municipal doutor", "estadio municipal", "estadio olimpico", "estadio doutor", "estadio dr", "estadio"],
};

// Tira o plural (e o "e" final, dos dois lados): "leoes" = "leao", "flores" = "flor", "tigres" = "tigre".
function radical(p) {
  if (p.length <= 3) return p;
  if (/(oes|aes|aos)$/.test(p)) p = p.slice(0, -3) + "ao";
  else if (p.length > 4 && /(ais|eis|ois|uis)$/.test(p)) p = p.slice(0, -2) + "l";
  else if (p.endsWith("ns")) p = p.slice(0, -2) + "m";
  else if (p.endsWith("s")) p = p.slice(0, -1);
  if (p.length > 3 && p.endsWith("e")) p = p.slice(0, -1);
  return p;
}

function palavrasSoltas(texto) {
  const todas = normalizar(texto.replaceAll("&", " e ")).split(" ").filter(Boolean);
  const sem = todas.filter((p) => !CONECTORES.has(p));
  return sem.length ? sem : todas;
}

function tirarDaFrente(palavras, enfeites) {
  for (const e of enfeites || []) {
    const partes = e.split(" ");
    if (palavras.length > partes.length && partes.every((p, i) => palavras[i] === p)) return palavras.slice(partes.length);
  }
  return null;
}

// As chaves "soltas" de um texto: a forma inteira e, se houver, a forma sem a palavra do tema.
function chavesSoltas(texto, enfeites) {
  const palavras = palavrasSoltas(texto);
  const chaves = [palavras.map(radical).join("")];
  const sem = tirarDaFrente(palavras, enfeites);
  if (sem) chaves.push(sem.map(radical).join(""));
  return chaves;
}

// Como a palavra soa: grafias que se leem igual viram a mesma chave ("xinelo" = "chinelo",
// "kuzco" = "cuzco", "krill" = "kril", "nosses" = "nozes", "oracio" = "Horácio", "mikey" = "Mickey").
function som(t) {
  return t
    .replace(/^h/, "")
    .replace(/ph/g, "f")
    .replace(/[cs]h/g, "x")
    .replace(/lh/g, "li")
    .replace(/nh/g, "ni")
    .replace(/qu(?=[ei])/g, "k")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/c(?=[ei])/g, "s")
    .replace(/g(?=[ei])/g, "j")
    .replace(/[kq]/g, "c")
    .replace(/y/g, "i")
    .replace(/w/g, "u")
    .replace(/z/g, "s")
    .replace(/m$/, "n")
    .replace(/(.)\1+/g, "$1");
}

// Teclas vizinhas no teclado, para a 1ª letra errada por escorregar o dedo ("purico" -> "ouriço").
const VIZINHAS = (() => {
  const linhas = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const pos = {};
  linhas.forEach((l, y) => [...l].forEach((c, x) => (pos[c] = [x + y * 0.5, y])));
  return (a, b) => {
    const p = pos[a], q = pos[b];
    return !!p && !!q && a !== b && Math.abs(p[1] - q[1]) <= 1 && Math.abs(p[0] - q[0]) <= 1;
  };
})();

// Quem erra a digitação quase nunca erra a 1ª letra. Se a 1ª letra muda, é outra
// palavra ("Pateta" não é "Cametá", "ninho" não é "Vinho"). Passa só quando:
// as duas primeiras trocaram de lugar ("rbasil"), soam igual ("xinelo", "kuzco"),
// ou, em palavra de 6 letras ou mais, a 1ª letra sumiu ou sobrou ("scargot", "rvore", "overboard").
// A 1ª letra trocada por uma vizinha do teclado ("purico", "farrer") é vista em buscar(), que
// só deixa quando esse é o único erro.
function mesmoComeco(a, b) {
  if (a[0] === b[0] || (a[0] === b[1] && a[1] === b[0])) return true;
  const sa = som(a), sb = som(b);
  if (sa[0] === sb[0]) return true;
  if (a.length >= 6 || b.length >= 6) {
    if (b.slice(1, 3) === a.slice(0, 2) || a.slice(1, 3) === b.slice(0, 2)) return true;
  }
  return false;
}

// Erros entre duas chaves, contando os de som pela metade: "xinelo" e "chinelo" ficam a 0,5
// (é a mesma palavra, mas não é a grafia exata, então o jogo pergunta antes).
// "merlim" = "Merlin" também: o "m" final soa como "n".
function erros(a, b, teto) {
  const crua = distancia(a, b, teto);
  if (crua <= 1) return crua;
  const pelaVoz = distancia(som(a), som(b), teto) + 0.5;
  return Math.min(crua, pelaVoz);
}
function errosComSom(a, b, sa, sb, teto) {
  const crua = distancia(a, b, teto);
  if (crua === 0) return 0;
  return Math.min(crua, (sa === sb ? 0 : distancia(sa, sb, teto)) + 0.5);
}

// Uma palavra digitada bate com uma da lista? (mesma raiz, ou erro de digitação do tamanho dela)
// "folga" deixa uma palavra de 5 letras ou mais ter 1 erro a mais.
// (só entre palavras do mesmo tamanho: "rpero" = "preto", mas "russa" não é "rua").
function palavraBate(p, q, folga = 0) {
  if (p === q || radical(p) === radical(q)) return true;
  // 1ª letra trocada pela vizinha do teclado, e só esse erro ("barco a notor")
  // ou a 1ª letra da palavra sumiu ("caiaque uplo")
  if (!mesmoComeco(p, q)) return p.length >= 4 && ((VIZINHAS(p[0], q[0]) && p.slice(1) === q.slice(1)) || p === q.slice(1));
  const extra = p.length >= 5 && p.length === q.length ? folga : 0;
  return erros(p, q, 3) <= Math.max(1, tolerancia(p.length)) + extra;
}

// Em respostas de várias palavras, o erro tem que estar espalhado como erro de digitação,
// e não concentrado numa palavra que virou outra ("Água Santa" não é "Água benta",
// "Mousse de limão" não é "Mousse de milho"). Cada palavra precisa começar igual e aceita
// os erros do seu próprio tamanho (pelo menos 1); uma só pode ter 1 erro a mais ("gato rpero",
// "chileno virado"). "de", "na", "em"... não contam. Se o número de palavras mudou (espaço
// esquecido), vale só a regra geral.
function palavrasBatem(texto, nome) {
  if (normalizar(texto).split(" ").length !== normalizar(nome).split(" ").length) return true;
  const a = palavrasSoltas(texto), b = palavrasSoltas(nome);
  if (a.length < 2 || a.length !== b.length) return true;
  let folgas = 0;
  for (let i = 0; i < a.length; i++) {
    if (palavraBate(a[i], b[i])) continue;
    if (folgas++ || !palavraBate(a[i], b[i], 1)) return false;
  }
  return true;
}

// Correção para uma resposta de Espaço Profundo (60 pontos ou mais) só quando o erro é o mais
// óbvio: mesma pronúncia ("oracio" -> Horácio), ou uma letra a mais, a menos ou trocada de lugar,
// sem mexer na 1ª. Uma letra trocada por outra só vale se as duas são vizinhas no teclado
// ("presenre") ou se a palavra é longa (7 letras ou mais: "comvrcial"). Antes, "careta" virava
// Capeta (89 pontos) e "gelo" virava Galo (80): o corretor nunca pode virar um atalho para a
// resposta mais nichada. "palavras" são as palavras de "a", para achar onde está a letra trocada.
const PONTOS_NICHADA = 60;
function erroSeguro(d, a, b, palavras) {
  if (d <= 0.5) return true;
  if (d !== 1 || a[0] !== b[0]) return false;
  if (a.length !== b.length) return true;
  const i = [...a].findIndex((c, k) => c !== b[k]);
  if (i < 0 || a[i + 1] === b[i]) return true; // letras vizinhas trocadas de lugar
  if (VIZINHAS(a[i], b[i])) return true;
  let fim = 0;
  for (const p of palavras) {
    fim += p.length;
    if (i < fim) return p.length >= 7;
  }
  return false;
}

// Procura a resposta. Devolve { resposta, nome, exato } ou null.
// "nome" é a grafia que casou (pode ser um apelido), para mostrar ao jogador.
// Compara a grafia, o som ("xinelo" = "chinelo") e a forma solta (sem plural e sem "de/na/em").
// A correção só acontece quando é óbvia: se duas respostas diferentes ficam igualmente
// perto do que foi digitado ("galso": Galo ou Ganso?), o jogo não escolhe por ele.
// Se a mais perto precisou de 2 erros ou mais, também não corrige quando outra resposta
// diferente está até 1 erro mais longe: a dúvida é grande demais para chutar.
// soExata: só a grafia da lista ou outra forma da mesma resposta, sem correção.
function buscar(cat, texto, soExata = false) {
  const alvo = compactar(texto);
  if (!alvo) return null;
  if (cat.mapa.has(alvo)) return { ...cat.mapa.get(alvo), exato: true };
  // mesma resposta com outra forma (plural, "de", palavra do tema): vale direto, sem perguntar
  const soltasDoTexto = chavesSoltas(texto, ENFEITES[cat.id]);
  if (cat.soltas) {
    for (const chave of soltasDoTexto) {
      const item = cat.soltas.get(chave);
      if (item) return { ...item, exato: true };
    }
    for (const chave of soltasDoTexto) {
      const item = !cat.soltas.has(chave) && cat.derivadas && cat.derivadas.get(chave);
      if (item) return { ...item, exato: true };
    }
    const proprio = cat.nomesProprios && cat.nomesProprios.get(palavrasSoltas(texto).filter((p) => !TITULOS.has(p)).join(""));
    if (proprio) return { ...proprio, exato: true };
  }
  if (soExata || !cat.formas) return null;
  // até 3 letras, só quando soa igual ("cid" -> "Sid")
  const limite = Math.max(0.5, tolerancia(alvo.length));
  const somAlvo = som(alvo);
  const palavrasDoAlvo = normalizar(texto).replace(/^(o|a|os|as|um|uma) /, "").split(" ");
  // a forma solta (sem "de/na/em" e sem plural) só entra na correção quando há mais de uma palavra:
  // numa palavra só, tirar o plural encurta demais ("menta" ficava a 1 erro de "Mentos")
  const variasPalavras = normalizar(texto).split(" ").length >= 2;
  const soltaAlvo = soltasDoTexto[0];
  const somSolta = som(soltaAlvo);
  let melhor = null;
  let menor = Infinity;
  let par = null; // as duas chaves que deram a menor distância
  let segunda = Infinity; // distância da melhor resposta *diferente* da escolhida
  for (const f of cat.formas) {
    let d = Infinity;
    const perto = Math.abs(f.chave.length - alvo.length) <= (alvo.length <= 4 ? 0 : limite);
    if (perto && mesmoComeco(alvo, f.chave)) d = errosComSom(alvo, f.chave, somAlvo, f.som, limite + 1);
    else if (f.som === somAlvo) d = 0.5;
    else if (alvo.length >= 6 && f.chave.length === alvo.length && VIZINHAS(alvo[0], f.chave[0]) && alvo.slice(1) === f.chave.slice(1)) d = 1;
    let qual = [alvo, f.chave, palavrasDoAlvo];
    if (cat.soltas && variasPalavras && d > 0.5 && Math.abs(f.solta.length - soltaAlvo.length) <= limite && mesmoComeco(soltaAlvo, f.solta)) {
      const ds = errosComSom(soltaAlvo, f.solta, somSolta, f.somSolta, limite + 1);
      if (ds < d) [d, qual] = [ds, [soltaAlvo, f.solta, palavrasSoltas(texto).map(radical)]];
    }
    if (d > limite + 1) continue;
    const item = f.item;
    if (d < menor) {
      if (melhor && melhor.resposta !== item.resposta) segunda = menor;
      menor = d;
      melhor = item;
      par = qual;
    } else if (item.resposta !== melhor.resposta && d < segunda) {
      segunda = d;
    }
  }
  if (menor > limite) return null;
  if (segunda === menor) return null; // empate entre respostas diferentes
  if (menor >= 2 && segunda <= menor + 1) return null;
  if (melhor.resposta.pontos >= PONTOS_NICHADA && !erroSeguro(menor, ...par)) return null;
  if (!palavrasBatem(texto, melhor.nome)) return null;
  return { ...melhor, exato: false };
}

// ---------- o juiz juntou a resposta com uma da lista ----------
// O juiz (functions/api/juiz.js) às vezes diz que o que foi digitado é uma resposta que a lista já
// tem. Só vale a resposta da lista, com os pontos dela, quando o jogador escreveu de fato aquilo
// (com outras palavras em volta, ou um erro que o corretor não pegou). Senão o jogador digitava
// algo vago ou diferente e ganhava os pontos de uma resposta nichada ("gaúcha" virava "Chula
// gaúcha", 86 pontos; "Megamente" virava "Megara"; "chinelo de ponta-cabeça" virava "Ferradura de
// ponta-cabeça"). Devolve:
//   "inteira": o jogador disse a resposta toda ("deixar o chinelo virado" = "Chinelo virado");
//   "parte":   disse só um pedaço dela ("estrela" = "Estrela-do-mar") ou quase toda, começando
//              igual ("passar embaixo da escada"): vale, mas com no máximo os pontos do juiz;
//   null:      as palavras não batem: é outra coisa ou um sinônimo.
function comoBate(texto, nomes, enfeites) {
  const a0 = palavrasSoltas(texto);
  const a = tirarDaFrente(a0, enfeites) || a0;
  let melhor = null;
  for (const nome of nomes) {
    const b = palavrasSoltas(nome);
    const usadas = new Set();
    let m = 0;
    for (const p of a) {
      const k = b.findIndex((q, i) => !usadas.has(i) && palavraBate(p, q));
      if (k >= 0) { usadas.add(k); m++; }
    }
    const cobreNome = usadas.size === b.length;
    const comecoIgual = a.length && b.length && palavraBate(a[0], b[0]);
    if (cobreNome && (comecoIgual || m >= 2 || m >= a.length - 1)) return "inteira";
    if (m === a.length || (m >= 2 && m >= a.length - 1 && m >= b.length - 1 && comecoIgual)) melhor = "parte";
  }
  return melhor;
}

// Sinônimo que o juiz juntou com uma resposta comum (até o topo do Letrado) vale como ela:
// "tênis de rodinha" = Patins. Com uma resposta mais rara, não: aí é pedir a revisão.
const TETO_SINONIMO = 34;

// Palavras do tema que se repetem nas respostas da lista: "pao" em "Pão australiano", "pastel"
// em "Pastel de vento", "azul" em "Olhos azuis". O jogador costuma escrever só o resto
// ("australiano", "vento", "olhos"). Vale a palavra que está no nome da categoria e abre (ou
// fecha) alguma resposta, ou a que abre (ou fecha) 1 de cada 4 respostas compostas.
// Título na frente do nome, que o jogador pula. E as listas de gente, onde vale só o nome ou só o sobrenome.
const TITULOS = new Set(["seu", "sr", "senhor", "dona", "dna", "sra", "senhora", "dom", "dr", "doutor", "doutora",
  "professor", "professora", "prof", "tio", "tia", "vovo", "vo", "rei", "rainha", "king", "queen", "mr", "mrs",
  "miss", "sir", "lady", "capitao", "captain", "general", "sargento", "cabo", "coronel", "major", "tenente",
  "princesa", "principe", "prince", "princess", "conde", "count", "lord", "mestre", "padre", "frei", "irma", "santo", "sao"]);
const SUFIXOS = new Set(["jr", "junior", "filho", "neto", "sobrinho", "segundo", "terceiro", "ii", "iii"]);
const PESSOAS = /^(personagens|atletas|jogadores|jogadoras|pilotos|poetas|escritores|cantores|cantoras|atores|atrizes|musicos|cientistas|apresentadores|astronautas|pintores|artistas|youtubers|humoristas|presidentes|herois|viloes|tenistas|lutadores|nadadores|ginastas|treinadores|tecnicos|compositores|filosofos|inventores|personalidades|famosos|celebridades|rappers|djs|influenciadores|santos|reis|rainhas|deuses|imperadores|jornalistas|modelos-famosas)(-|$)/;

function palavrasDoTema(cat) {
  const doNome = new Set(cat.id.split("-").map(radical).filter((p) => p.length >= 3 && !CONECTORES.has(p)));
  const frente = new Map();
  const fim = new Map();
  let compostas = 0;
  for (const r of cat.respostas) {
    const ps = palavrasSoltas(r.resposta).map(radical);
    if (ps.length < 2) continue;
    compostas++;
    frente.set(ps[0], (frente.get(ps[0]) || 0) + 1);
    fim.set(ps[ps.length - 1], (fim.get(ps[ps.length - 1]) || 0) + 1);
  }
  const escolher = (m) => new Set([...m]
    .filter(([p, n]) => p.length >= 3 && ((doNome.has(p) && n >= 1) || (n >= 5 && n >= compostas / 4)))
    .map(([p]) => p));
  return { frente: escolher(frente), fim: escolher(fim) };
}

// O resto de um nome sem as palavras do tema da frente e do fim (já com radical), ou null.
function semPalavrasDoTema(palavras, tema) {
  let ps = palavras.map(radical);
  const antes = ps.length;
  while (ps.length > 1 && tema.frente.has(ps[0])) ps = ps.slice(1);
  while (ps.length > 1 && tema.fim.has(ps[ps.length - 1])) ps = ps.slice(0, -1);
  return ps.length < antes ? ps : null;
}

// Monta o que a busca usa para uma pergunta: grafia -> resposta, formas soltas e a lista da correção.
function prepararCategoria(cat) {
  const mapa = new Map();
  for (const r of cat.respostas) {
    for (const nome of [r.resposta, ...r.apelidos]) mapa.set(compactar(nome), { resposta: r, nome });
  }
  // chave solta -> resposta; null quando a mesma chave serve para duas respostas (aí não adivinha)
  const soltas = new Map();
  const guardar = (chave, item) => {
    if (!chave) return;
    const ja = soltas.get(chave);
    if (ja === undefined) soltas.set(chave, item);
    else if (ja && ja.resposta !== item.resposta) soltas.set(chave, null);
  };
  for (const r of cat.respostas) {
    for (const nome of [r.resposta, ...r.apelidos]) {
      const item = { resposta: r, nome: r.resposta };
      const palavras = palavrasSoltas(nome);
      guardar(palavras.map(radical).join(""), item);
      const sem = tirarDaFrente(palavras, PREFIXOS_DA_LISTA[cat.id]);
      if (sem && sem.join("").length >= 4) guardar(sem.map(radical).join(""), item);
    }
  }
  // O nome sem a palavra do tema ("australiano" = Pão australiano, "vento" = Pastel de vento),
  // que só vale quando o que foi digitado não é a forma de outra resposta. Se a mesma forma
  // serve para duas respostas ("pipa": Corrida de pipa e Corrida de pipas; "negro": Lago Negro e
  // Mar Negro), vale a mais comum, com os pontos dela: recusar o que o jogador sabe é pior.
  const tema = palavrasDoTema(cat);
  const derivadas = new Map();
  for (const r of cat.respostas) {
    for (const nome of [r.resposta, ...r.apelidos]) {
      const item = { resposta: r, nome: r.resposta };
      const resto = semPalavrasDoTema(palavrasSoltas(nome), tema);
      const chave = resto && resto.join("");
      if (!chave || chave.length < 3 || soltas.has(chave)) continue;
      const ja = derivadas.get(chave);
      if (ja === undefined || item.resposta.pontos < ja.resposta.pontos) derivadas.set(chave, item);
    }
  }
  // Sem o título na frente ("madruga" = Seu Madruga, "clotilde" = Dona Clotilde, "falcon" = Captain
  // Falcon), em lista de gente. Ali também vale o sobrenome que só uma resposta tem ("hypolito" =
  // Diego Hypólito, "armstrong" = Neil Armstrong) e o primeiro nome que só uma resposta tem, quando
  // ela não é rara ("flavia" = Flávia Saraiva): um nome comum não pode dar os pontos de uma nichada.
  // Conta só o nome principal, sem o que vem entre parênteses ("Gary Payton (astronauta)").
  // A palavra tem de ser igual à do nome (sem radical): "matue" não vira Moduan Matus.
  const nomesProprios = new Map();
  if (PESSOAS.test(cat.id)) {
    const doNome = new Set(cat.id.split("-").map(radical));
    const usos = new Map(); // palavra -> respostas que abrem ou fecham com ela ("Ana Flávia Sanglard" não tira "flavia" de Flávia Saraiva)
    const pontas = []; // [chave, resposta, true se é o primeiro nome / "titulo" se é o nome sem o título]
    for (const r of cat.respostas) {
      const todas = palavrasSoltas(r.resposta.replace(/\([^)]*\)/g, " "));
      let ps = todas;
      while (ps.length > 1 && TITULOS.has(ps[0])) ps = ps.slice(1);
      while (ps.length > 1 && SUFIXOS.has(ps[ps.length - 1])) ps = ps.slice(0, -1);
      for (const p of new Set([ps[0], ps[ps.length - 1]])) {
        const k = radical(p);
        if (!usos.has(k)) usos.set(k, new Set());
        usos.get(k).add(r);
      }
      if (ps.length < todas.length && ps.join("").length >= 3) pontas.push([ps.join(""), r, "titulo"]);
      if (ps.length >= 2) {
        pontas.push([ps[ps.length - 1], r, false]);
        pontas.push([ps[0], r, true]);
      }
    }
    for (const [chave, r, primeiro] of pontas) {
      const k = radical(chave);
      if (chave.length < 4 || doNome.has(k) || soltas.has(k) || derivadas.has(k) || nomesProprios.has(chave)) continue;
      const u = usos.get(k);
      if (u && u.size > 1 && primeiro !== "titulo") continue;
      if (primeiro === true && r.pontos >= PONTOS_NICHADA) continue;
      nomesProprios.set(chave, { resposta: r, nome: r.resposta });
    }
  }
  // para a correção: cada grafia (nome e apelidos) com o som e a forma solta dela
  const formas = [];
  for (const [chave, item] of mapa) {
    const solta = chavesSoltas(item.nome)[0];
    formas.push({ chave, som: som(chave), solta, somSolta: som(solta), item });
  }
  const semFormas = SEM_FORMAS.has(cat.id);
  return { ...cat, mapa, formas, soltas: semFormas ? null : soltas, derivadas: semFormas ? null : derivadas, nomesProprios: semFormas ? null : nomesProprios };
}
