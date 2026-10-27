// Cena do Nicho: a viagem do foguete, da Terra até o fundo do espaço.
//
// Duas camadas:
//   - #cena: pixel art numa tela pequena, ampliada sem suavização
//     (fundo com dithering, Terra, planetas, foguete, mascote, partículas);
//   - #camada: alta resolução por cima (textos, réguas, caixinhas das palavras,
//     brilho e vinheta), para o texto ficar nítido.
//
// Unidades: a cena anda em "u" (unidade interna, PX_POR_AL pixels cada). O jogador vê
// anos-luz de verdade: a partir de 35 pontos, 1 ponto = 62 AL (abaixo disso a queda é encurtada,
// ver pontosDeQueda), então uns 420 pontos chegam aos 26.000 AL do centro da galáxia (o buraco negro):
// 7 respostas de espaço profundo (60+ cada), ou 5 delas + 1 singularidade (100) + mais uma resposta.
// O começo da viagem (u de 0 a AL_INICIAL) é a saída do Sistema Solar, na descida inicial.

// A tela (canvas) só usa uma fonte já carregada: pede as duas da caixinha da resposta logo no início,
// senão as primeiras letras acentuadas (Ô, Ã, Ç...) sairiam na fonte reserva.
if (document.fonts && document.fonts.load) {
  for (const f of ["20px 'Nicho Pixel'", "20px 'Press Start 2P'"]) document.fonts.load(f, "AÔÇ").catch(() => {});
}

const AL_POR_PONTO = 62; // anos-luz de verdade por ponto
const U_POR_PONTO = 32; // unidades da cena por ponto: 16 px de queda por ponto
const AL_POR_U = AL_POR_PONTO / U_POR_PONTO;
// Quanto cada resposta faz viajar, em unidades da cena. A partir de RARO (35 pts) é
// proporcional aos pontos (rara 60 a 90 = 960 a 1.440 px; supernova 100 = 1.600 px).
// Abaixo disso a queda é encurtada, para óbvia e letrado não parecerem cair demais:
// óbvia 10 pts desce ~5 pts de distância, letrado 18 ~13, 30 ~28, e em 35 emenda na reta.
const PONTOS_RETA = 35;
function pontosDeQueda(pontos) {
  if (pontos <= 0) return 0;
  return pontos >= PONTOS_RETA ? pontos : PONTOS_RETA * Math.pow(pontos / PONTOS_RETA, 1.5);
}
function viagem(pontos) {
  return pontosDeQueda(pontos) * U_POR_PONTO;
}
// A viagem começa logo abaixo da Terra: ao iniciar, o tardígrado só se ajeita um pouquinho
// (quem faz descer são as respostas). Distância e réguas contam a partir daqui (o "0").
const AL_INICIAL = 90;
// posição na cena (u) de algo a "al" anos-luz de verdade, e o contrário
const U = (al) => AL_INICIAL + al / AL_POR_U;
// uma distância de "al" anos-luz de verdade, em unidades da cena
const D = (al) => al / AL_POR_U;
const anosLuz = (u) => Math.max(0, Math.round((u - AL_INICIAL) * AL_POR_U));
// Último estágio (horizonte de eventos laranja e preto + Sagitário A*, o buraco negro do centro da galáxia)
const AL_SAGITARIO = 26000;
const PX_POR_AL = 0.5; // pixels da cena por unidade (u)
const DURACAO_DESCIDA = 2400; // ms, referência (a queda de cada resposta tem a sua duração)

// "Peso" da resposta: a óbvia é leve como uma pena, a rara é densa.
function pesoQueda(pontos, supernova) {
  return supernova ? 2 : Math.min(1, Math.max(0, pontos) / 100);
}
// Quanto tempo a caixa leva para cair: a leve plana devagar, a pesada despenca.
function duracaoQueda(pontos, supernova) {
  if (supernova) return 2600; // dá um pulinho e despenca acelerando
  return Math.round(3800 - 2000 * Math.sqrt(pesoQueda(pontos, supernova)));
}
// Curva da queda: leve = começa e termina macio (desliza); pesada = acelera até o fim
// e para de uma vez (o "baque" e o tremor vêm na chegada).
function curvaQueda(t, peso) {
  t = Math.min(1, Math.max(0, t)); // o quadro pode chegar um pouquinho antes do início
  // supernova (peso 2): um pulinho rápido para cima e já mergulha acelerando até o fundo
  if (peso > 1.5) return t < 0.08 ? -0.012 * Math.sin((Math.PI * t) / 0.08) : Math.pow((t - 0.08) / 0.92, 2.2);
  const leve = 0.5 - Math.cos(Math.PI * t) / 2;
  const pesada = Math.pow(t, 2.2);
  return leve + (pesada - leve) * Math.min(1, peso * 1.4);
}

// Faixas de raridade. "min" é em pontos da resposta.
const FAIXAS = [
  { id: "rara", min: 60, nome: "ESPAÇO PROFUNDO", cor: "#c38bff", emoji: "☄️", frase: "Quase ninguém chega tão fundo." },
  { id: "incomum", min: 35, nome: "RARO", cor: "#5fa8ff", emoji: "🪐", frase: "Poucos foram por esse caminho." },
  { id: "comum", min: 18, nome: "LETRADO", cor: "#6cf09a", emoji: "🌙", frase: "Boa, mas ainda perto de casa." },
  { id: "obvia", min: 0, nome: "ÓBVIA", cor: "#e8f0ff", emoji: "🛰️", frase: "Todo mundo pensou nessa." },
];
const SUPERNOVA = { id: "supernova", nome: "SINGULARIDADE", cor: "#ff4fd8", emoji: "🌟", frase: "Você achou a resposta escondida desta pergunta!" };

// mistura duas cores "#rrggbb" (k = 0 dá a primeira, 1 dá a segunda)
function misturarCor(a, b, k) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * k)).join(",")})`;
}

function faixaDe(pontos, supernova) {
  if (supernova) return SUPERNOVA;
  return FAIXAS.find((f) => pontos >= f.min);
}

// Pontos de cada faixa na régua de scripts/pontuar.py, para quando a pergunta não tem respostas dela.
const PONTOS_DA_REGUA = { obvia: [8, 15], comum: [18, 34], incomum: [35, 58], rara: [60, 90], supernova: [100, 100] };
// Onde começa cada raridade nesta pergunta: a linha fica na queda da resposta de MENOS pontos
// daquela faixa. Assim toda resposta passa a linha da sua raridade e para antes da linha da
// próxima. O rótulo diz quantos pontos a faixa dá (a singularidade vale o dobro).
function alvosDaPergunta(cat) {
  const respostas = (cat && cat.respostas) || [];
  const secreta = cat && respostas.find((r) => r.resposta === cat.supernova);
  const alvos = [...FAIXAS].reverse().map((f) => {
    const pts = respostas.filter((r) => r !== secreta && faixaDe(r.pontos, false) === f).map((r) => r.pontos);
    const [de, ate] = pts.length ? [Math.min(...pts), Math.max(...pts)] : PONTOS_DA_REGUA[f.id];
    return { faixa: f, pontos: de, rotulo: `${f.nome} · ${de === ate ? `+${de}` : `${de} a ${ate}`} pts` };
  });
  const sn = secreta ? secreta.pontos * 2 : PONTOS_DA_REGUA.supernova[0];
  alvos.push({ faixa: SUPERNOVA, pontos: sn, rotulo: `${SUPERNOVA.nome} · +${sn} pts` });
  return alvos.map((a) => ({ ...a, distancia: viagem(a.pontos) }));
}

// Marcos do caminho e curiosidades escritas nas laterais.
// "al" é a posição na cena (u). Os de antes de AL_INICIAL são o Sistema Solar, na descida
// inicial (só cenário, sem linha). Os outros estão nas distâncias reais ("real", em AL).
// "x" (0 a 1) é onde o corpo fica na tela; "dy" afasta um pouco o desenho na vertical;
// "direita" põe o rótulo do outro lado (para marcos próximos não se atropelarem).
const MARCOS = [
  { al: 170, nome: "LUA", corpo: "lua" },
  { al: 330, nome: "CINTURÃO DE ASTEROIDES", cinturao: true },
  { real: 444, nome: "PLÊIADES", aglomerado: { n: 9, raio: 24, cor: "190,215,255" }, x: 0.32 },
  { real: 548, nome: "BETELGEUSE", corpo: "gigante", x: 0.86, direita: true },
  { real: 1344, nome: "NEBULOSA DE ÓRION" },
  { real: 1560, nome: "GAIA BH1", corpo: "buraco", x: 0.72 },
  { real: 2300, nome: "NEBULOSA DO ANEL", anel: true },
  { real: 4100, nome: "NEBULOSA DA LAGOA" },
  { real: 6500, nome: "NEBULOSA DO CARANGUEJO", direita: true },
  { real: 7000, nome: "PILARES DA CRIAÇÃO" },
  { real: 7500, nome: "ETA CARINAE", corpo: "azul", x: 0.86, direita: true },
  { real: 17000, nome: "ÔMEGA CENTAURI" },
  { real: 22200, nome: "AGLOMERADO DE HÉRCULES", aglomerado: { n: 160, raio: 26, cor: "255,236,200" }, x: 0.25, direita: true },
  { real: AL_SAGITARIO, nome: "SAGITÁRIO A*" },
].map((m) => (m.real != null ? { ...m, al: U(m.real) } : m));
const CURIOSIDADES = [
  [40, "aqui o céu azul começa a virar preto"],
  [75, "a ISS dá 16 voltas na Terra por dia"],
  [230, "a Lua se afasta da Terra 3,8 cm por ano"],
  [U(200), "Toy Story: ao infinito e além!"],
  [U(950), "Betelgeuse pode virar supernova (amanhã ou daqui a 100 mil anos)"],
  [U(1900), "Gaia BH1 é o buraco negro mais perto da Terra que conhecemos"],
  [U(3200), "Guardiões da Galáxia: tá tocando Awesome Mix aqui"],
  [U(5300), "os Pilares da Criação viraram foto famosa do Hubble em 1995"],
  [U(5800), "o Caranguejo sobrou de uma supernova vista em 1054"],
  [U(9500), "Eta Carinae explodiu em 1843 e quase ofuscou Sirius"],
  [U(14500), "Ômega Centauri tem uns 10 milhões de estrelas"],
  [U(19500), "Interestelar: Gargântua, o buraco negro do filme"],
  [U(24000), "Sagitário A* tem 4 milhões de vezes a massa do Sol"],
  [U(27500), "nem a luz escapa de um buraco negro"],
];

// Cor do fundo por profundidade: céu claro perto da Terra, escurecendo até o preto.
const PARADAS_FUNDO = [
  // azul só colado na Terra; logo abaixo já é noite, para o texto ficar legível desde o começo
  [0, [80, 145, 225]],
  [35, [50, 100, 196]],
  [AL_INICIAL, [24, 40, 108]],
  [150, [15, 17, 48]],
  [230, [11, 9, 32]],
  // daqui para baixo escurece aos poucos: quanto mais fundo, mais preto
  [U(7000), [7, 5, 21]],
  [U(17000), [3, 3, 11]],
  [U(AL_SAGITARIO), [0, 0, 3]],
];

// ---------- utilidades ----------

// Número pseudoaleatório fixo para cada par (a, b): o cenário é sempre o mesmo.
function sorte(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 1013904223, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Ruído suave (interpolado), para manchas orgânicas como continentes e nuvens.
function ruido(x, y, semente) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = (x - xi) * (x - xi) * (3 - 2 * (x - xi));
  const v = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
  const a = sorte(xi + semente, yi);
  const b = sorte(xi + 1 + semente, yi);
  const c = sorte(xi + semente, yi + 1);
  const d = sorte(xi + 1 + semente, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const misturar = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * t);
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function corDoFundo(al) {
  if (al <= 0) return PARADAS_FUNDO[0][1];
  for (let i = 1; i < PARADAS_FUNDO.length; i++) {
    const [a0, c0] = PARADAS_FUNDO[i - 1];
    const [a1, c1] = PARADAS_FUNDO[i];
    if (al <= a1) return misturar(c0, c1, (al - a0) / (a1 - a0));
  }
  return PARADAS_FUNDO[PARADAS_FUNDO.length - 1][1];
}

// 0 perto da Terra, 1 lá no fundo: controla vinheta, brilho e estrelas.
const escuridao = (al) => Math.min(1, Math.max(0, al / 900));

function novaTela(l, a) {
  const c = document.createElement("canvas");
  c.width = l;
  c.height = a;
  return c;
}

// ---------- sprites ----------

const PALETA = {
  O: "#140f36", // contorno
  W: "#f4f4ff", w: "#b8bfe0", // casco / sombra
  R: "#ff3d6e", r: "#a81d48", // vermelho
  B: "#5fe1ff", b: "#1f6fa8", H: "#ffffff", // vidro
  G: "#7a80a0", g: "#3a3f58", // metal
  Y: "#ffd23f", y: "#e08a00", // amarelo
  P: "#ff8fc8", // bochecha
  F: "#fff3a0", f: "#ffb020", e: "#ff5a1f", // chama
};

function desenharSprite(ctx, linhas, x, y, paleta = PALETA) {
  for (let j = 0; j < linhas.length; j++) {
    for (let i = 0; i < linhas[j].length; i++) {
      const cor = paleta[linhas[j][i]];
      if (!cor) continue;
      ctx.fillStyle = cor;
      if (ctx.suave) ctx.fillRect(x + i, y + j, 1, 1);
      else ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}

const FOGUETE = [
  "......O......",
  ".....ORO.....",
  "....ORRrO....",
  "....OWWwO....",
  "...OWWWWwO...",
  "...OWWBBwO...",
  "...OWBHbwO...",
  "...OWWBBwO...",
  "...OWWWWwO...",
  "...OWWWWwO...",
  "...ORRRRrO...",
  "...OWWWWwO...",
  "..ORWWWWwRO..",
  ".ORRWWWWwRrO.",
  "ORRrOGGGOrRrO",
  "OrO.OgggO.OrO",
  "....OOOOO....",
].reverse(); // de ponta-cabeça: o foguete desce

const SATELITE = [
  "BBb.....bBB",
  "BBbO...ObBB",
  "BBbOWWWObBB",
  "BBGGWHWGGBB",
  "BBbOWwWObBB",
  "BBbO.G.ObBB",
  "BBb..O..bBB",
];

// Esfera com luz vinda de cima à esquerda, em tons com dithering e contorno.
function esfera(ctx, cx, cy, r, tons, opcoes = {}) {
  const luz = [-0.55, -0.6, 0.58];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const nx = dx / r;
      const ny = dy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let i = Math.max(0, nx * luz[0] + ny * luz[1] + nz * luz[2]);
      if (opcoes.faixas) i = Math.min(1, i * 1.05);
      if (opcoes.faixas) i *= 0.85 + 0.15 * Math.sin((dy / r) * 9 + sorte(dy, 3) * 0.6);
      if (opcoes.crateras && sorte(Math.floor((dx + 40) / 2), Math.floor((dy + 40) / 2)) > 0.86) i *= 0.7;
      const v = i * (tons.length - 1);
      let k = Math.floor(v);
      if (v - k > BAYER[((cy + dy) & 3) * 4 + ((cx + dx) & 3)]) k++;
      k = Math.min(tons.length - 1, k);
      ctx.fillStyle = d2 > (r - 1) * (r - 1) && r > 3 ? "#140f36" : tons[k];
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

function anel(ctx, cx, cy, r, cor, frente) {
  const passo = 0.6 / (r * 2);
  for (let a = 0; a < Math.PI * 2; a += passo) {
    for (let k = 1.55; k <= 2.15; k += 1 / r) {
      const x = Math.round(cx + Math.cos(a) * r * k);
      const y = Math.round(cy + Math.sin(a) * r * 0.42 * k);
      if ((y >= cy) !== frente) continue;
      const borda = k < 1.55 + 1.5 / r || k > 2.15 - 1.5 / r;
      const divisao = Math.abs(k - 1.82) < 0.6 / r;
      ctx.fillStyle = borda ? "#140f36" : divisao ? "rgba(20,15,54,0.7)" : k < 1.82 ? cor : "rgba(255,255,255,0.75)";
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// Desenha cada corpo uma vez numa tela própria (é caro para refazer a cada quadro).
function criarCorpos(fator = 1) {
  const tons = {
    lua: ["#3a3f58", "#6b7088", "#a3a8c0", "#d6daea", "#f4f6ff"],
    marte: ["#4a1408", "#8a2a12", "#c8481e", "#ee7a40", "#ffb07a"],
    jupiter: ["#4a2a18", "#8a5a3a", "#c08a5a", "#e8c9a0", "#fff0d8"],
    saturno: ["#4a3a18", "#8f7440", "#c9a85a", "#f0dc9a", "#fff6d0"],
    urano: ["#0f3a4a", "#2a7a8a", "#5ac0d0", "#a8f0f0", "#e8ffff"],
    netuno: ["#0a1450", "#1a2f9a", "#3a5ad8", "#6c8cff", "#b8c8ff"],
    plutao: ["#3a2a20", "#7d6a58", "#b89a80", "#e8d0b8", "#fff0e0"],
    estrela: ["#ff7a00", "#ffb020", "#ffd23f", "#fff3a0", "#ffffff"],
    gigante: ["#5a0a04", "#a8200c", "#e8501e", "#ff8a4a", "#ffc8a0"],
    azul: ["#2a4ac0", "#5a8aff", "#9ac0ff", "#d8e8ff", "#ffffff"],
  };
  const raio = { lua: 8, marte: 9, jupiter: 22, saturno: 15, urano: 12, netuno: 12, plutao: 5, estrela: 4, gigante: 4, azul: 3, buraco: 3 };
  const corpos = {};
  for (const nome of Object.keys(raio)) {
    const r = Math.round(raio[nome] * fator);
    const tela = novaTela(r * 6, r * 6);
    const ctx = tela.getContext("2d");
    const c = r * 3;
    if (nome === "saturno" || nome === "urano") anel(ctx, c, c, r, nome === "saturno" ? "#e8d8a8" : "#bfeaf0", false);
    if (nome === "estrela" || nome === "azul") {
      ctx.fillStyle = nome === "azul" ? "rgba(170, 205, 255, 0.3)" : "rgba(255, 210, 63, 0.25)";
      ctx.fillRect(c - r * 3, c - 1, r * 6, 3);
      ctx.fillRect(c - 1, c - r * 3, 3, r * 6);
    }
    if (nome === "buraco") {
      for (let a = 0; a < Math.PI * 2; a += 0.0015) {
        const d = r + 1 + sorte(Math.floor(a * 300), 1) * 2.5 * fator;
        ctx.fillStyle = sorte(Math.floor(a * 300), 2) > 0.5 ? "#ff9a1f" : "#ffd23f";
        ctx.fillRect(Math.round(c + Math.cos(a) * d * 1.8), Math.round(c + Math.sin(a) * d * 0.5), 1, 1);
      }
      esfera(ctx, c, c, r, ["#000000", "#000000"]);
    } else {
      esfera(ctx, c, c, r, tons[nome], { faixas: ["jupiter", "saturno", "netuno"].includes(nome), crateras: nome === "lua" || nome === "plutao" });
    }
    if (nome === "saturno" || nome === "urano") anel(ctx, c, c, r, nome === "saturno" ? "#e8d8a8" : "#bfeaf0", true);
    tela.raio = r;
    corpos[nome] = tela;
  }
  return corpos;
}

// Ícones das faixas (cartão de resultado e diário de bordo), 24x24.
function criarIcones() {
  const icones = {};
  const fazer = (id, desenhar) => {
    const t = novaTela(24, 24);
    const ctx = t.getContext("2d");
    desenhar(ctx);
    if (MONO[id]) pintarDeUmaCor(ctx, MONO[id]);
    icones[id] = t.toDataURL();
  };
  // cada faixa num tom só (escuro, médio, a cor, e um brilho claro): simples, sem confusão de cores.
  // A supernova fica colorida de propósito.
  const MONO = { obvia: "#e8f0ff", comum: "#6cf09a", incomum: "#5fa8ff", rara: "#c38bff", nada: "#ff6b81" };
  function pintarDeUmaCor(ctx, hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const mistura = (k, alvo) => c.map((v) => Math.round(v + (alvo - v) * k));
    const rampa = [c.map((v) => v * 0.32), c.map((v) => v * 0.62), c, mistura(0.55, 255)];
    const img = ctx.getImageData(0, 0, 24, 24), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const lum = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
      const k = lum < 0.3 ? 0 : lum < 0.55 ? 1 : lum < 0.82 ? 2 : 3;
      [d[i], d[i + 1], d[i + 2]] = rampa[k];
    }
    ctx.putImageData(img, 0, 0);
  }
  fazer("obvia", (ctx) => {
    // satélite grande: duas placas solares e o corpo com antena
    const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    for (const x0 of [1, 16]) {
      r(x0, 8, 7, 9, "#9aa0b0");
      for (let k = 0; k < 3; k++) r(x0 + 1 + k * 2, 9, 1, 7, "#d8dcea");
      r(x0, 8, 7, 1, "#ffffff");
    }
    r(8, 12, 8, 1, "#9aa0b0");
    r(9, 7, 6, 11, "#d8dcea");
    r(9, 7, 6, 1, "#ffffff");
    r(10, 9, 4, 3, "#ffffff");
    r(9, 16, 6, 2, "#9aa0b0");
    r(11, 3, 2, 4, "#d8dcea");
    r(10, 2, 4, 1, "#ffffff");
    r(11, 18, 2, 3, "#9aa0b0");
  });
  fazer("comum", (ctx) => esfera(ctx, 12, 12, 9, ["#3a3f58", "#6b7088", "#a3a8c0", "#d6daea", "#f4f6ff"], { crateras: true }));
  fazer("incomum", (ctx) => {
    anel(ctx, 12, 12, 6, "#ffe9a0", false);
    esfera(ctx, 12, 12, 6, ["#6a4a10", "#b8861e", "#ffd23f", "#fff0a0"], { faixas: true });
    anel(ctx, 12, 12, 6, "#ffe9a0", true);
  });
  fazer("rara", (ctx) => {
    // cometa: cauda larga que afina, cabeça brilhante embaixo
    for (let t = 0; t < 15; t++) {
      const larg = Math.max(1, Math.round(4 - t * 0.25));
      ctx.globalAlpha = 1 - t / 18;
      ctx.fillStyle = t % 4 === 1 ? "#ffffff" : "#c8c8d8";
      for (let k = -larg; k <= larg; k++) ctx.fillRect(9 + t + Math.round(k * 0.7), 13 - t + Math.round(k * 0.7), 1, 1);
    }
    ctx.globalAlpha = 1;
    esfera(ctx, 7, 16, 5, ["#606070", "#a0a0b0", "#e0e0ea", "#ffffff"]);
  });
  fazer("supernova", (ctx) => {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const tam = a % 2 ? 7 : 11;
      for (let d = 4; d < tam; d++) {
        ctx.fillStyle = d > tam - 3 ? "#ff4fd8" : "#ffd23f";
        ctx.fillRect(Math.round(12 + Math.cos(ang) * d), Math.round(12 + Math.sin(ang) * d), 1, 1);
      }
    }
    esfera(ctx, 12, 12, 4, ["#ffd23f", "#fff3a0", "#ffffff"]);
  });
  fazer("relogio", (ctx) => {
    // relógio de bolso: aro, mostrador, ponteiros e o botão de cima
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 9.4) continue;
        ctx.fillStyle = d > 8 ? "#140f36" : d > 6.8 ? (dx + dy < 0 ? "#ffe680" : "#e0a020") : dx + dy < -6 ? "#ffffff" : "#e8ecff";
        ctx.fillRect(12 + dx, 13 + dy, 1, 1);
      }
    }
    ctx.fillStyle = "#140f36";
    ctx.fillRect(11, 1, 3, 3);
    ctx.fillRect(12, 7, 1, 7); // ponteiro dos minutos
    ctx.fillRect(12, 13, 4, 1); // ponteiro das horas
    ctx.fillStyle = "#ff3d6e";
    ctx.fillRect(12, 13, 1, 1);
    for (const [x, y] of [[12, 6], [19, 13], [12, 20], [5, 13]]) {
      ctx.fillStyle = "#6b7088";
      ctx.fillRect(x, y, 1, 1);
    }
  });
  fazer("nada", (ctx) => {
    // relógio de bolso: aro, mostrador, ponteiros e o botão de cima
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > 9.4) continue;
        ctx.fillStyle = d > 8 ? "#140f36" : d > 6.8 ? (dx + dy < 0 ? "#ffe680" : "#e0a020") : dx + dy < -6 ? "#ffffff" : "#e8ecff";
        ctx.fillRect(12 + dx, 13 + dy, 1, 1);
      }
    }
    ctx.fillStyle = "#140f36";
    ctx.fillRect(11, 1, 3, 3);
    ctx.fillRect(12, 7, 1, 7); // ponteiro dos minutos
    ctx.fillRect(12, 13, 4, 1); // ponteiro das horas
    ctx.fillStyle = "#ff3d6e";
    ctx.fillRect(12, 13, 1, 1);
    for (const [x, y] of [[12, 6], [19, 13], [12, 20], [5, 13]]) {
      ctx.fillStyle = "#6b7088";
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return icones;
}

// A Terra vista de baixo, desenhada uma vez: oceano, continentes, nuvens e atmosfera.
function desenharTerra(largura, altura) {
  const tela = novaTela(largura, altura);
  const ctx = tela.getContext("2d");
  const raio = Math.max(largura, altura * 2) * 1.2;
  const cx = largura / 2;
  const cy = altura - 4 - raio;
  const oceano = ["#163a8a", "#1f52b8", "#2f6fe0", "#4a8cf0"];
  const verde = ["#1f6a34", "#2f9a4a", "#3fbf5f", "#7ad87a"];
  for (let y = 0; y < altura; y++) {
    const meia = Math.sqrt(Math.max(0, raio * raio - (y - cy) * (y - cy)));
    for (let x = Math.max(0, Math.floor(cx - meia)); x <= Math.min(largura - 1, cx + meia); x++) {
      const borda = raio - Math.hypot(x - cx, y - cy);
      const luz = Math.min(1, borda / 40); // mais escuro perto da borda
      const v = luz * 3;
      let k = Math.floor(v);
      if (v - k > BAYER[(y & 3) * 4 + (x & 3)]) k++;
      k = Math.min(3, k);
      // vista inclinada: as manchas ficam achatadas na vertical
      const terra = ruido(x / 46, y / 14, 0) * 0.62 + ruido(x / 15, y / 5, 50) * 0.28 + ruido(x / 5, y / 2, 90) * 0.1;
      const nuvem = ruido(x / 26, y / 6, 300) * 0.7 + ruido(x / 8, y / 2.5, 400) * 0.3;
      let cor = terra > 0.56 ? verde[k] : oceano[k];
      if (terra > 0.53 && terra <= 0.56) cor = k > 1 ? "#e8d8a0" : "#a89860"; // praia
      const limiar = BAYER[(y & 3) * 4 + (x & 3)] * 0.05;
      if (nuvem > 0.66 + limiar && borda > 5) cor = k > 1 ? "#ffffff" : "#c8d8f0";
      else if (nuvem > 0.62 + limiar && borda > 5) cor = k > 1 ? "#dcebff" : "#a8b8d8";
      if (borda < 1.5) cor = "#e8fbff";
      else if (borda < 3) cor = "#9fe0ff";
      ctx.fillStyle = cor;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return tela;
}

// ---------- cena ----------

function criarCena(telaPixel, telaTexto, raiz) {
  const ctx = telaPixel.getContext("2d");
  const tx = telaTexto.getContext("2d");
  const reduzirMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let corpos = criarCorpos();
  const icones = criarIcones();

  let L = 0, A = 0, escala = 2, focoY = 0, dpr = 1;
  let terra = null, imagem = null, pixels = null;

  const camera = { de: 0, para: 0, inicio: 0, atual: 0, velocidade: 0 };
  let rodadaAl = 0; // onde começou a pergunta atual (para as linhas das faixas)
  let alvos = alvosDaPergunta(null); // onde cada raridade faria parar nesta pergunta
  let mostrarLinhas = false;
  const acesas = {}; // linhas de faixa que a caixa já cruzou nesta rodada (id -> hora)
  let modoCanto = 0, alvoCanto = 0; // 1 = mascote no cantinho (digitando), 0 = ao lado da caixa
  let larguraCaixa = 200;
  let cobertas = [];
  let alfaCurio = 1;
  let digitando = false;
  let mostrandoResultado = false;
  let fimDeJogo = false; // na tela final as curiosidades somem
  const rastro = [];
  const caixas = [];
  const mascote = { x: 0, y: 0, pulo: 0, virar: 1, singular: 0 };
  // o foguete acompanha a câmera com um atraso suave (mola), ao lado da palavra
  const foguete = { al: 0, x: 0, y: 0 };
  let flash = 0;
  let dobra = 0; // supernova: as estrelas viram riscos, como num salto para a velocidade da luz
  let quadro = 0;
  let tempo = 0; // segundos: todo movimento usa o tempo, não o número do quadro
  let dt = 1 / 60;
  const cadentes = [];
  let proximaCadente = 3;
  let anterior = performance.now();
  let aoQuadro = () => {};

  function ajustarTamanho() {
    dpr = window.devicePixelRatio || 1;
    escala = Math.max(2, Math.round(Math.max(innerWidth, innerHeight * 1.6) / 330));
    L = Math.ceil(innerWidth / escala);
    A = Math.ceil(innerHeight / escala) + 2; // uma folga para o deslocamento suave
    telaPixel.width = L;
    telaPixel.height = A;
    telaPixel.style.width = `${L * escala}px`;
    telaPixel.style.height = `${A * escala}px`;
    telaTexto.width = Math.round(innerWidth * dpr);
    telaTexto.height = Math.round(innerHeight * dpr);
    focoY = Math.round(A * 0.4);
    terra = desenharTerra(L, Math.round(A * 0.6));
    // planetas grandes, em escala com a tela (parte deles fica para fora)
    corpos = criarCorpos(Math.max(1.3, Math.min(3, L / 150)));
    imagem = ctx.createImageData(L, A);
    pixels = new Uint32Array(imagem.data.buffer);
    ctx.imageSmoothingEnabled = false;
    mascote.x = L / 2 + 60;
    mascote.y = focoY;
  }
  ajustarTamanho();
  addEventListener("resize", ajustarTamanho);

  // Movimento suave: a tela de pixels só anda de pixel inteiro em pixel inteiro,
  // então desenhamos com a câmera arredondada e deslocamos a tela inteira pela
  // fração que sobrou (em CSS, sem limite de resolução). O foguete, o mascote,
  // as estrelas e os textos vão na camada de alta resolução, com posição exata.
  let cameraPx = 0; // câmera arredondada, em pixels da cena
  const naTela = (al) => focoY + al * PX_POR_AL - cameraPx; // tela de pixels
  const naTelaExata = (al) => focoY + (al - camera.atual) * PX_POR_AL; // camada alta, em pixels da cena
  const naTelaTexto = (al) => naTelaExata(al) * escala; // em pixels CSS

  // "Pincel" que desenha na camada alta usando coordenadas de pixels da cena.
  const alta = {
    suave: true,
    set fillStyle(v) { tx.fillStyle = v; },
    set globalAlpha(v) { tx.globalAlpha = v; },
    get globalAlpha() { return tx.globalAlpha; },
    fillRect(x, y, w, h) { tx.fillRect(x * escala, y * escala, w * escala, h * escala); },
  };

  function atualizarCamera(agora) {
    const t = Math.min(1, (agora - camera.inicio) / (camera.dura || DURACAO_DESCIDA));
    const nova = camera.de + (camera.para - camera.de) * (camera.peso == null ? suave(t) : curvaQueda(t, camera.peso));
    const dt = Math.max(1, agora - anterior) / 1000;
    camera.velocidade = (nova - camera.atual) / dt;
    camera.atual = nova;
    const px = camera.atual * PX_POR_AL;
    cameraPx = Math.floor(px);
    telaPixel.style.transform = `translateY(${-(px - cameraPx) * escala}px)`;
  }

  // Fundo: cada linha tem a cor da sua profundidade, misturada com a próxima faixa
  // por dithering (padrão de Bayer), o que dá o degradê "pixelado fino".
  function desenharFundo() {
    const FAIXA = 24;
    const empacotar = (c) => (255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]);
    for (let y = 0; y < A; y++) {
      const al = (cameraPx + y - focoY) / PX_POR_AL;
      const base = Math.floor(al / FAIXA) * FAIXA;
      const c0 = empacotar(corDoFundo(base));
      const c1 = empacotar(corDoFundo(base + FAIXA));
      const frac = (al - base) / FAIXA;
      const linha = y * L;
      if (al < 380) {
        // perto da Terra: degradê liso, cada linha com a cor exata
        const c = empacotar(corDoFundo(al));
        pixels.fill(c, linha, linha + L);
        continue;
      }
      const b = (y & 3) * 4;
      const padrao = [0, 1, 2, 3].map((i) => (frac > BAYER[b + i] ? c1 : c0));
      for (let x = 0; x < L; x++) pixels[linha + x] = padrao[x & 3];
    }
    desenharParedesPixel(empacotar);
    ctx.putImageData(imagem, 0, 0);
  }

  // Paredes de rocha desenhadas pixel a pixel: borda com luz, meio-tom,
  // sombra perto da beirada da tela (com dithering) e crateras.
  const CAMADAS_PAREDE = [
    { f: 0.3, largura: (c) => 0.1 + 0.14 * c, s: 200, tons: [[46, 40, 96], [24, 20, 54], [18, 14, 42], [14, 10, 32]], longe: 0.55 },
    { f: 0.55, largura: (c) => 0.07 + 0.11 * c, s: 300, tons: [[76, 64, 150], [34, 26, 74], [22, 16, 50], [14, 10, 34]] },
    { f: 1, largura: (c) => 0.035 + 0.085 * c, s: 400, tons: [[170, 150, 255], [74, 58, 140], [42, 30, 88], [18, 12, 40]] },
  ];
  function larguraParede(c, yMundo, lado, conf) {
    const n =
      0.55 * ruido(yMundo / 55, lado * 7, c.s) +
      0.3 * ruido(yMundo / 18, lado * 7 + 3, c.s + 1) +
      0.15 * ruido(yMundo / 6, lado * 7 + 5, c.s + 2);
    return L * c.largura(conf) * Math.min(1, conf * 4) * (0.35 + n * 0.9);
  }
  function naParede(x, y) {
    const conf = aperto(camera.atual);
    if (conf <= 0) return false;
    for (const c of CAMADAS_PAREDE) {
      const yMundo = Math.round(y) + Math.round(cameraPx * c.f) - focoY;
      if (x < larguraParede(c, yMundo, 0, conf) + 1 || x > L - 2 - larguraParede(c, yMundo, 1, conf)) return true;
    }
    return false;
  }
  function desenharParedesPixel(empacotar) {
    const conf = aperto(camera.atual);
    if (conf <= 0) return;
    const fundo = corDoFundo(camera.atual);
    const surgir = Math.min(1, conf * 6); // aparecem aos poucos
    for (const c of CAMADAS_PAREDE) {
      const tons = c.tons.map((t) => empacotar(misturar(fundo, t, surgir * (c.longe || (c.f < 1 ? 0.8 : 1)))));
      const desvio = Math.round(cameraPx * c.f);
      for (let y = 0; y < A; y++) {
        const yMundo = y + desvio - focoY;
        const linha = y * L;
        for (const lado of [0, 1]) {
          const w = Math.round(larguraParede(c, yMundo, lado, conf));
          if (w < 1) continue;
          // a borda de cima/baixo recebe luz quando a parede "entra" na tela
          const wAcima = larguraParede(c, yMundo - 1, lado, conf);
          const degrau = w - wAcima > 0.6;
          for (let d = 0; d < w; d++) {
            const x = lado ? L - 1 - d : d;
            const daBorda = w - 1 - d; // 0 = beirada de dentro
            let k;
            if (daBorda < 1) k = 0;
            else if (daBorda < 2 || (degrau && daBorda < 4)) k = 1;
            else {
              // do meio-tom (2) para a sombra (3) com dithering
              const t = Math.min(1, (daBorda - 2) / Math.max(3, w * 0.6));
              k = t > BAYER[(y & 3) * 4 + (x & 3)] ? 3 : 2;
              // crateras e manchas
              const cr = ruido(x / 4 + lado * 50, yMundo / 4, c.s + 9);
              if (cr > 0.78) k = 3;
              else if (cr > 0.72) k = 1;
            }
            pixels[linha + x] = tons[k];
          }
        }
      }
    }
  }

  // Raios de luz vindos da Terra, que somem conforme você se afasta.
  function desenharRaios() {
    const forca = Math.max(0, 1 - camera.atual / 600);
    if (forca <= 0) return;
    for (let i = 0; i < 5; i++) {
      const base = (sorte(i, 11) * 1.4 - 0.2) * L + Math.sin(tempo * 0.3 + i) * 6;
      const largura = 10 + sorte(i, 12) * 22;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.05 * forca})`;
      ctx.beginPath();
      ctx.moveTo(base, 0);
      ctx.lineTo(base + largura, 0);
      ctx.lineTo(base + largura - A * 0.35, A);
      ctx.lineTo(base - A * 0.35, A);
      ctx.fill();
    }
  }

  function densidadeEstrelas(al) {
    if (al < 60) return 0;
    if (al < 400) return (al - 60) / 340;
    if (al < U(9000)) return 1;
    return Math.max(0.08, 1 - (al - U(9000)) / (U(AL_SAGITARIO) - U(9000))); // espaço profundo: poucas estrelas
  }

  function desenharEstrelas() {
    const camadas = [
      { f: 0.15, cor: "#5a4fb8", n: 3 },
      { f: 0.35, cor: "#9a92ff", n: 3 },
      { f: 0.7, cor: "#ffffff", n: 2 },
    ];
    const BLOCO = 40;
    camadas.forEach((c, ci) => {
      const desvio = camera.atual * PX_POR_AL * c.f;
      const primeiro = Math.floor((desvio - focoY) / BLOCO);
      const ultimo = Math.floor((desvio - focoY + A) / BLOCO);
      const rastro = reduzirMovimento ? 0 : Math.min(dobra > 0 ? 90 : 16, (camera.velocidade * PX_POR_AL * c.f) / (dobra > 0 ? 12 : 30));
      for (let k = primeiro; k <= ultimo; k++) {
        for (let i = 0; i < c.n; i++) {
          const yMundo = k * BLOCO + sorte(k, i * 7 + ci) * BLOCO;
          if (sorte(k, i * 7 + ci + 3) > densidadeEstrelas(yMundo / (PX_POR_AL * c.f))) continue;
          const x = Math.floor(sorte(k, i * 7 + ci + 1) * L);
          const y = yMundo - desvio + focoY;
          if (naParede(x, y)) continue;
          // cintila: o brilho sobe e desce devagar, cada estrela no seu ritmo
          const ritmo = 0.6 + sorte(k, i * 7 + ci + 5) * 1.6;
          const fase = sorte(k, i * 7 + ci + 6) * 6.283;
          const pisca = 0.5 + 0.5 * Math.sin(tempo * ritmo + fase);
          alta.globalAlpha = 0.35 + 0.65 * pisca;
          alta.fillStyle = c.cor;
          alta.fillRect(x, y, 1, 1 + rastro);
          if (ci >= 1 && sorte(k, i + 77) > (ci === 2 ? 0.8 : 0.93)) {
            // estrela maior: uma cruz de luz que cresce quando ela brilha
            const braco = 1 + pisca * 2.2;
            alta.globalAlpha = 0.18 + 0.4 * pisca;
            alta.fillRect(x - braco + 0.5, y + 0.35, braco * 2, 0.3);
            alta.fillRect(x + 0.35, y - braco + 0.5, 0.3, braco * 2);
            alta.globalAlpha = 0.12 * pisca;
            alta.fillRect(x - 1, y - 1, 3, 3);
          }
        }
      }
    });
    alta.globalAlpha = 1;
  }

  // Nuvens perto da Terra, que andam devagar para o lado.
  function desenharNuvens() {
    for (let i = 0; i < 7; i++) {
      const al = 8 + sorte(i, 21) * 70;
      const y = naTelaExata(al);
      if (y < -20 || y > A + 20) continue;
      const largura = 18 + Math.floor(sorte(i, 22) * 26);
      // anda pelo tempo (não pelo quadro), com posição fracionada: desliza liso
      const andou = (performance.now() / 1000) * (2.5 + sorte(i, 24) * 3);
      const x = ((sorte(i, 23) * (L + 80) + andou) % (L + 80)) - 40;
      for (let b = 0; b < 5; b++) {
        const r = 3 + Math.floor(sorte(i, 30 + b) * 4);
        const bx = x + Math.floor((b / 4) * largura);
        const by = y - Math.floor(sorte(i, 40 + b) * 3);
        for (let dy = -r; dy <= r; dy++) {
          const meia = Math.floor(Math.sqrt(r * r - dy * dy));
          alta.fillStyle = dy > r * 0.3 ? "#d6ecff" : "#ffffff";
          alta.fillRect(bx - meia, by + dy, meia * 2 + 1, 1);
        }
      }
    }
  }

  function desenharTerraNaCena() {
    const fundo = Math.round(naTela(0)) - 34;
    if (fundo < 0) return;
    ctx.drawImage(terra, 0, fundo - terra.height);
    if (fundo > terra.height) {
      ctx.fillStyle = "#163a8a";
      ctx.fillRect(0, 0, L, fundo - terra.height);
    }
    // satélite na borda da Terra (o "barquinho" do início), no mesmo estilo dos outros
    const pz = Math.max(2, Math.round(escala * 0.5));
    const ey = (naTelaExata(0) - 40) * escala + Math.sin(tempo * 0.8) * 2;
    desenharNave(naves.satelite, L * 0.3 * escala, ey, pz, Math.sin(tempo * 0.5) * 0.06, "rgba(255, 200, 120, 0.5)");
  }

  // Paredes de rocha nas laterais: quase nada perto da Terra, e vão fechando
  // conforme você desce (o espaço fica mais apertado). Duas camadas com
  // paralaxe: a de trás anda mais devagar e é mais clara.
  function aperto(al) {
    return Math.min(1, Math.max(0, (al - 250) / (U(15000) - 250)));
  }
  // Cristais que brilham dentro da rocha da frente, lá no fundo.
  function desenharLaterais() {
    const conf = aperto(camera.atual);
    if (conf <= 0.15) return;
    const c = CAMADAS_PAREDE[2];
    const desvio = cameraPx;
    const BLOCO = 30;
    const primeiro = Math.floor((desvio - focoY) / BLOCO) - 1;
    const ultimo = Math.floor((desvio - focoY + A) / BLOCO) + 1;
    for (let k = primeiro; k <= ultimo; k++) {
      if (sorte(k, 600) > 0.35 * conf + 0.1) continue;
      const lado = sorte(k, 601) > 0.5 ? 1 : 0;
      const yMundo = k * BLOCO + sorte(k, 603) * BLOCO;
      const w = larguraParede(c, yMundo, lado, conf);
      if (w < 6) continue;
      const d = 3 + Math.floor(sorte(k, 602) * (w - 5));
      const x = lado ? L - 1 - d : d;
      const y = Math.round(yMundo - desvio + focoY) - (camera.atual * PX_POR_AL - cameraPx);
      const pulso = 0.5 + 0.5 * Math.sin(tempo * (1 + sorte(k, 604)) + k);
      const cor = sorte(k, 605) > 0.5 ? "#5fe1ff" : "#ff4fd8";
      alta.fillStyle = cor;
      alta.globalAlpha = 0.6 + 0.4 * pulso;
      alta.fillRect(x, y - 1, 1, 3);
      alta.fillRect(x - 1, y, 3, 1);
      alta.globalAlpha = 0.15 * pulso;
      alta.fillRect(x - 2, y - 2, 5, 5);
    }
    alta.globalAlpha = 1;
  }

  // Poeira cósmica: pontinhos que flutuam devagar, sem parar, em várias distâncias.
  function desenharPoeira() {
    const forca = Math.min(1, Math.max(0.25, camera.atual / 300));
    const BLOCO = 50;
    for (const [ci, f] of [0.3, 0.6, 1.2].entries()) {
      const desvio = camera.atual * PX_POR_AL * f;
      const primeiro = Math.floor((desvio - focoY) / BLOCO) - 1;
      const ultimo = Math.floor((desvio - focoY + A) / BLOCO) + 1;
      for (let k = primeiro; k <= ultimo; k++) {
        for (let i = 0; i < 3; i++) {
          const sem = i * 13 + ci * 101;
          const vx = (sorte(k, sem + 1) - 0.5) * 6;
          const x = ((sorte(k, sem + 2) * L + tempo * vx + Math.sin(tempo * 0.4 + sem) * 6) % L + L) % L;
          const y = k * BLOCO + sorte(k, sem + 3) * BLOCO - desvio + focoY + Math.sin(tempo * 0.3 + k + i) * 5;
          const tam = 0.5 + ci * 0.35;
          alta.globalAlpha = forca * (0.06 + 0.08 * ci) * (0.6 + 0.4 * Math.sin(tempo + sem));
          alta.fillStyle = camera.atual < 200 ? "#ffffff" : ci === 2 ? "#cfe8ff" : "#9a92ff";
          alta.fillRect(x, y, tam, tam);
        }
      }
    }
    alta.globalAlpha = 1;
  }

  // Estrelas cadentes que atravessam o fundo bem devagar, de vez em quando.
  function desenharCadentes() {
    if (camera.atual > 120 && !reduzirMovimento) {
      proximaCadente -= dt;
      if (proximaCadente <= 0) {
        proximaCadente = 4 + Math.random() * 6;
        const esquerda = Math.random() > 0.5;
        cadentes.push({
          x: esquerda ? Math.random() * innerWidth * 0.4 : innerWidth * (0.6 + Math.random() * 0.4),
          y: Math.random() * innerHeight * 0.4,
          vx: (esquerda ? 1 : -1) * (70 + Math.random() * 50),
          vy: 30 + Math.random() * 30,
          vida: 0,
          dura: 2.5 + Math.random() * 1.5,
        });
      }
    }
    for (let i = cadentes.length - 1; i >= 0; i--) {
      const c = cadentes[i];
      c.vida += dt;
      if (c.vida > c.dura) {
        cadentes.splice(i, 1);
        continue;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const a = Math.sin((c.vida / c.dura) * Math.PI); // aparece e some suave
      const v = Math.hypot(c.vx, c.vy);
      const cauda = 90;
      const ux = c.vx / v, uy = c.vy / v;
      const g = tx.createLinearGradient(c.x, c.y, c.x - ux * cauda, c.y - uy * cauda);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * a})`);
      g.addColorStop(0.3, `rgba(170, 220, 255, ${0.35 * a})`);
      g.addColorStop(1, "rgba(120, 140, 255, 0)");
      tx.strokeStyle = g;
      tx.lineWidth = 1.6;
      tx.lineCap = "round";
      tx.beginPath();
      tx.moveTo(c.x, c.y);
      tx.lineTo(c.x - ux * cauda, c.y - uy * cauda);
      tx.stroke();
      tx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`;
      tx.beginPath();
      tx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      tx.fill();
    }
  }

  // Planetas grandes, desenhados na camada alta: ficam por cima das paredes
  // e andam com a câmera sem degrau. A imagem é ampliada sem borrar o pixel.
  function desenharCorpos() {
    tx.imageSmoothingEnabled = false;
    for (const m of MARCOS) {
      if (!m.corpo) continue;
      const img = corpos[m.corpo];
      const y = naTelaExata(m.al) + (m.dy || 0);
      if (y < -img.height || y > A + img.height) continue;
      const x = posicaoCorpo(img, m) - img.width / 2;
      tx.drawImage(img, x * escala, (y - img.height / 2) * escala, img.width * escala, img.height * escala);
    }
  }

  // A Estação Espacial Internacional (ISS) cruzando devagar perto da Terra.
  // Vai mais rápido que as nuvens e é desenhada por cima delas, para não sumir atrás.
  function desenharISS() {
    const img = naves.iss;
    const pz = Math.max(2, Math.round(escala * 0.5));
    const w = img.width * pz, h = img.height * pz;
    const y = naTelaTexto(62);
    if (y < -h || y > innerHeight + h) return;
    const x = ((tempo * 7 * escala) % (innerWidth + w * 2)) - w;
    desenharNave(img, x, y + Math.sin(tempo * 0.7) * 3, pz, Math.sin(tempo * 0.4) * 0.04, "rgba(220, 235, 255, 0.55)");
    // luzinha piscando na ponta
    tx.globalAlpha = Math.max(0, Math.sin(tempo * 4));
    tx.fillStyle = "#ff3d6e";
    tx.fillRect(x - pz / 2, y + Math.sin(tempo * 0.7) * 3 - h / 2 + pz * 3, pz, pz);
    tx.globalAlpha = 1;
  }

  // Desenha uma nave pronta (satélite, ISS) nítida, com um brilho leve em volta.
  function desenharNave(img, x, y, pz, giro, brilho) {
    tx.save();
    // atrás de um painel (pergunta, resultado) ela fica bem apagadinha
    if (cobertas.some(([a, b]) => y > a - 20 && y < b + 20)) tx.globalAlpha = 0.18;
    tx.imageSmoothingEnabled = false;
    tx.translate(x, y);
    tx.rotate(giro);
    tx.shadowColor = brilho;
    tx.shadowBlur = pz * 4;
    tx.drawImage(img, (-img.width / 2) * pz, (-img.height / 2) * pz, img.width * pz, img.height * pz);
    tx.restore();
  }

  // Brilho de atmosfera em volta dos planetas grandes.
  function desenharHalos() {
    for (const m of MARCOS) {
      if (!m.corpo) continue;
      const img = corpos[m.corpo];
      const y = naTelaTexto(m.al) + (m.dy || 0) * escala;
      const r = img.raio * escala;
      if (y < -r * 3 || y > innerHeight + r * 3) continue;
      const x = posicaoCorpo(img, m) * escala;
      const brilha = ["estrela", "azul", "gigante"].includes(m.corpo);
      const cor = { buraco: "255,154,31", estrela: "255,210,63", azul: "170,205,255", gigante: "255,110,60" }[m.corpo] || "160,200,255";
      const g = tx.createRadialGradient(x, y, r * 0.9, x, y, r * (brilha ? 3 : 1.6));
      g.addColorStop(0, `rgba(${cor},${brilha ? 0.35 : 0.18})`);
      g.addColorStop(1, `rgba(${cor},0)`);
      tx.fillStyle = g;
      tx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
  }
  const posicaoCorpo = (img, m) => (m && m.x != null ? L * m.x : L - img.raio * 0.75);

  function desenharAsteroide(x, y, tamanho, semente) {
    const tons = ["#2a2230", "#4a3f48", "#7a6a68", "#a89888"];
    for (let dy = -tamanho; dy <= tamanho; dy++) {
      for (let dx = -tamanho; dx <= tamanho; dx++) {
        if (dx * dx + dy * dy > tamanho * tamanho + sorte(semente + dx, dy) * 3) continue;
        const k = dx + dy < -1 ? 3 : dx + dy < 1 ? 2 : dx + dy < tamanho ? 1 : 0;
        ctx.fillStyle = tons[k];
        ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1, 1);
      }
    }
  }

  // Objetos soltos: satélites perto da Terra, asteroides, cometas mais fundo.
  function desenharObjetos() {
    const BLOCO = 90;
    const desvio = cameraPx;
    const primeiro = Math.max(1, Math.floor((desvio - focoY - 30) / BLOCO));
    const ultimo = Math.floor((desvio - focoY + A + 30) / BLOCO);
    for (let k = primeiro; k <= ultimo; k++) {
      if (sorte(k, 501) > 0.5) continue;
      const yMundo = k * BLOCO + sorte(k, 502) * BLOCO;
      const al = yMundo / PX_POR_AL;
      let x = sorte(k, 503) * L;
      if (Math.abs(x - L / 2) < 40) x += x < L / 2 ? -50 : 50;
      const y = yMundo - desvio + focoY;
      if (al < 300) {
        const pz = Math.max(2, Math.round(escala * 0.5));
        const yt = (yMundo - camera.atual * PX_POR_AL + focoY) * escala;
        desenharNave(naves.satelite, x * escala, yt, pz, Math.sin(tempo * 0.5 + k) * 0.12, "rgba(255, 200, 120, 0.5)");
      }
      else if (al < AL_INICIAL) { if (sorte(k, 504) > 0.25) desenharAsteroide(x, y, 1 + Math.floor(sorte(k, 505) * 3), k); }
      else if (sorte(k, 506) < 0.6) continue; // fora do Sistema Solar: só um cometa de vez em quando
      else {
        ctx.fillStyle = "#e8fbff";
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        for (let t = 1; t < 14; t++) {
          ctx.fillStyle = `rgba(160, 220, 255, ${0.5 - t * 0.035})`;
          ctx.fillRect(Math.round(x) + t, Math.round(y) - t, 1, 1);
        }
      }
    }
  }

  function desenharMarcosPixel() {
    for (const m of MARCOS) {
      const y = Math.round(naTela(m.al));
      if (y < (m.pilares ? -A : -200) || y > A + (m.pilares ? A : 200)) continue;
      if (m.cinturao) {
        for (let i = 0; i < 40; i++) {
          desenharAsteroide(sorte(m.al, i) * L, y + (sorte(m.al, i + 50) - 0.5) * 30, Math.floor(sorte(m.al, i + 99) * 3), i);
        }
      }
      if (m.voyager) {
        // a sonda mais distante já lançada, girando devagar, com a antena virada para a Terra
        const pz = Math.max(2, Math.round(escala * 0.5));
        desenharNave(naves.voyager, L * 0.26 * escala, naTelaTexto(m.al) + 30, pz, -0.25 + Math.sin(tempo * 0.2) * 0.08, "rgba(210, 225, 255, 0.5)");
      }
      if (m.aglomerado) desenharAglomerado(innerWidth * m.x, naTelaTexto(m.al), m.aglomerado, Math.round(m.al));
      if (m.anel) {
        // nebulosa planetária: um anel de gás em volta de uma estrelinha
        const x = innerWidth * 0.8, y = naTelaTexto(m.al), r = 14 * escala * 0.6;
        tx.save();
        tx.globalCompositeOperation = "lighter";
        const g = tx.createRadialGradient(x, y, r * 0.35, x, y, r * 1.25);
        g.addColorStop(0, "rgba(80, 200, 255, 0.05)");
        g.addColorStop(0.6, "rgba(90, 230, 210, 0.5)");
        g.addColorStop(0.85, "rgba(255, 110, 90, 0.45)");
        g.addColorStop(1, "rgba(255, 90, 80, 0)");
        tx.fillStyle = g;
        tx.beginPath(); tx.ellipse(x, y, r * 1.25, r, 0.4, 0, Math.PI * 2); tx.fill();
        tx.fillStyle = "#fff"; tx.fillRect(x - 1, y - 1, 2, 2);
        tx.restore();
      }
    }
  }

  // Aglomerado de estrelas: pontinhos brilhantes juntos numa bola (fixos, com cintilar leve).
  function desenharAglomerado(x, y, { n, raio, cor }, semente, escalaExtra = 1) {
    const r = raio * escala * 0.6 * escalaExtra;
    if (y < -r * 2 || y > innerHeight + r * 2) return;
    tx.save();
    tx.globalCompositeOperation = "lighter";
    const g = tx.createRadialGradient(x, y, 0, x, y, r * 1.4);
    g.addColorStop(0, `rgba(${cor},${n > 20 ? 0.3 : 0.22})`);
    g.addColorStop(1, `rgba(${cor},0)`);
    tx.fillStyle = g;
    tx.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
    for (let i = 0; i < n; i++) {
      const a = sorte(semente, i) * Math.PI * 2;
      const d = Math.pow(sorte(semente, i + 500), n > 20 ? 1.8 : 0.8) * r;
      const brilho = 0.5 + 0.5 * Math.sin(tempo * (1 + sorte(i, 9)) + i);
      const t = n > 20 ? 1 + (sorte(i, 7) > 0.85 ? 1 : 0) : 2 + Math.round(sorte(i, 7) * 2);
      tx.fillStyle = `rgba(${cor},${0.55 + 0.45 * brilho})`;
      tx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.9), t, t);
    }
    tx.restore();
  }

  // Zonas do fundo por profundidade.
  // A partir de ~5.000 AL os Pilares da Criação viram o pano de fundo da viagem:
  // grandes, no meio, misturados ao céu (somam luz, não cobrem), e sobem bem devagar.
  // Último estágio: em Sagitário A* o fundo vira horizonte de eventos (laranja e preto)
  // e um buraco negro enorme ocupa o fundo.
  const AL_NEGATIVO = U(AL_SAGITARIO);
  let negativo = false;
  function verificarNegativo() {
    const alem = camera.atual >= AL_NEGATIVO;
    if (alem === negativo) return;
    negativo = alem;
    document.body.classList.toggle("negativo", alem);
    if (alem && camera.velocidade > 0) {
      // atravessou agora: a tela distorce, treme e faz "wooon"
      document.body.classList.remove("distorcer");
      void document.body.offsetWidth;
      document.body.classList.add("distorcer");
      setTimeout(() => document.body.classList.remove("distorcer"), 900);
      tremer(16, 900);
      if (window.Som && Som.buraco) Som.buraco();
    }
  }
  function desenharBuracoNegro() {
    const surge = Math.min(1, Math.max(0, (camera.atual - (AL_NEGATIVO - 2400)) / 2400));
    if (surge <= 0) return;
    const img = naves.buraco;
    const W = innerWidth, H = innerHeight;
    // cabe entre as paredes (as bordas da imagem já somem em degradê)
    const largo = Math.min(W * 0.82, H * 1.5);
    const alto = largo * (img.height / img.width);
    tx.save();
    tx.globalAlpha = surge;
    tx.imageSmoothingEnabled = true;
    tx.translate(W / 2, H * 0.5);
    tx.rotate(-0.12 + Math.sin(tempo * 0.05) * 0.02);
    tx.drawImage(img, -largo / 2, -alto / 2, largo, alto);
    tx.restore();
  }

  // Horizonte de eventos: chegando perto de Sagitário A*, o cenário vai virando
  // laranja e preto (só o fundo; o tardígrado, as caixas, as linhas e as raridades
  // vêm depois e mantêm as cores). Uma passada por tela, por quadro.
  const temFiltro = "filter" in ctx;
  const FILTRO_HORIZONTE = "grayscale(1) sepia(1) saturate(4.5) hue-rotate(-26deg) contrast(1.2) brightness(0.9)";
  function tingirHorizonte(k) {
    if (!temFiltro) return;
    for (const c of [ctx, tx]) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.filter = FILTRO_HORIZONTE;
      c.globalAlpha = k;
      c.globalCompositeOperation = k >= 0.999 ? "copy" : "source-atop";
      c.drawImage(c.canvas, 0, 0);
      c.restore();
    }
  }
  const forcaHorizonte = () => Math.min(1, Math.max(0, (camera.atual - (AL_NEGATIVO - 900)) / 900));

  // Paisagens do fundo (antes/depois em anos-luz, para acompanhar os marcos): cada uma aparece quando você chega perto do marco dela e anda
  // bem mais devagar que a câmera (paralaxe), então fica na tela enquanto você responde
  // em vez de passar reto. Somam luz ao céu (não cobrem).
  const PAISAGENS = [
    { al: U(1344), antes: D(1125), depois: D(1560), img: "orion", alfa: 0.95, x: 0.56, tam: 1 },
    { al: U(4100), antes: D(1440), depois: D(1560), img: "orion", alfa: 0.8, x: 0.42, tam: 0.9, filtro: "hue-rotate(-38deg) saturate(1.3)", espelho: true },
    { al: U(6500), antes: D(625), depois: D(500), img: "orion", alfa: 0.75, x: 0.24, tam: 0.38, filtro: "hue-rotate(150deg) saturate(1.6)", giro: 1.2 },
    { al: U(7000), antes: D(1625), depois: D(2690), img: "pilares", alfa: 0.5, x: 0.5, tam: 1.2 },
    { al: U(17000), antes: D(2690), depois: D(2690), aglomerado: { n: 420, raio: 90, cor: "255,240,215" }, x: 0.5 },
  ];
  function desenharPaisagem(p, al, W, H) {
    const d = al - p.al;
    const surge = d < 0 ? Math.min(1, Math.max(0, (d + p.antes) / (p.antes * 0.6))) : Math.min(1, Math.max(0, (p.depois - d) / (p.depois * 0.5)));
    if (surge <= 0) return;
    const y = H * 0.5 - d * PX_POR_AL * escala * 0.07; // anda a 7% da velocidade da câmera
    if (p.aglomerado) {
      tx.save();
      tx.globalAlpha = surge;
      desenharAglomerado(W * p.x, y, p.aglomerado, Math.round(p.al), Math.max(1, Math.min(W, H) / 500));
      tx.restore();
      return;
    }
    const img = naves[p.img];
    const alto = (p.img === "pilares" ? H : Math.min(W * 0.9, H * 1.3) * (img.height / img.width)) * p.tam;
    const largo = alto * (img.width / img.height);
    tx.save();
    tx.globalCompositeOperation = "lighter";
    tx.globalAlpha = p.alfa * surge;
    tx.imageSmoothingEnabled = true;
    if (p.filtro) tx.filter = p.filtro;
    tx.translate(W * p.x, y);
    if (p.giro) tx.rotate(p.giro);
    if (p.espelho) tx.scale(-1, 1);
    tx.drawImage(img, -largo / 2, -alto / 2, largo, alto);
    tx.restore();
  }
  // Chegando ao centro da galáxia: um brilho morno cresce lá embaixo.
  function desenharNucleoGalactico(al, W, H) {
    const k = Math.min(1, Math.max(0, (al - U(19000)) / (U(AL_SAGITARIO) - U(19000))));
    if (k <= 0 || negativo) return;
    const g = tx.createRadialGradient(W / 2, H * 1.1, 0, W / 2, H * 1.1, Math.max(W, H) * 0.9);
    g.addColorStop(0, `rgba(255, 190, 120, ${0.32 * k})`);
    g.addColorStop(0.5, `rgba(255, 120, 80, ${0.12 * k})`);
    g.addColorStop(1, "rgba(255, 120, 80, 0)");
    tx.save();
    tx.globalCompositeOperation = "lighter";
    tx.fillStyle = g;
    tx.fillRect(0, 0, W, H);
    tx.restore();
  }

  function desenharPanoDeFundo() {
    const al = camera.atual;
    const W = innerWidth, H = innerHeight;
    verificarNegativo();
    for (const p of PAISAGENS) desenharPaisagem(p, al, W, H);
    desenharNucleoGalactico(al, W, H);
    desenharBuracoNegro();
  }

  // Espaço profundo: tudo fica na penumbra, menos a luz em volta da caixa que afunda.
  function desenharPenumbra() {
    // no horizonte de eventos a penumbra sai: o laranja e preto já fazem o clima
    const k = negativo ? 0 : Math.min(1, Math.max(0, (camera.atual - U(9000)) / (U(12000) - U(9000)))) * 0.65;
    if (k <= 0.01) return;
    const W = innerWidth, H = innerHeight;
    const cx = W / 2, cy = naTelaTexto(camera.atual) + 18;
    const r = Math.max(150, larguraCaixa * 0.8);
    const g = tx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 2.4);
    g.addColorStop(0, "rgba(0, 0, 4, 0)");
    g.addColorStop(0.5, `rgba(0, 0, 4, ${k * 0.55})`);
    g.addColorStop(1, `rgba(0, 0, 4, ${k})`);
    tx.fillStyle = g;
    tx.fillRect(0, 0, W, H);
    // um tiquinho de luz fria em volta da caixa, como uma lanterna
    const luz = tx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3);
    luz.addColorStop(0, `rgba(150, 160, 255, ${0.07 * k})`);
    luz.addColorStop(1, "rgba(150, 160, 255, 0)");
    tx.save();
    tx.globalCompositeOperation = "lighter";
    tx.fillStyle = luz;
    tx.fillRect(cx - r * 1.3, cy - r * 1.3, r * 2.6, r * 2.6);
    tx.restore();
  }

  // Apagão das quedas raras: por um instante tudo escurece em volta e só um círculo de luz
  // acompanha a caixa que afunda; depois de chegar, o cenário volta a clarear.
  let apagao = null; // { inicio, dura, forca }
  function desenharApagao(agora) {
    if (!apagao) return;
    const t = agora - apagao.inicio;
    const sobe = Math.min(1, t / 350);
    const desce = 1 - Math.min(1, Math.max(0, t - apagao.dura - 250) / 900);
    const k = apagao.forca * suave(sobe) * suave(desce);
    if (desce <= 0) { apagao = null; return; }
    if (k <= 0.01) return;
    const W = innerWidth, H = innerHeight;
    const cx = W / 2, cy = naTelaTexto(camera.atual) + 18;
    const r = Math.max(110, larguraCaixa * 0.72);
    // luz difusa em volta da caixa, sem borda: clareia no meio e vai escurecendo aos poucos
    const g = tx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r * 2.6);
    g.addColorStop(0, "rgba(0, 0, 6, 0)");
    g.addColorStop(0.25, `rgba(0, 0, 6, ${k * 0.12})`);
    g.addColorStop(0.5, `rgba(0, 0, 6, ${k * 0.45})`);
    g.addColorStop(0.75, `rgba(0, 0, 6, ${k * 0.8})`);
    g.addColorStop(1, `rgba(0, 0, 6, ${k})`);
    tx.fillStyle = g;
    tx.fillRect(0, 0, W, H);
  }

  // O mascote (um tardígrado de capacete) segue a câmera com uma mola suave.
  const tardigrado = criarTardigrado();
  const naves = criarNaves();
  let felizAte = 0;
  function desenharFoguete() {
    foguete.al += (camera.atual - foguete.al) * (1 - Math.exp(-dt * 7.5));
    foguete.al = Math.max(foguete.al, camera.atual - 50); // atrasa um pouco, mas nunca sai da tela
    const balanco = reduzirMovimento ? 0 : Math.sin(tempo * 1.3) * 2.5;
    const lado = reduzirMovimento ? 0 : Math.sin(tempo * 0.55) * 5;
    mascote.pulo *= Math.exp(-dt * 6);
    modoCanto += (alvoCanto - modoCanto) * (1 - Math.exp(-dt * 3));
    // ao lado direito da caixa (que fica no centro da tela)
    const xLivre = (innerWidth / 2 + larguraCaixa / 2) / escala + 28;
    const xCaixa = Math.min(L - 26, xLivre);
    // tela estreita: sem espaço do lado, ele flutua logo acima da caixa
    const yCaixa = naTelaExata(foguete.al) + 4 - (xLivre > L - 26 ? 34 : 0);
    // no cantinho esquerdo, flutuando, enquanto você digita
    const xCanto = Math.max(22, L * 0.08);
    // no celular, com o resultado no meio, ele sobe para não ficar por cima do texto
    const yCanto = mostrandoResultado && innerWidth < 560 ? A * 0.2 : A * 0.55;
    const m = suave(Math.min(1, Math.max(0, modoCanto)));
    foguete.x = xCaixa + (xCanto - xCaixa) * m + lado;
    foguete.y = yCaixa + (yCanto - yCaixa) * m + balanco - mascote.pulo;
    const descendo = camera.velocidade > 20;
    const inclina = reduzirMovimento ? 0 : Math.sin(tempo * 0.9) * 0.08 + Math.min(0.3, camera.velocidade / 3000);
    // quadro: perninhas remando (rápido descendo, devagar parado), pisca de vez em quando
    const agoraS = performance.now();
    const feliz = agoraS < felizAte;
    const ciclo = Math.floor(tempo * (descendo ? 10 : 2.5)) % 4;
    const piscando = !feliz && tempo % 3.7 < 0.13;
    const pele = mascote.dourado ? tardigrado.dourado : tardigrado;
    const img = piscando ? pele.piscar : (feliz ? pele.feliz : pele.andar)[ciclo];
    // pequeno: cada pixel do bichinho vira 2 a 3 px na tela
    const pz = Math.max(1.6, escala * 0.4);
    // "respira": estica e encolhe de leve
    const resp = reduzirMovimento ? 1 : 1 + Math.sin(tempo * 2.2) * 0.025;
    // olha sempre para o meio da tela (para a caixa): vira devagar, como quem se ajeita
    const alvoVirar = foguete.x * escala > innerWidth / 2 ? -1 : 1;
    mascote.virar += (alvoVirar - mascote.virar) * (1 - Math.exp(-dt * 8));
    const sx = foguete.x * escala, sy = foguete.y * escala;
    // singularidade: ele brilha na cor da resposta enquanto ela cai e fica na tela;
    // nesse caso o bichinho é pintado depois do apagão, para não ficar no escuro
    const sing = caixas.find((c) => c.supernova && !c.saida);
    const alvoSing = sing ? 0.35 + 0.65 * Math.min(1, (agoraS - sing.inicio) / sing.dura) ** 2 : 0;
    mascote.singular += (alvoSing - mascote.singular) * (1 - Math.exp(-dt * (alvoSing ? 6 : 2.2)));
    if (mascote.singular < 0.01) mascote.singular = 0;
    pintarMascote = () => pintarTardigrado(img, pz, resp, inclina, sx, sy);
    if (!mascote.singular) { pintarMascote(); pintarMascote = null; }
    return { x: foguete.x, y: foguete.y };
  }
  let pintarMascote = null;

  // silhueta do quadro em rosa-claro, para o brilho da singularidade (uma por quadro do bicho)
  const silhuetas = new Map();
  function silhueta(img) {
    let c = silhuetas.get(img);
    if (!c) {
      c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "#ffd6f6";
      g.fillRect(0, 0, c.width, c.height);
      silhuetas.set(img, c);
    }
    return c;
  }

  // Brilhinhos que saem do tardígrado na singularidade (em px da tela).
  const brilhosMascote = [];
  const CORES_SING = ["#ff4fd8", "#ff4fd8", "#ffffff", "#c38bff", "#ffd6f6"];
  function soltarBrilhoMascote(sx, sy, raio, forte) {
    const a = Math.random() * Math.PI * 2;
    const v = forte ? 140 + Math.random() * 260 : 18 + Math.random() * 55;
    brilhosMascote.push({
      x: sx + Math.cos(a) * raio * Math.random(), y: sy + Math.sin(a) * raio * 0.6 * Math.random(),
      vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 - (forte ? 40 : 25),
      vida: 0, dura: forte ? 0.7 + Math.random() * 0.8 : 0.6 + Math.random() * 0.7,
      cor: CORES_SING[Math.floor(Math.random() * CORES_SING.length)],
      tam: Math.random() < 0.3 ? 3 : 2,
      estrela: Math.random() < 0.45,
      fase: Math.random() * 6,
    });
  }

  function pintarTardigrado(img, pz, resp, inclina, sx, sy) {
    const agoraS = performance.now();
    // brilho quente em volta, que mistura o bicho com o cenário (sem contorno)
    // na hora em que vira dourado: um clarão que se espalha e some em ~2 s
    const festa = mascote.festaOuro ? Math.max(0, 1 - (performance.now() - mascote.festaOuro) / 2200) : 0;
    const rb = img.width * pz * (0.85 + festa * 1.6);
    const halo = tx.createRadialGradient(sx, sy, 0, sx, sy, rb);
    if (mascote.dourado) {
      halo.addColorStop(0, `rgba(255, 220, 110, ${0.34 + festa * 0.5})`);
      halo.addColorStop(0.45, `rgba(255, 190, 70, ${0.14 + festa * 0.25})`);
      halo.addColorStop(1, "rgba(255, 170, 40, 0)");
    } else {
      halo.addColorStop(0, "rgba(255, 150, 70, 0.30)");
      halo.addColorStop(0.45, "rgba(255, 120, 50, 0.12)");
      halo.addColorStop(1, "rgba(255, 110, 40, 0)");
    }
    tx.save();
    tx.globalCompositeOperation = "lighter";
    tx.fillStyle = halo;
    tx.fillRect(sx - rb, sy - rb, rb * 2, rb * 2);
    tx.restore();
    tx.save();
    tx.imageSmoothingEnabled = false;
    tx.translate(sx, sy);
    tx.rotate(inclina * Math.sign(mascote.virar || 1));
    tx.scale(mascote.virar / resp, resp);
    tx.shadowColor = mascote.dourado ? "rgba(255, 210, 90, 0.9)" : "rgba(255, 140, 60, 0.75)";
    tx.shadowBlur = pz * 4;
    tx.drawImage(img, (-img.width / 2) * pz, (-img.height / 2) * pz, img.width * pz, img.height * pz);
    tx.restore();
    const k = mascote.singular;
    if (k) pintarSingular(img, pz, resp, inclina, sx, sy, k, agoraS);
    desenharBrilhosMascote();
  }

  function pintarSingular(img, pz, resp, inclina, sx, sy, k, agoraS) {
    // ---- singularidade: o mesmo brilho rosa da caixa, pulsando, e brilhinhos saindo dele ----
    const explode = mascote.festaSing ? Math.max(0, 1 - (agoraS - mascote.festaSing) / 1800) : 0;
    const pulso = reduzirMovimento ? 0.5 : 0.5 + 0.5 * Math.sin(tempo * 5.5);
    const rs = img.width * pz * (1.1 + 0.3 * pulso + 2.2 * explode * explode);
    const aura = tx.createRadialGradient(sx, sy, 0, sx, sy, rs);
    aura.addColorStop(0, `rgba(255, 120, 230, ${k * (0.45 + 0.15 * pulso) + explode * 0.4})`);
    aura.addColorStop(0.4, `rgba(255, 79, 216, ${k * (0.2 + 0.1 * pulso) + explode * 0.2})`);
    aura.addColorStop(1, "rgba(180, 60, 255, 0)");
    tx.save();
    tx.globalCompositeOperation = "lighter";
    tx.fillStyle = aura;
    tx.fillRect(sx - rs, sy - rs, rs * 2, rs * 2);
    tx.restore();
    // o bicho por cima, com a borda brilhando rosa (duas passadas, como o texto da caixa)
    tx.save();
    tx.imageSmoothingEnabled = false;
    tx.translate(sx, sy);
    tx.rotate(inclina * Math.sign(mascote.virar || 1));
    tx.scale(mascote.virar / resp, resp);
    const ox = (-img.width / 2) * pz, oy = (-img.height / 2) * pz, iw = img.width * pz, ih = img.height * pz;
    tx.shadowColor = "#ff4fd8";
    tx.shadowBlur = pz * (6 + 6 * pulso) * k + explode * 30;
    tx.globalAlpha = Math.min(1, k * 1.2);
    tx.drawImage(img, ox, oy, iw, ih);
    // e ele mesmo acende: a silhueta clara somada por cima
    tx.shadowBlur = 0;
    tx.globalCompositeOperation = "lighter";
    tx.globalAlpha = k * (0.22 + 0.18 * pulso) + explode * 0.5;
    tx.drawImage(silhueta(img), ox, oy, iw, ih);
    tx.restore();
    // brilhinhos: um chuvisco constante, mais forte quanto mais perto do fundo
    const raio = img.width * pz * 0.55;
    if (!reduzirMovimento) {
      const n = dt * 34 * k;
      for (let i = 0; i < Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); i++) soltarBrilhoMascote(sx, sy, raio, false);
      if (mascote.estouroSing) {
        for (let i = 0; i < 70; i++) soltarBrilhoMascote(sx, sy, raio, true);
        mascote.estouroSing = false;
      }
    }
  }
  function desenharBrilhosMascote() {
    for (let i = brilhosMascote.length - 1; i >= 0; i--) {
      const e = brilhosMascote[i];
      e.vida += dt;
      if (e.vida >= e.dura) { brilhosMascote.splice(i, 1); continue; }
      e.vx *= Math.exp(-dt * 2.4);
      e.vy = e.vy * Math.exp(-dt * 2.4) - 12 * dt; // sobem de leve, como fagulha
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const t = e.vida / e.dura;
      const pisca = 0.65 + 0.35 * Math.sin(e.fase + e.vida * 18);
      tx.globalAlpha = (1 - t * t) * pisca;
      tx.fillStyle = e.cor;
      tx.shadowColor = e.cor;
      tx.shadowBlur = 6;
      const tam = e.tam * escala * 0.5 * (1 - t * 0.4);
      if (e.estrela) {
        tx.fillRect(e.x - tam * 1.5, e.y - tam / 4, tam * 3, tam / 2);
        tx.fillRect(e.x - tam / 4, e.y - tam * 1.5, tam / 2, tam * 3);
      } else tx.fillRect(e.x - tam / 2, e.y - tam / 2, tam, tam);
    }
    tx.shadowBlur = 0;
    tx.globalAlpha = 1;
  }

  // ---------- camada de texto (alta resolução) ----------

  // o rótulo de cada raridade fica logo abaixo da sua linha, dentro da faixa que ela começa
  const ROTULO_DY = 14;

  function linhaTracejada(y, x0, x1, cor, alfa) {
    tx.globalAlpha = alfa;
    tx.fillStyle = cor;
    for (let x = x0; x < x1; x += 10) tx.fillRect(x, Math.round(y), 5, 1.5);
    tx.globalAlpha = 1;
  }

  function desenharTextos(agora) {
    const W = innerWidth;
    const H = innerHeight;
    const escuro = escuridao(camera.atual);
    const claro = false; // o céu do início é azul médio: texto claro com contorno escuro serve em todo lugar
    const corSuave = claro ? "#0d1a4a" : "rgba(215, 222, 250, 0.82)";
    const contorno = claro ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 8, 0.85)";
    // escreve com um contorno da cor oposta: dá para ler em qualquer fundo
    const escrever = (t, x, y, cor, borda = contorno) => {
      tx.lineJoin = "round";
      tx.lineWidth = 3;
      tx.strokeStyle = borda;
      tx.strokeText(t, x, y);
      tx.fillStyle = cor;
      tx.fillText(t, x, y);
    };
    const centro0 = W * 0.16;
    const centro1 = W * 0.84;

    // régua da direita
    tx.font = "13px 'Space Mono', monospace";
    tx.textAlign = "right";
    tx.textBaseline = "middle";
    const alTopo = camera.atual - focoY / PX_POR_AL;
    const alBase = camera.atual + (A - focoY) / PX_POR_AL;
    tx.fillStyle = corSuave;
    tx.fillRect(W - 10, 0, 1, H);
    // um risco a cada 1.000 AL, número a cada 5.000
    for (let d = Math.max(0, Math.ceil(anosLuz(alTopo) / 1000) * 1000); U(d) < alBase; d += 1000) {
      const y = naTelaTexto(U(d));
      const grande = d % 5000 === 0;
      tx.fillRect(W - (grande ? 22 : 15), Math.round(y), grande ? 12 : 5, 1);
      if (grande) escrever(`${d.toLocaleString("pt-BR")} AL`, W - 26, y, corSuave);
    }

    // marcos e curiosidades (escondidos na tela de início, para não brigar com o título)
    const noInicio = document.getElementById("inicio")?.hidden === false;
    tx.textAlign = "left";
    // perto da linha de foco (onde a caixa passa) eles acendem; longe, ficam bem discretos
    const yFoco = naTelaTexto(camera.atual);
    const aceso = (y) => Math.max(0, 1 - Math.abs(y - yFoco) / 110);
    for (const m of noInicio ? [] : MARCOS) {
      if (m.real == null) continue; // Sistema Solar (descida inicial): só o cenário, sem linha
      const distancia = `${m.real.toLocaleString("pt-BR")} AL`;
      if (m.junto) {
        // vizinhas do Sol: o nome vai do lado da estrela, sem linha
        const img = corpos[m.corpo];
        const yj = naTelaTexto(m.al) + (m.dy || 0) * escala;
        if (yj < -20 || yj > H + 20) continue;
        const xj = posicaoCorpo(img, m) * escala;
        const esquerda = m.x > 0.5;
        tx.font = "13px 'Space Mono', monospace";
        tx.textAlign = esquerda ? "right" : "left";
        tx.globalAlpha = cobertas.some(([a, b]) => yj > a && yj < b) ? 0 : 0.9;
        escrever(m.nome, xj + (esquerda ? -1 : 1) * (img.raio * escala + 8), yj - 7, "#ffd23f");
        escrever(distancia, xj + (esquerda ? -1 : 1) * (img.raio * escala + 8), yj + 9, corSuave);
        tx.globalAlpha = 1;
        tx.textAlign = "left";
        continue;
      }
      const y = naTelaTexto(m.al);
      if (y < -20 || y > H + 20) continue;
      const k = aceso(y);
      linhaTracejada(y, centro0, centro1, "#ffd23f", 0.16 + 0.5 * k);
      tx.font = "16px 'Space Mono', monospace";
      tx.globalAlpha = 0.38 + 0.62 * k;
      if (cobertas.some(([a, b]) => y - 12 > a && y - 12 < b)) tx.globalAlpha = 0;
      if (k > 0.05 && !claro) { tx.shadowColor = "#ffd23f"; tx.shadowBlur = 12 * k; }
      tx.textAlign = m.direita ? "right" : "left";
      escrever(m.direita ? `${m.nome} · ${distancia}` : `${distancia} · ${m.nome}`, m.direita ? centro1 : centro0, y - 12, claro ? "#7a4a00" : "#ffd23f");
      tx.textAlign = "left";
      tx.shadowBlur = 0;
      tx.globalAlpha = 1;
    }
    // onde estão as linhas das faixas agora (para a curiosidade não ficar por cima)
    const linhasY = mostrarLinhas ? [rodadaAl, ...alvos.map((a) => rodadaAl + a.distancia)].map(naTelaTexto) : [];
    tx.font = `${W < 560 ? 13 : 15}px 'Space Mono', monospace`;
    // faixas da tela cobertas por painéis (pergunta, resposta, resultado):
    // ali as curiosidades não aparecem, para não misturar com o texto do painel
    if (quadro % 10 === 0) {
      cobertas = ["cartao-pergunta", "painel-resposta", "resultado"]
        .map((id) => document.getElementById(id))
        .filter((el) => el && !el.hidden)
        .map((el) => { const r = el.getBoundingClientRect(); return [r.top - 14, r.bottom + 14]; });
    }
    // enquanto você digita, as curiosidades somem devagar: só a pergunta e o campo na tela
    alfaCurio += ((digitando || fimDeJogo ? 0 : 1) - alfaCurio) * (1 - Math.exp(-dt * 3));
    tx.globalAlpha = alfaCurio;
    CURIOSIDADES.forEach(([al, texto], i) => {
      if (noInicio || alfaCurio < 0.02) return;
      const yc = naTelaTexto(al);
      if (cobertas.some(([a, b]) => yc > a && yc < b)) return;
      const y = naTelaTexto(al);
      if (y < -30 || y > H + 30) return;
      if (linhasY.some((ly) => Math.abs(ly + ROTULO_DY - y) < 22)) return;
      // texto comprido quebra em duas linhas para caber na tela
      let linhas = [texto];
      if (tx.measureText(texto).width > W * 0.55) {
        const meio = texto.lastIndexOf(" ", Math.ceil(texto.length / 2) + 4);
        linhas = [texto.slice(0, meio), texto.slice(meio + 1)];
      }
      const k = aceso(y);
      tx.globalAlpha = alfaCurio * (0.34 + 0.66 * k);
      const cor = k > 0.05 && !claro ? misturarCor("#c9d0f0", "#8ff0ff", k) : corSuave;
      if (k > 0.05 && !claro) { tx.shadowColor = "#5fe1ff"; tx.shadowBlur = 10 * k; }
      linhas.forEach((t, j) => {
        const ly = y + (j - (linhas.length - 1) / 2) * 16;
        if (i % 2) {
          tx.textAlign = "right";
          escrever(j === 0 ? `${t} —` : `${t}  `, W - 40, ly, cor);
        } else {
          tx.textAlign = "left";
          escrever(j === 0 ? `— ${t}` : `  ${t}`, 16, ly, cor);
        }
      });
      tx.shadowBlur = 0;
    });
    tx.globalAlpha = 1;


    // linhas das faixas: "você está aqui" e, abaixo, onde cada raridade faria você parar
    // nesta pergunta (as mesmas distâncias da queda de verdade), com os pontos que ela dá
    if (mostrarLinhas) {
      tx.textAlign = "right";
      const yAqui = naTelaTexto(rodadaAl);
      if (yAqui > -20 && yAqui < H + 20) {
        linhaTracejada(yAqui, centro0, centro1, "#ffffff", 0.55);
        tx.font = "bold 14px 'Space Mono', monospace";
        escrever("◂ VOCÊ ESTÁ AQUI", centro1, yAqui - 10, "#ffffff", "rgba(0, 0, 16, 0.85)");
      }
      // rótulo atrás de um painel (pergunta, campo da resposta) não aparece; a linha continua
      const coberto = (y) => cobertas.some(([c0, c1]) => y + ROTULO_DY > c0 && y + ROTULO_DY < c1);
      for (const { faixa: f, rotulo, distancia } of alvos) {
        const y = naTelaTexto(rodadaAl + distancia);
        if (y < -20 || y > H + 20) continue;
        const acesa = acesas[f.id];
        if (acesa) {
          // linha acesa: cheia, com brilho, e um pulso logo que a caixa passa
          const t = (agora - acesa) / 1000;
          const pulso = Math.exp(-t * 3);
          tx.save();
          tx.shadowColor = f.cor;
          tx.shadowBlur = 8 + 18 * pulso;
          tx.globalAlpha = 0.9;
          tx.fillStyle = f.cor;
          for (let x = centro0; x < centro1; x += 8) tx.fillRect(x, Math.round(y) - 0.5, 6, 2 + pulso * 2);
          tx.restore();
          tx.font = `${14 + Math.round(pulso * 4)}px 'Space Mono', monospace`;
        } else {
          linhaTracejada(y, centro0, centro1, f.cor, 0.75);
          tx.font = "bold 15px 'Space Mono', monospace";
        }
        if (!coberto(y)) escrever(rotulo, centro1, y + ROTULO_DY, f.cor, "rgba(0, 0, 16, 0.85)");
      }
    }

    desenharApagao(agora);
    desenharRastro();
    desenharCaixas(agora);
    desenharEstouros();
    // na singularidade o tardígrado vem por cima do apagão, brilhando junto com a resposta
    if (pintarMascote) { pintarMascote(); pintarMascote = null; }

    // brilho em volta do foguete e vinheta, mais fortes no escuro
    const fx = foguete.x * escala;
    const fy = foguete.y * escala;
    if (escuro > 0.05 && !negativo) {
      const brilho = tx.createRadialGradient(fx, fy, 0, fx, fy, 160);
      brilho.addColorStop(0, `rgba(95, 225, 255, ${0.13 * escuro})`);
      brilho.addColorStop(1, "rgba(95, 225, 255, 0)");
      tx.fillStyle = brilho;
      tx.fillRect(fx - 160, fy - 160, 320, 320);
    }
    // no horizonte de eventos a vinheta fica no meio, em volta do buraco negro
    const vx = negativo ? W / 2 : fx;
    const vinheta = tx.createRadialGradient(vx, H * 0.45, Math.min(W, H) * (negativo ? 0.45 : 0.3), vx, H * 0.45, Math.max(W, H) * 0.8);
    vinheta.addColorStop(0, "rgba(0, 0, 10, 0)");
    vinheta.addColorStop(1, negativo ? "rgba(0, 0, 10, 0.3)" : `rgba(0, 0, 10, ${0.25 + 0.5 * escuro})`);
    tx.fillStyle = vinheta;
    tx.fillRect(0, 0, W, H);

    if (flash > 0) {
      tx.fillStyle = `rgba(255, 240, 255, ${flash})`;
      tx.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - 0.025);
    }
  }

  // ---------- recompensa ao chegar ----------
  // Quanto mais rara, maior a festa: estrelas explodindo, anel de luz,
  // brilho na cor da faixa nas bordas, tremor e flash. A óbvia quase não faz nada.
  const estouros = [];
  const aneis = [];
  let bordaCor = null, borda = 0;
  function chegada(c, cx, cy, w, h) {
    const k = c.peso; // 0 a 1.2
    if (k < 0.35) return; // comum e óbvia: só o pulinho da caixa
    const n = Math.round(20 + 120 * Math.min(1, k));
    if (c.supernova) {
      dobra = 0;
      mascote.festaSing = performance.now();
      mascote.estouroSing = true;
      aneis.push({ x: cx, y: cy, vida: -0.25, dura: 1.3, cor: "#ff4fd8", max: Math.max(innerWidth, innerHeight) * 0.9 });
      if (window.Som && Som.buraco) Som.buraco();
    }
    for (let i = 0; i < n * (c.supernova ? 2 : 1); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (120 + Math.random() * 380) * (0.6 + k * 0.6);
      estouros.push({
        x: cx + Math.cos(a) * w * 0.3, y: cy + Math.sin(a) * h * 0.3,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 60,
        vida: 0, dura: 0.7 + Math.random() * 0.9,
        cor: Math.random() < 0.3 ? "#ffffff" : c.cor,
        tam: Math.random() < 0.15 ? 3 : 2,
        estrela: Math.random() < 0.25,
      });
    }
    aneis.push({ x: cx, y: cy, vida: 0, dura: 0.7, cor: c.cor, max: 160 + 220 * k });
    if (k > 0.6) aneis.push({ x: cx, y: cy, vida: -0.12, dura: 0.9, cor: "#ffffff", max: 260 + 260 * k });
    bordaCor = c.cor;
    borda = Math.min(1, 0.4 + k * 0.6);
    flash = Math.max(flash, c.supernova ? 0.85 : k > 0.6 ? 0.35 : 0.12);
    tremer(6 + 22 * Math.min(1, k) + (c.supernova ? 14 : 0), 250 + 500 * k + (c.supernova ? 500 : 0));
    mascote.pulo = 10 + 14 * k;
    felizAte = performance.now() + 2200;
    if (window.Som && Som.brilho) Som.brilho(k);
  }
  function desenharEstouros() {
    const W = innerWidth, H = innerHeight;
    if (borda > 0.01 && bordaCor) {
      const g = tx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, bordaCor);
      tx.globalAlpha = borda * 0.45;
      tx.fillStyle = g;
      tx.fillRect(0, 0, W, H);
      tx.globalAlpha = 1;
      borda *= Math.exp(-dt * 1.6);
    }
    for (let i = aneis.length - 1; i >= 0; i--) {
      const a = aneis[i];
      a.vida += dt;
      const t = a.vida / a.dura;
      if (t >= 1) { aneis.splice(i, 1); continue; }
      if (t < 0) continue;
      const r = a.max * (1 - Math.pow(1 - t, 3));
      tx.globalAlpha = (1 - t) * 0.8;
      tx.strokeStyle = a.cor;
      tx.lineWidth = 2 + 6 * (1 - t);
      tx.beginPath();
      tx.ellipse(a.x, a.y, r, r * 0.6, 0, 0, Math.PI * 2);
      tx.stroke();
    }
    for (let i = estouros.length - 1; i >= 0; i--) {
      const e = estouros[i];
      e.vida += dt;
      if (e.vida >= e.dura) { estouros.splice(i, 1); continue; }
      e.vx *= Math.exp(-dt * 2.2);
      e.vy = e.vy * Math.exp(-dt * 2.2) + 140 * dt; // cai de leve
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const t = e.vida / e.dura;
      tx.globalAlpha = 1 - t * t;
      tx.fillStyle = e.cor;
      const tam = e.tam * escala * 0.5 * (1 - t * 0.5);
      if (e.estrela) {
        tx.fillRect(e.x - tam * 1.5, e.y - tam / 4, tam * 3, tam / 2);
        tx.fillRect(e.x - tam / 4, e.y - tam * 1.5, tam / 2, tam * 3);
      } else tx.fillRect(e.x - tam / 2, e.y - tam / 2, tam, tam);
    }
    tx.globalAlpha = 1;
  }

  // Rastro que sai de cima da caixa enquanto ela cai, conforme a raridade:
  // poeira estelar nas óbvias/comuns, faíscas douradas nas incomuns,
  // fumaça escura avermelhada nas raras e plasma rosa na supernova.
  function soltarRastro(c, al, t) {
    const vel = Math.abs(camera.velocidade);
    const n = Math.min(4, vel / 300 + 0.3);
    for (let i = 0; i < n; i++) {
      if (Math.random() > n / Math.ceil(n)) continue;
      const tipo = c.supernova ? "plasma" : c.peso >= 0.6 ? "fumaca" : c.peso >= 0.35 ? "faisca" : "poeira";
      const fumaca = tipo === "fumaca" || tipo === "plasma";
      rastro.push({
        al: al - (18 + Math.random() * 10) / (PX_POR_AL * escala), // logo acima da caixa
        x: innerWidth / 2 + (Math.random() - 0.5) * larguraCaixa * 0.8,
        vx: (Math.random() - 0.5) * 20,
        vida: 0,
        dura: fumaca ? 1.4 + Math.random() : 0.6 + Math.random() * 0.6,
        r: fumaca ? 6 + Math.random() * 8 : 1 + Math.random() * 1.5,
        tipo,
        cor: tipo === "plasma" ? (Math.random() < 0.5 ? "255, 79, 216" : "180, 60, 255")
          : tipo === "fumaca" ? (Math.random() < 0.6 ? "150, 90, 240" : "100, 50, 190")
          : tipo === "faisca" ? (Math.random() < 0.5 ? "255, 210, 63" : "255, 160, 60")
          : (Math.random() < 0.5 ? "232, 240, 255" : "95, 225, 255"),
      });
    }
  }
  function desenharRastro() {
    for (let i = rastro.length - 1; i >= 0; i--) {
      const r = rastro[i];
      r.vida += dt;
      const t = r.vida / r.dura;
      if (t >= 1) { rastro.splice(i, 1); continue; }
      r.x += r.vx * dt;
      const y = naTelaTexto(r.al);
      if (r.tipo === "fumaca" || r.tipo === "plasma") {
        const raio = r.r * (1 + t * 2.2);
        const g = tx.createRadialGradient(r.x, y, 0, r.x, y, raio);
        const a = (r.tipo === "plasma" ? 0.35 : 0.42) * (1 - t);
        g.addColorStop(0, `rgba(${r.cor}, ${a})`);
        g.addColorStop(1, `rgba(${r.cor}, 0)`);
        tx.fillStyle = g;
        tx.fillRect(r.x - raio, y - raio, raio * 2, raio * 2);
      } else {
        tx.globalAlpha = 1 - t;
        tx.fillStyle = `rgb(${r.cor})`;
        const tam = r.r * escala * 0.5;
        tx.fillRect(r.x - tam / 2, y - tam / 2, tam, tam);
        if (r.tipo === "faisca") tx.fillRect(r.x - 0.5, y - tam * 2, 1, tam * 2);
        tx.globalAlpha = 1;
      }
    }
  }

  // Balanço lateral durante a queda (tq de 0 a 1; 1 = 46 px para a direita).
  // Óbvia: vai devagarinho para a esquerda, depois para a direita, e chega reta no meio.
  // Letrado: direita, esquerda, direita, esquerda, num ritmo calmo e constante,
  // cada vez menor, até parar. Os dois começam e terminam parados (sem tranco).
  // As outras faixas usam o balanço padrão (ou descem retas).
  const suave = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
  const BALANCO = {
    obvia: (tq) => -Math.sin(2 * Math.PI * suave(tq)) * 0.6,
    comum: (tq) => Math.sin(4 * Math.PI * suave(tq)) * (1 - 0.6 * tq) * 0.6,
  };
  // inclinação acompanhando o balanço, que some no começo e no fim da queda (chega reta)
  function inclinacaoBalanco(jeito, tq) {
    const derivada = (jeito(Math.min(1, tq + 0.01)) - jeito(Math.max(0, tq - 0.01))) / 0.02;
    return Math.max(-0.12, Math.min(0.12, derivada * 0.012)) * Math.sin(Math.PI * tq);
  }

  function desenharCaixas(agora) {
    const W = innerWidth;
    for (let i = caixas.length - 1; i >= 0; i--) {
      const c = caixas[i];
      const t = agora - c.inicio;
      // cai junto com a câmera e fica onde parou; as antigas vão ficando para trás
      const tq = Math.min(1, t / c.dura);
      const al = c.de + (c.para - c.de) * curvaQueda(tq, c.pesoQueda);
      if (!c.saida && mostrarLinhas) {
        alvos.forEach(({ faixa: f, distancia }, i) => {
          if (acesas[f.id] || al < rodadaAl + distancia - 0.5) return;
          acesas[f.id] = agora;
          if (window.Som && Som.limiar) Som.limiar(i);
        });
      }
      // fumaça só nas raras e o plasma na supernova (as outras têm os companheiros em órbita)
      if ((c.supernova || c.faixa === "rara") && !c.saida && t < c.dura && !reduzirMovimento) soltarRastro(c, al, t);
      const entrada = Math.max(0, 1 - t / 260); // ao aparecer, cai um pouquinho de cima
      const y = naTelaTexto(al) + 18 - entrada * entrada * 40;
      const sumindo = c.saida ? Math.min(1, (agora - c.saida) / 250) : 0;
      if (y < -80 || sumindo >= 1) {
        caixas.splice(i, 1);
        continue;
      }
      const texto = c.texto;
      const pequena = W < 560;
      const p = escala; // um pixel da cena: a borda segue a mesma grade do cenário
      tx.font = `${pequena ? 14 : 20}px 'Nicho Pixel', 'Press Start 2P', monospace`;
      const w = Math.ceil((Math.ceil(tx.measureText(texto).width) + (pequena ? 36 : 56)) / p) * p;
      if (!c.saida) larguraCaixa = w;
      const h = (pequena ? 12 : 14) * p;
      // centralizada na tela: é ali que o jogo acontece
      const x = Math.round(Math.max(8, W / 2 - w / 2) / p) * p;
      const alfa = Math.min(1, t / c.surgir) * (1 - sumindo);
      tx.save();
      tx.globalAlpha = alfa;
      // flutua devagar, sem parar (posição fracionada: desliza liso)
      // enquanto cai, a leve "samba" de um lado para o outro, como folha deslizando;
      // a pesada desce reta. O balanço vai sumindo perto do fim da queda.
      const leveza = 1 - Math.min(1, c.pesoQueda * 1.6);
      const caindo = !c.saida && tq < 1 && !reduzirMovimento;
      const jeito = BALANCO[c.faixa];
      const ondaQueda = !caindo ? 0 : jeito ? jeito(tq) : Math.sin(t / 1000 * 2.6) * Math.sin(Math.PI * tq) * leveza;
      const boiaX = (reduzirMovimento ? 0 : Math.sin(tempo * 0.7 + c.inicio) * 7) + ondaQueda * 46;
      const boiaY = reduzirMovimento ? 0 : Math.sin(tempo * 1.1 + c.inicio * 0.5) * 8;
      tx.translate(x + w / 2 + boiaX, y - sumindo * 14 + boiaY);
      // mola: ao aparecer cresce passando um pouco do tamanho e volta
      const mola = 1 - Math.exp(-t / 140) * Math.cos(t / 55);
      // ao chegar no fundo, dá um "pulo" maior quanto mais rara
      const tc = t - c.dura;
      const pop = tc > 0 ? c.peso * 0.35 * Math.exp(-tc / 160) * Math.cos(tc / 45) : 0;
      const balanco = reduzirMovimento ? 0 : Math.sin(tempo * 1.3 + c.inicio) * 0.035 + Math.sin(tempo * 0.5) * 0.015;
      // inclina para o lado em que está deslizando
      const inclinaQueda = !caindo ? 0
        : jeito ? inclinacaoBalanco(jeito, tq)
        : Math.cos(t / 1000 * 2.6) * Math.sin(Math.PI * tq) * leveza * 0.16;
      tx.rotate(c.angulo * Math.exp(-t / 600) + balanco + inclinaQueda);
      const esc = Math.max(0.05, mola + pop) * (1 - sumindo * 0.1);
      tx.scale(esc, esc);
      if (tc > 0 && !c.chegou) {
        c.chegou = true;
        chegada(c, x + w / 2 + boiaX, y + boiaY, w, h);
      }
      const x0 = -w / 2, y0 = -h / 2;
      desenharCompanhia(c, w, h, false, alfa);
      // vidro tingido pela cor do fundo naquela profundidade
      const f = corDoFundo(camera.atual).map((v) => Math.round(v * 0.35));
      const caixa = (dx, dy, cw, ch) => tx.fillRect(x0 + dx, y0 + dy, cw, ch);
      tx.fillStyle = `rgba(${f[0]}, ${f[1]}, ${f[2]}, 0.62)`;
      caixa(2 * p, 0, w - 4 * p, h);
      caixa(p, p, w - 2 * p, h - 2 * p);
      caixa(0, 2 * p, w, h - 4 * p);
      // brilho em volta, na cor da faixa
      tx.shadowColor = c.cor;
      tx.shadowBlur = c.brilho + 6;
      tx.fillStyle = c.cor;
      tx.globalAlpha = alfa * 0.9;
      // borda em degraus de pixel (cantos recortados)
      caixa(2 * p, 0, w - 4 * p, p);
      caixa(2 * p, h - p, w - 4 * p, p);
      caixa(0, 2 * p, p, h - 4 * p);
      caixa(w - p, 2 * p, p, h - 4 * p);
      caixa(p, p, p, p);
      caixa(w - 2 * p, p, p, p);
      caixa(p, h - 2 * p, p, p);
      caixa(w - 2 * p, h - 2 * p, p, p);
      // reflexo no topo do vidro
      tx.shadowBlur = 0;
      tx.globalAlpha = alfa * 0.18;
      tx.fillStyle = "#ffffff";
      caixa(2 * p, p, w - 4 * p, p);
      // texto grosso, pixelado e brilhando (duas passadas de brilho)
      tx.globalAlpha = alfa;
      tx.textAlign = "center";
      tx.textBaseline = "middle";
      tx.shadowColor = c.cor;
      tx.shadowBlur = 18;
      tx.fillStyle = c.cor;
      tx.fillText(texto, 0, p * 0.5);
      tx.shadowBlur = 4;
      tx.fillStyle = "#ffffff";
      tx.globalAlpha = alfa * 0.35;
      tx.fillText(texto, 0, p * 0.5);
      tx.shadowBlur = 0;
      desenharCompanhia(c, w, h, true, alfa);
      tx.restore();
    }
  }

  // Companheiros que orbitam a caixa, um tipo por faixa (o mesmo do ícone):
  // satélites na óbvia, luas na comum, um planeta de anel na incomum e um cometa na rara.
  // Passam atrás da caixa (menores e apagados) e na frente (maiores).
  const COMPANHIA = {
    obvia: { img: () => naves.satelite, n: 3, vel: 0.9, tam: 0.42 },
    comum: { img: () => naves.lua, n: 2, vel: 0.75, tam: 0.85 },
    incomum: { img: () => naves.planeta, n: 1, vel: 0.6, tam: 0.9 },
    rara: { img: () => naves.cometa, n: 1, vel: 1.1, tam: 0.9, cauda: true },
  };
  function desenharCompanhia(c, w, h, frente, alfa) {
    const cfg = COMPANHIA[c.faixa];
    if (!cfg || reduzirMovimento) return;
    const img = cfg.img();
    const pz = Math.max(1, Math.round(escala * cfg.tam));
    const rx = w / 2 + 16 + pz * 4, ry = h / 2 + 12 + pz * 2;
    for (let k = 0; k < cfg.n; k++) {
      const a = tempo * cfg.vel + (k / cfg.n) * Math.PI * 2 + c.inicio * 0.001;
      const prof = Math.sin(a); // > 0: passando na frente
      if ((prof > 0) !== frente) continue;
      const ox = Math.cos(a) * rx, oy = prof * ry;
      const s = 0.8 + 0.2 * prof;
      const luz = alfa * (frente ? 1 : 0.45 + 0.3 * (1 + prof));
      if (cfg.cauda) {
        // cauda: rastro que fica para trás na órbita, afinando e sumindo
        for (let j = 1; j <= 18; j++) {
          const b = a - j * 0.05 * Math.sign(cfg.vel);
          const tam = Math.max(1, Math.round(pz * (3.6 - j * 0.18)));
          tx.globalAlpha = luz * (1 - j / 19) * 0.85;
          tx.fillStyle = j % 3 === 0 ? "#f4e8ff" : "#c38bff";
          tx.fillRect(Math.cos(b) * rx - tam / 2, Math.sin(b) * ry - tam / 2, tam, tam);
        }
      }
      tx.save();
      tx.globalAlpha = luz;
      tx.imageSmoothingEnabled = false;
      tx.translate(ox, oy);
      tx.scale(s, s);
      tx.shadowColor = c.cor;
      tx.shadowBlur = 8;
      tx.drawImage(img, (-img.width / 2) * pz, (-img.height / 2) * pz, img.width * pz, img.height * pz);
      tx.restore();
    }
    tx.globalAlpha = alfa;
  }

  function passo(agora) {
    quadro++;
    dt = Math.min(0.1, Math.max(0.001, (agora - anterior) / 1000));
    tempo = agora / 1000;
    atualizarCamera(agora);
    anterior = agora;
    desenharFundo();
    desenharRaios();
    tx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tx.clearRect(0, 0, innerWidth, innerHeight);
    desenharPanoDeFundo();
    desenharEstrelas();
    desenharCadentes();
    desenharLaterais();
    desenharHalos();
    desenharCorpos();
    desenharNuvens();
    desenharISS();
    desenharTerraNaCena();
    desenharObjetos();
    desenharMarcosPixel();
    desenharPenumbra();
    const kh = forcaHorizonte();
    if (kh > 0) tingirHorizonte(kh);
    const foguete = desenharFoguete();
    desenharTextos(agora);
    if (quadro % 6 === 0) {
      // as caixas da interface pegam a cor do fundo: parecem parte do cenário
      const f = corDoFundo(camera.atual);
      const tinta = misturar(f.map((v) => v * 0.2), [10, 10, 46], 0.7).map(Math.round);
      const luz = misturar(f, [255, 255, 255], 0.55).map(Math.round);
      document.documentElement.style.setProperty("--tinta", `${tinta.join(", ")}`);
      document.documentElement.style.setProperty("--luz", `${luz.join(", ")}`);
    }
    aoQuadro(camera.atual);
    requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);

  function tremer(forca, duracao) {
    if (reduzirMovimento || !raiz.animate) return;
    const passos = [];
    for (let i = 0; i < 14; i++) {
      const f = forca * (1 - i / 14);
      passos.push({ transform: `translate(${(Math.random() - 0.5) * 2 * f}px, ${(Math.random() - 0.5) * 2 * f}px)` });
    }
    passos.push({ transform: "translate(0, 0)" });
    raiz.animate(passos, { duration: duracao, easing: "linear" });
  }

  return {
    icones,
    // Marca o começo de uma pergunta: as linhas das faixas partem daqui.
    novaRodada(cat) {
      const agora = performance.now();
      for (const k of Object.keys(acesas)) delete acesas[k];
      alvoCanto = 1;
      digitando = true;
      mostrandoResultado = false;
      for (const antiga of caixas) if (!antiga.saida) antiga.saida = agora;
      rodadaAl = camera.para;
      alvos = alvosDaPergunta(cat);
      mostrarLinhas = true;
    },
    // Desce o foguete pelos pontos da resposta e solta a palavra numa caixinha.
    descer(texto, pontos, supernova) {
      const agora = performance.now();
      const peso = Math.min(1, pontos / 100);
      const faixa = faixaDe(pontos, supernova);
      const distancia = viagem(pontos);
      alvoCanto = 0;
      digitando = false;
      camera.de = camera.atual;
      camera.para = camera.atual + distancia;
      camera.inicio = agora;
      camera.dura = duracaoQueda(pontos, supernova);
      camera.peso = pesoQueda(pontos, supernova);
      if (supernova) dobra = 1;
      // raro, espaço profundo e singularidade: o cenário apaga um instante em volta da caixa
      if (supernova || pontos >= 35) {
        apagao = { inicio: agora, dura: camera.dura, forca: supernova ? 0.94 : pontos >= 60 ? 0.88 : 0.78, cor: faixa.cor };
      }
      // a caixa anterior some (não ficam umas por cima das outras)
      for (const antiga of caixas) if (!antiga.saida) antiga.saida = agora;
      caixas.push({
        texto: texto.toUpperCase(),
        cor: faixa.cor,
        faixa: supernova ? "supernova" : faixa.id,
        dura: duracaoQueda(pontos, supernova),
        pesoQueda: pesoQueda(pontos, supernova),
        de: camera.de,
        para: camera.para,
        inicio: agora,
        surgir: 120 + 400 * (1 - peso), // as óbvias aparecem um pouco mais devagar
        brilho: 6 + 18 * peso,
        peso: supernova ? 1.2 : peso,
        supernova,
        angulo: (Math.random() - 0.5) * 0.4, // entra torta e endireita
      });
      mascote.pulo = 6 + 10 * peso;
      tremer(2 + 6 * peso, 300 + 600 * peso); // o tremor grande vem na chegada
    },
    tremer,
    // Hora do resultado: a caixa da resposta some (o resultado fica sozinho no meio da tela)
    // e o tardígrado volta para o cantinho.
    resultado() {
      const agora = performance.now();
      for (const antiga of caixas) if (!antiga.saida) antiga.saida = agora;
      alvoCanto = 1;
      mostrandoResultado = true;
      mostrarLinhas = false;
    },
    // Desce (ou sobe) a câmera até uma profundidade, sem caixa de resposta.
    irAte(al, dura) {
      camera.de = camera.atual;
      camera.para = al;
      camera.inicio = performance.now();
      camera.dura = dura;
      camera.peso = null;
    },
    // Fim da viagem: o cenário volta devagar até a Terra.
    subir(dura) {
      for (const antiga of caixas) if (!antiga.saida) antiga.saida = performance.now();
      alvoCanto = 0;
      mostrarLinhas = false;
      camera.de = camera.atual;
      camera.para = 0;
      camera.inicio = performance.now();
      camera.dura = dura;
      camera.peso = null;
    },
    // Tardígrado dourado (supernova): com festa só na hora em que acontece.
    dourado(festa) {
      mascote.dourado = true;
      if (festa) { mascote.festaOuro = performance.now(); mascote.pulo = 18; }
    },
    // Tela final: some com as caixinhas e as linhas das faixas.
    limpar() {
      fimDeJogo = true;
      caixas.length = 0;
      alvoCanto = 0;
      mostrarLinhas = false;
    },
    // Coloca a câmera numa profundidade sem animação (ao retomar o dia).
    irPara(al) {
      camera.de = camera.para = camera.atual = foguete.al = al;
    mascote.y = focoY;
    },
    aoQuadro(fn) {
      aoQuadro = fn;
    },
  };
}
