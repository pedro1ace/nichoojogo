// Skin da Laika, a cachorrinha cosmonauta, liberada ao apoiar o jogo.
// Desenhada pixel a pixel por código, no mesmo estilo do tardígrado e do Neil:
// luz vinda de cima, sombreado com dithering Bayer 4x4 e borda macia sem contorno preto.
// Traje branco com faixa rosa, dois foguetinhos nas costas (tipo jetpack) soltando chama
// e capacete-bolha de vidro com a cabecinha caramelo lá dentro.
//
// Poses, todas na mesma escala (bolha do capacete com raio de 7,3 px):
// - de lado (41x22): voando na horizontal, olhando para a direita; a cena espelha quando vira.
// - de frente (34x30): suspensa no espaço olhando para a tela, barriguinha para a frente,
//   as patinhas erguidas, as solinhas das patas de trás à mostra e o rabo fofo balançando.
//   É a pose de quando ela espera do lado do cartão da pergunta.
// - gracinhas: olhar para a tela (de lado com o rosto de frente) e enroladinha caçando o rabo.
// - vergonha (de frente, tapando os olhos): quando o tempo da pergunta acaba.
// Devolve o formato de criarTardigrado(): { andar[4], feliz[4], piscar, dourado } e, a mais,
// { frente, olhar, enrolada, vergonha, icone } (também dentro de dourado). O ícone é o desenho
// pequeno de 28x16, para o menu e os cartões de skin.
function criarApoiador() {
  const LW = 28, LH = 16;
  const FW = 34, FH = 30; // o corpo é simétrico em x = 16; os 2 px a mais à direita são do rabo
  const TRAJE = ["#232648", "#3f4573", "#6d75a6", "#a5add6", "#dde2f7", "#ffffff"];
  const OURO = ["#5a3a06", "#8f6410", "#c3921c", "#e8bd34", "#fbdc6a", "#fff4b8"];
  const PELO = ["#36190c", "#5e2e16", "#8f4c25", "#c2733c", "#e69f63", "#fadbb8"];
  const FAIXA = ["#6b1136", "#ad2158", "#ff4f8b", "#ffa6c6"];
  const METAL = ["#171a30", "#2f3457", "#535b87", "#858eb8", "#bcc3e3", "#eef0ff"];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  // chama do foguetinho, do bico para a ponta: miolo branco, amarelo, laranja, rosa e roxo
  const FOGO = ["#ffffff", "#fff3a8", "#ffd23f", "#ff9a3c", "#ff4f8b", "#c03fd1", "#6a2bb0"];
  const NARIZ = "#1a0a05";
  const ALMOFADA = ["#8e3552", "#c45e7c"]; // almofadinhas das patas: rosa queimado
  const OLHO = "#120703";

  const se = (x, y, e, p = 2.2) => 1 - Math.abs((x - e.cx) / e.rx) ** p - Math.abs((y - e.cy) / e.ry) ** p;
  // ruído fixo por pixel (sempre o mesmo para o mesmo x, y): tufinhos de pelo
  const ruido = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function tela(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const px = (x, y, cor, a = 1) => {
      if (x < 0 || x >= w || y < 0 || y >= h || a <= 0) return;
      g.globalAlpha = Math.min(1, a);
      g.fillStyle = cor;
      g.fillRect(x, y, 1, 1);
      g.globalAlpha = 1;
    };
    // apaga um pixel (para recortar um vão entre partes)
    const limpa = (x, y) => g.clearRect(x, y, 1, 1);
    return { c, g, px, limpa };
  }
  const tom = (tons, t, x, y) => {
    let k = Math.floor(t);
    if (t - k > 0.25 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.5) k++;
    return tons[Math.max(0, Math.min(tons.length - 1, k))];
  };

  // Chama de um foguetinho. (x, y) é o primeiro pixel depois do bico; (dx, dy) é para onde
  // ela sai; larg é 1 (fininha) ou 3 (com as beiradas). Pisca de quadro a quadro.
  function chama(px, x, y, dx, dy, compr, larg, fase, forca = 1) {
    const ox = dy !== 0 ? 1 : 0, oy = dx !== 0 ? 1 : 0; // eixo das beiradas
    for (let i = 0; i < compr; i++) {
      const t = i / Math.max(1, compr - 1);
      const k = Math.min(FOGO.length - 1, Math.floor(t * (FOGO.length - 1.2) + (i === 0 ? 0 : 0.6)));
      const a = (1 - t * 0.55) * forca;
      const cx = x + dx * i, cy = y + dy * i;
      px(cx, cy, FOGO[k], a);
      // beiradas: largas perto do bico, somem na ponta; tremem alternando de lado
      if (larg >= 3 && t < 0.62) {
        const kb = Math.min(FOGO.length - 1, k + 2);
        const tremE = (i + fase) % 3 === 0 && t > 0.3 ? 0 : 1;
        const tremD = (i + fase) % 3 === 1 && t > 0.3 ? 0 : 1;
        px(cx - ox, cy - oy, FOGO[kb], a * 0.85 * tremE);
        px(cx + ox, cy + oy, FOGO[kb], a * 0.85 * tremD);
      }
    }
    // faísca solta depois da ponta (vai e volta)
    if (fase % 2 === 1) {
      const s = compr + 1;
      px(x + dx * s + (fase === 1 ? -ox : ox), y + dy * s + (fase === 1 ? -oy : oy), fase === 1 ? "#ffd23f" : "#ff9cbd", 0.7 * forca);
    }
  }

  // ---------- pose de lado (28x16) ----------
  const CORPO = { cx: 11.4, cy: 9.0, rx: 5.0, ry: 3.7 };
  const BOLHA = { cx: 20.5, cy: 7.5, rx: 6.1, ry: 6.1 };
  const CRANIO = { cx: 19.4, cy: 7.2, rx: 3.5, ry: 3.7 };
  const FOCINHO = { cx: 22.8, cy: 8.5, rx: 2.5, ry: 1.95 };

  // foguetinho deitado nas costas: tubo do x0 ao x1 na altura y (3 px), bico rosa na frente
  function foguetinhoDeLado(px, x0, x1, y, TONS, longe) {
    const esc = longe ? 1.1 : 0;
    for (let x = x0; x <= x1; x++) {
      const t = 4.6 - (x1 - x) * 0.08 - esc;
      px(x, y - 1, tom(METAL, t + 0.6, x, y - 1), x === x0 ? 0.85 : 1);
      px(x, y, tom(TONS, t - 0.6, x, y));
      px(x, y + 1, tom(METAL, t - 2.3, x, y + 1), longe ? 0.9 : 1);
    }
    // anel rosa no meio do tubo
    const xm = Math.round((x0 + x1) / 2);
    if (!longe) { px(xm, y - 1, FAIXA[3]); px(xm, y, FAIXA[2]); px(xm, y + 1, FAIXA[1]); }
    // bico (cone) rosa
    px(x1 + 1, y - 1, FAIXA[longe ? 1 : 2], 0.7);
    px(x1 + 1, y, FAIXA[longe ? 1 : 2]);
    px(x1 + 2, y, FAIXA[longe ? 0 : 1], 0.85);
    px(x1 + 1, y + 1, FAIXA[longe ? 0 : 1], 0.9);
    // bocal escuro atrás e aleta de cima
    px(x0 - 1, y - 1, METAL[1], 0.8); px(x0 - 1, y, METAL[1]); px(x0 - 1, y + 1, METAL[0], 0.8);
    px(x0, y - 2, FAIXA[longe ? 0 : 1], longe ? 0.6 : 0.9);
  }

  // desenho pequeno (28x16), só para os ícones
  function quadroDeLado(fase, estadoOlho, TONS_TRAJE) {
    const { c, px } = tela(LW, LH);
    const ang = (fase / 4) * Math.PI * 2;

    // 1. Chamas dos dois foguetinhos (o de longe mais fininho)
    chama(px, 5, 3, -1, 0, [4, 5, 4, 5][fase], 1, (fase + 1) % 4, 0.8);
    chama(px, 4, 5, -1, 0, [5, 4, 5, 4][fase], 3, fase, 1);

    // 2. Patinhas de trás (mais escuras)
    const pata = (bx, defasagem, escura) => {
      const s = Math.sin(ang + defasagem);
      const dx = s > 0.45 ? 1 : 0;
      const dy = Math.cos(ang + defasagem) > 0.35 ? -1 : 0;
      const c1 = escura ? TONS_TRAJE[1] : TONS_TRAJE[3];
      const c2 = escura ? TONS_TRAJE[0] : TONS_TRAJE[2];
      px(bx, 12 + dy, c1); px(bx + 1, 12 + dy, c2);
      px(bx + dx, 13 + dy, c1); px(bx + 1 + dx, 13 + dy, c2);
      // pezinho caramelo com a almofadinha rosa
      px(bx + dx, 14 + dy, escura ? PELO[2] : PELO[3], escura ? 0.7 : 1);
      px(bx + 1 + dx, 14 + dy, escura ? FAIXA[1] : FAIXA[2], escura ? 0.6 : 0.95);
    };
    pata(9, Math.PI, true);
    pata(13, Math.PI + 1.5, true);

    // 3. Rabinho fofo caramelo saindo do traje (abanando)
    // (fofo, 2 px de grossura, com a pontinha clara virando para cima)
    const ab = [0, 1, 0, -1][fase];
    px(6, 9, PELO[3]); px(6, 10, PELO[2]);
    px(5, 9, PELO[4]); px(5, 10, PELO[3]);
    px(4, 9 + (ab > 0 ? 1 : 0), PELO[4]); px(4, 10 + (ab > 0 ? 1 : 0), PELO[2], 0.9);
    px(3, 9 + ab, PELO[5], 0.9); px(3, 10 + ab, PELO[3], 0.8);
    px(2, 8 + ab, PELO[4], 0.75);

    // 4. Corpo com traje espacial acolchoado + faixa rosa de missão
    for (let y = 4; y <= 13; y++) for (let x = 6; x <= 16; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = se(cx, cy, CORPO, 2.4);
      if (v < 0) continue;
      const t = 5.4 - (cy - 5.3) * 0.68 + Math.min(0, (v - 0.28) * 2.2);
      const borda = se(cx - 1, cy, CORPO, 2.4) < 0 || se(cx, cy - 1, CORPO, 2.4) < 0 || se(cx, cy + 1, CORPO, 2.4) < 0;
      const naFaixa = cx >= 12.0 && cx <= 13.6 && cy >= 5.8 && cy <= 12.4;
      const pal = naFaixa ? FAIXA : TONS_TRAJE;
      const tf = naFaixa ? (t / 5.4) * 3.5 : t;
      px(x, y, tom(pal, tf, x, y), borda ? 0.78 : 1);
    }

    // 5. Os dois foguetinhos nas costas, presos por uma alça rosa (o de longe, mais escuro, atrás)
    foguetinhoDeLado(px, 7, 11, 3, TONS_TRAJE, true);
    foguetinhoDeLado(px, 6, 10, 5, TONS_TRAJE, false);
    px(8, 7, FAIXA[1], 0.9); px(9, 7, FAIXA[2], 0.9);
    // luzinha piscando no tubo
    px(7, 5, fase % 2 === 0 ? "#5fe1ff" : "#ff4f8b", 0.95);

    // 6. Patinhas da frente
    pata(7, 0, false);
    pata(12, 1.5, false);

    // 7. Aro metálico da gola do capacete
    for (let y = 3; y <= 12; y++) {
      const x = y < 5 || y > 10 ? 15 : 14;
      const t = 5.0 - ((y - 3) / 9) * 4.2;
      px(x, y, tom(METAL, t, x, y), y === 3 || y === 12 ? 0.75 : 0.95);
    }

    // 8. Cabecinha da Laika dentro da bolha (caramelo com focinho claro e orelha caída)
    const naCabeca = (cx, cy) => Math.max(se(cx, cy, CRANIO, 2.2), se(cx, cy, FOCINHO, 2.1));
    for (let y = 3; y <= 12; y++) for (let x = 15; x <= 25; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (se(cx, cy, BOLHA, 2.0) < 0.08) continue;
      const v = naCabeca(cx, cy);
      if (v < 0) continue;
      const creme = (cx > 21.4 && cy > 7.3) || (cx > 19.9 && cy > 9.2);
      let t = 5.1 - (cy - 3.5) * 0.65 - (20.0 - cx) * 0.08;
      if (creme) t = Math.min(5.6, t + 1.35);
      px(x, y, tom(PELO, t, x, y), v < 0.14 ? 0.85 : 1);
    }
    // tufinho de pelo no alto da cabeça
    px(19, 3, PELO[4], 0.8); px(20, 3, PELO[5], 0.55);
    const dyOrelha = fase === 1 ? -1 : 0;
    const orelha = [[17, 4], [18, 4], [16, 5], [17, 5], [18, 5], [16, 6], [17, 6], [18, 6], [17, 7], [17, 8]];
    for (const [ox, oy] of orelha) {
      const yy = oy + (oy >= 7 ? dyOrelha : 0);
      px(ox, yy, oy <= 5 ? PELO[1] : PELO[0], ox === 16 ? 0.85 : 0.95);
    }
    if (estadoOlho === "fechado") {
      px(20, 6, PELO[0]); px(21, 6, PELO[0]);
    } else if (estadoOlho === "feliz") {
      px(20, 6, "#140803"); px(21, 5, "#140803"); px(22, 6, "#140803", 0.8);
    } else {
      px(21, 6, OLHO); px(21, 7, OLHO, 0.72);
      px(20, 6, OLHO, 0.45);
      px(21, 5, "#ffffff", 0.7);
    }
    px(24, 7, NARIZ); px(25, 8, NARIZ, 0.85);
    px(23, 10, PELO[1], 0.65);
    if (estadoOlho === "feliz") px(23, 10, "#ff4f8b", 0.9);

    // 9. Bolha de vidro transparente do capacete por cima da cabeça
    for (let y = 0; y < LH; y++) for (let x = 14; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const v = se(cx, cy, BOLHA, 2.0);
      if (v < -0.14) continue;
      const vDir = se(cx + 1, cy, BOLHA, 2.0);
      const vEsq = se(cx - 1, cy, BOLHA, 2.0);
      const vCima = se(cx, cy - 1, BOLHA, 2.0);
      const vBaixo = se(cx, cy + 1, BOLHA, 2.0);
      const naBorda = v >= 0 && (vDir < 0 || vCima < 0 || vBaixo < 0 || (cx > 16.5 && vEsq < 0));
      if (v < 0) {
        if (vDir >= 0 || vBaixo >= 0 || vCima >= 0) px(x, y, "#7ee8ff", 0.16);
      } else if (naBorda) {
        const topo = cy < 7.5;
        px(x, y, topo ? "#b8f4ff" : "#4b6ea8", topo ? 0.52 : 0.36);
      } else if (naCabeca(cx, cy) < 0) {
        px(x, y, "#6ad8ff", 0.09);
      }
    }
    for (const [rx, ry2, a] of [[18, 2, 0.75], [19, 2, 0.92], [20, 2, 0.85], [17, 3, 0.7], [18, 3, 0.45], [22, 3, 0.35]]) {
      px(rx, ry2, "#ffffff", a);
    }
    return c;
  }

  // ---------- pose de frente (34x30) ----------
  // tudo espelhado em torno de x = 16 (o pixel 15 e o 16 são o meio)
  const F = {
    bolha: { cx: 16, cy: 8.4, rx: 7.3, ry: 7.3 },
    cabeca: { cx: 16, cy: 9.3, rx: 5.0, ry: 4.5 },
    focinho: { cx: 16, cy: 11.8, rx: 2.5, ry: 1.75 },
    tronco: { cx: 16, cy: 21.6, rx: 5.5, ry: 5.1 },
    coxaE: { cx: 11.6, cy: 24.6, rx: 2.6, ry: 2.4 },
    coxaD: { cx: 20.4, cy: 24.6, rx: 2.6, ry: 2.4 },
  };

  // foguetinho em pé atrás do ombro (3 px de largura): bico rosa, janelinha, aleta para fora
  function foguetinhoDeFrente(px, x, TONS, lado) {
    const y0 = 9, y1 = 14; // corpo do tubo
    const ext = lado < 0 ? x - 1 : x + 1; // coluna de fora (lado < 0: foguete da esquerda)
    const dent = lado < 0 ? x + 1 : x - 1;
    // bico arredondado
    px(x, y0 - 3, FAIXA[3], 0.85);
    px(dent, y0 - 2, FAIXA[2]); px(x, y0 - 2, FAIXA[3]); px(ext, y0 - 2, FAIXA[1], 0.8);
    px(dent, y0 - 1, FAIXA[2]); px(x, y0 - 1, FAIXA[2]); px(ext, y0 - 1, FAIXA[1]);
    for (let y = y0; y <= y1; y++) {
      const t = 5.3 - (y - y0) * 0.35;
      // luz vem do meio da tela (de cima), a beirada de fora fica na sombra
      px(dent, y, tom(TONS, t - 0.5, dent, y));
      px(x, y, tom(TONS, t - 0.9, x, y));
      px(ext, y, tom(METAL, t - 2.3, ext, y));
    }
    // janelinha e anel rosa
    px(x, y0 + 1, "#5fe1ff");
    px(dent, y0 + 1, "#c9f6ff", 0.6);
    px(dent, y0 + 4, FAIXA[2]); px(x, y0 + 4, FAIXA[2]); px(ext, y0 + 4, FAIXA[1]);
    // aleta para fora
    const fx = ext + (lado < 0 ? -1 : 1);
    px(fx, y1 - 2, FAIXA[1], 0.7); px(fx, y1 - 1, FAIXA[1]); px(fx, y1, FAIXA[0]); px(fx, y1 + 1, FAIXA[0], 0.6);
    // bocal
    px(dent, y1 + 1, METAL[2]); px(x, y1 + 1, METAL[1]); px(ext, y1 + 1, METAL[0]);
  }

  // chama em gota apontando para baixo, saindo do bocal em (xc, y0): miolo branco e amarelo
  function chamaParaBaixo(px, xc, y0, compr, fase, lado) {
    const meio = xc + 0.5;
    for (let y = y0; y < y0 + compr + 1; y++) for (let x = xc - 2; x <= xc + 2; x++) {
      const u = (y + 0.5 - y0) / compr; // 0 no bocal, 1 na ponta
      if (u > 1.05) continue;
      // treme para os lados conforme o quadro
      const ondula = Math.sin(u * 5 + fase * 1.7) * 0.35 * u;
      const larg = 1.75 * Math.pow(Math.max(0, 1 - u), 0.65) + 0.15;
      const d = Math.abs(x + 0.5 - meio - ondula) / larg;
      if (d > 1) continue;
      const k = Math.min(FOGO.length - 1, Math.floor(u * 4.4 + d * 1.9));
      px(x, y, FOGO[k], u > 0.75 ? 1.6 - u * 1.1 : 1);
    }
    // faíscas que se soltam da ponta e escorregam para fora
    const f = (fase + (lado < 0 ? 0 : 2)) % 4;
    if (f !== 3) px(xc + lado * (f === 0 ? 0 : 1), y0 + compr + 1 + f, f === 1 ? "#ffd23f" : "#ff9cbd", 0.85 - f * 0.2);
  }

  // patinha vista de frente, com as almofadinhas rosa (toe beans) viradas para a tela
  function almofadinhas(px, x0, y0, PELOS, forma) {
    for (let j = 0; j < forma.length; j++) for (let i = 0; i < forma[j].length; i++) {
      const ch = forma[j][i];
      if (ch === " ") continue;
      const x = x0 + i, y = y0 + j;
      if (ch === "f") px(x, y, tom(PELOS, 4.7 - j * 0.5, x, y));
      else if (ch === ".") px(x, y, tom(PELOS, 3.7 - j * 0.4, x, y), 0.75);
      else if (ch === "b") px(x, y, ALMOFADA[1]);
      else if (ch === "B") px(x, y, ALMOFADA[0]);
      else if (ch === "w") px(x, y, FAIXA[3]);
    }
  }
  const SOLA = [
    ".fff.",
    "fbfbf",
    "ffBff",
    "fBBBf",
    " fff ",
  ];
  const MAO = [
    ".fff.",
    "fbfbf",
    "ffBff",
    " fff ",
  ];

  // Cabecinha de frente (orelhas caídas e fofas, focinho clarinho) com a bolha de vidro.
  // As contas são feitas na pose de frente (bolha com centro em x = 16, y = 8,4) e
  // desenhadas deslocadas de (ox, oy): assim a mesma cabeça serve para virar o rosto
  // para a tela quando ela está de lado.
  function cabecaDeFrente(px, ox, oy, estadoOlho, PELOS, { golaEmbaixo = true, orelhaCaida = false } = {}) {
    const p = (x, y, cor, a) => px(x + ox, y + oy, cor, a);
    const caida = orelhaCaida ? 0.9 : 0;
    const orelhas = [
      { cx: 10.9, cy: 11.0 + caida, rx: 1.9, ry: 3.3 + caida * 0.4 },
      { cx: 21.1, cy: 11.0 + caida, rx: 1.9, ry: 3.3 + caida * 0.4 },
    ];
    for (let y = 3; y <= 15; y++) for (let x = 8; x <= 23; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (se(cx, cy, F.bolha, 2.0) < 0.05) continue;
      const vc = Math.max(se(cx, cy, F.cabeca, 2.1), se(cx, cy, F.focinho, 2.1));
      const vo = Math.max(se(cx, cy, orelhas[0], 2.0), se(cx, cy, orelhas[1], 2.0));
      const fofo = ruido(x, y);
      if (vc >= 0) {
        let t = 5.0 - (cy - 5.0) * 0.4 - Math.abs(cx - 16) * 0.1 + (fofo - 0.5) * 0.8;
        if (se(cx, cy, F.focinho, 2.1) >= 0) t = Math.min(5.5, t + 1.7);
        p(x, y, tom(PELOS, t, x, y), vc < 0.08 ? 0.9 : 1);
      } else if (vo >= 0 || (vo > -0.3 && fofo > 0.62)) {
        // orelha: mais escura, cachinhos alternando dois tons
        const t = 2.5 - (cy - 8) * 0.12 + (fofo > 0.5 ? 0.6 : -0.3);
        p(x, y, tom(PELOS, t, x, y), vo < 0 ? 0.65 : vo < 0.1 ? 0.85 : 1);
      } else if (vc > -0.25 && fofo > 0.66 && cy < 10) {
        p(x, y, PELOS[4], 0.6); // tufinho solto no alto da cabeça
      }
    }
    // topete encaracolado
    for (const [x, y, k, a] of [[14, 5, 5, 0.75], [15, 4, 4, 0.95], [16, 4, 5, 0.9], [17, 4, 4, 0.6], [16, 5, 5, 0.5], [13, 5, 4, 0.5]]) p(x, y, PELOS[k], a);

    // olhos
    if (estadoOlho === "fechado") {
      p(12, 9, PELOS[0]); p(13, 9, PELOS[0], 0.85);
      p(18, 9, PELOS[0], 0.85); p(19, 9, PELOS[0]);
    } else if (estadoOlho === "feliz") {
      // olhinhos em arco (^ ^)
      p(12, 9, OLHO, 0.9); p(13, 8, OLHO); p(14, 9, OLHO, 0.55);
      p(17, 9, OLHO, 0.55); p(18, 8, OLHO); p(19, 9, OLHO, 0.9);
    } else {
      for (const ex of [12, 18]) {
        p(ex, 8, OLHO); p(ex + 1, 8, OLHO);
        p(ex, 9, OLHO); p(ex + 1, 9, OLHO);
        p(ex + (ex < 16 ? 0 : 1), 8, "#ffffff", 0.9); // brilhinho do lado da luz
        p(ex + (ex < 16 ? 1 : 0), 9, "#3a2a40", 0.9);
      }
    }
    // bochechas rosadas
    p(11, 11, FAIXA[3], 0.4); p(20, 11, FAIXA[3], 0.4);
    // nariz de botão e a boquinha
    p(15, 10, NARIZ); p(16, 10, NARIZ);
    p(15, 11, NARIZ, 0.8); p(16, 11, NARIZ, 0.8);
    p(15, 10, "#7a5446"); // brilho do nariz
    if (estadoOlho === "feliz") {
      p(14, 12, PELOS[1], 0.8); p(17, 12, PELOS[1], 0.8);
      p(15, 12, FAIXA[0]); p(16, 12, FAIXA[0]);
      p(15, 13, FAIXA[2]); p(16, 13, FAIXA[3]); // linguinha
    } else {
      p(14, 12, PELOS[1], 0.75); p(15, 12, PELOS[2], 0.5); p(16, 12, PELOS[2], 0.5); p(17, 12, PELOS[1], 0.75);
    }

    // bolha de vidro por cima da cabeça
    const B = F.bolha;
    for (let y = 0; y < 16; y++) for (let x = 7; x < 25; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const v = se(cx, cy, B, 2.0);
      if (v < -0.16) continue;
      const fora = (dx, dy) => se(cx + dx, cy + dy, B, 2.0) < 0;
      const naBorda = v >= 0 && (fora(1, 0) || fora(-1, 0) || fora(0, -1) || fora(0, 1));
      if (v < 0) {
        if ((!golaEmbaixo || cy < 14) && (!fora(1, 0) || !fora(-1, 0) || !fora(0, 1) || !fora(0, -1))) p(x, y, "#7ee8ff", 0.13);
      } else if (naBorda) {
        if (golaEmbaixo && cy > 14.2) continue; // embaixo fica a gola
        const brilho = cy < 9 && cx < 16.5;
        p(x, y, brilho ? "#c8f7ff" : cy < 8 ? "#9fdcff" : "#4b6ea8", brilho ? 0.62 : 0.4);
      } else {
        p(x, y, "#6ad8ff", 0.07);
      }
    }
    // reflexo curvo no vidro (do lado da luz) e um brilho pequeno do outro lado
    for (const [x, y, a] of [[11, 3, 0.85], [12, 2, 0.95], [13, 2, 0.55], [10, 4, 0.7], [10, 5, 0.4], [20, 3, 0.35], [21, 4, 0.25]]) p(x, y, "#ffffff", a);

    if (orelhaCaida) { p(11, 11, FAIXA[2], 0.55); p(20, 11, FAIXA[2], 0.55); } // bochechas coradas
  }

  // Vergonha: as duas patinhas tapando os olhos por cima do vidro (ou uma só, espiando)
  function patinhasNosOlhos(px, modo, TONS_TRAJE, PELOS) {
    const PATA = [".fff.", "fffff", "fdfdf", " fff "];
    for (const [lado, x0] of [[-1, 9], [1, 18]]) {
      const desce = modo === "espiando" && lado > 0 ? 4 : 0;
      const y0 = 7 + desce;
      // braço subindo do ombro até a pata
      const bx = lado < 0 ? 9 : 21;
      for (let y = y0 + 4; y <= 16; y++) {
        px(bx, y, tom(TONS_TRAJE, 4.6 - (y - y0) * 0.12, bx, y));
        px(bx + 1, y, tom(TONS_TRAJE, 3.2 - (y - y0) * 0.12, bx + 1, y));
      }
      px(bx, y0 + 4, FAIXA[2]); px(bx + 1, y0 + 4, FAIXA[1]); // punho rosa
      // contorno escurinho em volta da pata, para ela não sumir no pelo da cara
      const naPata = (i, j) => j >= 0 && j < 4 && i >= 0 && i < 5 && PATA[j][i] !== " " && PATA[j][i] !== ".";
      for (let j = -1; j <= 4; j++) for (let i = -1; i <= 5; i++) {
        if (naPata(i, j)) continue;
        if (naPata(i - 1, j) || naPata(i + 1, j) || naPata(i, j - 1) || naPata(i, j + 1)) px(x0 + i, y0 + j, PELOS[1], 0.75);
      }
      for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) {
        const ch = PATA[j][i];
        if (ch === " ") continue;
        const x = x0 + i, y = y0 + j;
        if (ch === "d") px(x, y, PELOS[2]);
        else px(x, y, tom(PELOS, 5.4 - j * 0.4, x, y), ch === "." ? 0.85 : 1);
      }
    }
    // gotinha de suor de quem ficou sem graça
    px(25, 3, "#c9f6ff", 0.9); px(25, 4, "#7ee8ff"); px(24, 5, "#5fb8e8", 0.6);
  }

  // fase: ritmo das chamas (rápido); rabo: posição do rabo (devagar). O resto do corpo fica
  // parado de propósito: mexer patas, pés e orelhas a cada quadro deixava ela tremendo.
  function quadroDeFrente(fase, rabo, estadoOlho, TONS_TRAJE, PELOS, modo = "normal") {
    const { c, px } = tela(FW, FH);
    c.centroX = 16; // o corpo é simétrico em x = 16 (o rabo ocupa a sobra da direita)

    // 1. Chamas dos foguetinhos, para baixo (cada uma no seu ritmo)
    // (com vergonha, os foguetinhos quase apagam)
    const fraca = modo === "normal" ? 0 : 3;
    chamaParaBaixo(px, 5, 16, [7, 8, 6, 8][fase] - fraca, fase, -1);
    chamaParaBaixo(px, 26, 16, [7, 6, 8, 7][fase] - fraca, (fase + 2) % 4, 1);

    // 2. Foguetinhos atrás dos ombros, presos por alças rosa
    foguetinhoDeFrente(px, 5, TONS_TRAJE, -1);
    foguetinhoDeFrente(px, 26, TONS_TRAJE, 1);
    // braçadeiras de metal que prendem cada foguete no ombro
    for (const [x, y, k] of [[7, 13, 3], [8, 14, 2], [9, 15, 2], [24, 13, 2], [23, 14, 1], [22, 15, 1]]) px(x, y, METAL[k]);

    // 3. Rabo fofo saindo de trás do quadril, curvando para cima e abanando
    const abana = [0, 1, 2, 1][rabo];
    const cauda = modo !== "normal"
      ? [[21.8, 25.8, 1.5], [23.3, 27.0, 1.6], [25.0, 27.9, 1.6], [26.9, 28.3, 1.5], [28.7, 28.3, 1.3], [30.2, 27.8, 1.0]] // rabo murcho
      : [
        [22.0, 25.8, 1.5], [23.9, 26.9, 1.7], [26.0, 27.3, 1.9], [28.1, 26.8, 2.0],
        [29.7, 25.4, 2.0], [30.6, 23.5, 1.9], [30.8 + abana * 0.2, 21.5, 1.7],
        [30.4 + abana * 0.5, 19.7, 1.4], [29.6 + abana * 0.8, 18.4, 1.0],
      ];
    for (let y = 15; y < FH; y++) for (let x = 19; x < FW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let melhor = -9, k = 0;
      cauda.forEach(([rx, ry, rr], i) => {
        const d = 1 - Math.hypot(cx - rx, cy - ry) / rr;
        if (d > melhor) { melhor = d; k = i; }
      });
      const fofo = ruido(x, y);
      if (melhor < 0 && !(melhor > -0.28 && fofo > 0.66)) continue;
      // base mais escura (sai de trás do corpo), ponta clarinha; luz de cima
      let t = 2.2 + (k / (cauda.length - 1)) * 2.6 + melhor * 1.2 - (cy - cauda[k][1]) * 0.55 + (fofo - 0.5) * 0.8;
      if (melhor < 0) t -= 0.6;
      px(x, y, tom(PELOS, t, x, y), melhor < 0 ? 0.6 : melhor < 0.15 ? 0.85 : 1);
    }

    // 4. Tronco (barriguinha para a frente) e coxas, no traje acolchoado
    const blocos = [F.tronco, F.coxaE, F.coxaD];
    const valor = (cx, cy) => Math.max(...blocos.map((e) => se(cx, cy, e, 2.2)));
    for (let y = 15; y <= 28; y++) for (let x = 8; x <= 24; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = valor(cx, cy);
      if (v < 0) continue;
      const lateral = Math.abs(cx - 16) / 6.5;
      let t = 5.5 - (cy - 16.6) * 0.33 - lateral * lateral * 1.7 + Math.min(0, (v - 0.25) * 2.2);
      // vinco entre a barriga e as coxas
      const naCoxa = Math.max(se(cx, cy, F.coxaE, 2.2), se(cx, cy, F.coxaD, 2.2)) > se(cx, cy, F.tronco, 2.2);
      if (naCoxa && se(cx, cy - 1, F.tronco, 2.2) > 0.05 && cy > 23) t -= 1.4;
      const borda = valor(cx - 1, cy) < 0 || valor(cx + 1, cy) < 0 || valor(cx, cy + 1) < 0;
      const naFaixa = !naCoxa && cy >= 23 && cy <= 24;
      let pal = TONS_TRAJE;
      if (naFaixa) { pal = FAIXA; t = Math.max(1.2, (t / 5.5) * 3.7); }
      px(x, y, tom(pal, t, x, y), borda ? 0.8 : 1);
    }
    // fivela dourada no cinto e costurinha da barriga
    px(15, 23, OURO[5]); px(16, 23, OURO[3]);
    px(15, 21, TONS_TRAJE[3], 0.3); px(16, 22, TONS_TRAJE[3], 0.3);

    // 5. Patas de trás para a frente: solinhas com as almofadinhas à mostra
    for (const x0 of [7, 20]) {
      const y0 = 25;
      // punho rosa do traje
      for (let x = x0 + 1; x <= x0 + 3; x++) px(x, y0 - 1, TONS_TRAJE[x === x0 + 2 ? 3 : 2]);
      almofadinhas(px, x0, y0, PELOS, SOLA);
    }

    // 6. Patinhas da frente erguidas na frente do peito, como quem diz "oi"
    // (com vergonha elas vão para os olhos, desenhadas depois da cabeça)
    for (const [x0, i] of modo === "normal" ? [[9, 0], [18, 1]] : []) {
      const y0 = 18;
      // manguinha saindo do ombro e o punho rosa
      const ombro = i === 0 ? 10 : 21;
      px(ombro, y0 - 1, TONS_TRAJE[4]); px(ombro + (i === 0 ? 1 : -1), y0 - 1, TONS_TRAJE[3]);
      for (let x = x0 + 1; x <= x0 + 3; x++) px(x, y0, TONS_TRAJE[x === x0 + 2 ? 3 : 2]);
      almofadinhas(px, x0, y0 + 1, PELOS, MAO);
      // sombrinha da patinha na barriga
      px(x0 + 1, y0 + 5, TONS_TRAJE[2], 0.5); px(x0 + 3, y0 + 5, TONS_TRAJE[2], 0.5);
    }

    // 7. Gola metálica do capacete
    for (let x = 11; x <= 20; x++) {
      const borda = x === 11 || x === 20;
      px(x, 15, tom(METAL, 5.0 - Math.abs(x - 15.5) * 0.28, x, 15), borda ? 0.7 : 1);
      px(x, 16, tom(METAL, 2.8 - Math.abs(x - 15.5) * 0.22, x, 16), borda ? 0.6 : 0.95);
    }

    // 8 e 9. Cabecinha de frente e a bolha de vidro
    cabecaDeFrente(px, 0, 0, estadoOlho, PELOS, { golaEmbaixo: true, orelhaCaida: modo !== "normal" });
    if (modo !== "normal") patinhasNosOlhos(px, modo, TONS_TRAJE, PELOS);

    return c;
  }

  // ---------- pose de lado grande (41x22), na mesma escala da pose de frente ----------
  // A bolha do capacete tem o mesmo raio (7,3) da de frente, com centro em (32, 9,4).
  // O desenho pequeno de 28x16 (quadroDeLado) fica só para os ícones do menu e das skins.
  const GW = 41, GH = 22;
  const GB = { cx: 32, cy: 9.4, r: 7.3 }; // bolha
  const GCORPO = { cx: 17.8, cy: 12.4, rx: 7.6, ry: 5.0 };

  // Bolha de vidro genérica (círculo de raio r em cx, cy): borda clara em cima, escura embaixo,
  // vidro quase transparente e o reflexo curvo do lado esquerdo de cima.
  function bolhaDeVidro(px, b, temCabeca) {
    for (let y = Math.floor(b.cy - b.r - 1); y <= b.cy + b.r + 1; y++) for (let x = Math.floor(b.cx - b.r - 1); x <= b.cx + b.r + 1; x++) {
      const d = Math.hypot(x + 0.5 - b.cx, y + 0.5 - b.cy);
      if (d > b.r + 0.45) continue;
      if (d > b.r - 0.55) {
        const brilho = y + 0.5 < b.cy - 0.5 && x + 0.5 < b.cx + 0.5;
        px(x, y, brilho ? "#c8f7ff" : y + 0.5 < b.cy ? "#9fdcff" : "#4b6ea8", brilho ? 0.62 : 0.4);
      } else if (d > b.r - 0.9 || !temCabeca(x, y)) {
        px(x, y, "#6ad8ff", 0.07);
      }
    }
    const rx = Math.round(b.cx), ry = Math.round(b.cy);
    for (const [dx, dy, a] of [[-5, -5, 0.85], [-4, -6, 0.95], [-3, -6, 0.55], [-6, -4, 0.7], [-6, -3, 0.4], [4, -5, 0.35], [5, -4, 0.25]]) px(rx + dx, ry + dy, "#ffffff", a);
  }

  // Cabecinha de perfil (olhando para a direita) dentro da bolha, num quadrinho 17x17 com o
  // centro da bolha em (8, 8,4). Serve para a pose de lado e, espelhada, para a enroladinha.
  function cabecaDePerfil(estadoOlho, PELOS, fase = 0) {
    const { c, px } = tela(17, 17);
    const b = { cx: 8, cy: 8.4, r: 7.3 };
    const CR = { cx: 6.6, cy: 8.1, rx: 4.5, ry: 4.5 };
    const FO = { cx: 11.1, cy: 10.0, rx: 2.9, ry: 2.1 };
    const OR = { cx: 4.0, cy: 9.8 + (fase === 1 ? 0.5 : 0), rx: 1.8, ry: 3.3 };
    const naCabeca = (cx, cy) => Math.max(se(cx, cy, CR, 2.1), se(cx, cy, FO, 2.1));
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (Math.hypot(cx - b.cx, cy - b.cy) > b.r - 0.6) continue;
      const v = naCabeca(cx, cy);
      const fofo = ruido(x, y);
      if (v >= 0) {
        let t = 5.0 - (cy - 4.0) * 0.42 - Math.abs(cx - 7) * 0.05 + (fofo - 0.5) * 0.8;
        // focinho e o peito do queixo mais clarinhos
        if (se(cx, cy, FO, 2.1) > 0 && cx > 9.2) t = Math.min(5.5, t + 1.7);
        px(x, y, tom(PELOS, t, x, y), v < 0.08 ? 0.9 : 1);
      } else if (v > -0.25 && fofo > 0.66 && cy < 8) {
        px(x, y, PELOS[4], 0.6); // tufinho solto
      }
    }
    // orelha caída e cacheada, por cima do crânio, atrás do olho
    for (let y = 5; y < 15; y++) for (let x = 1; x < 8; x++) {
      const cx = x + 0.5, cy = y + 0.5, vo = se(cx, cy, OR, 2.0), fofo = ruido(x + 40, y);
      if (vo < 0 && !(vo > -0.3 && fofo > 0.6)) continue;
      if (Math.hypot(cx - b.cx, cy - b.cy) > b.r - 0.6) continue;
      px(x, y, tom(PELOS, 2.3 - (cy - 7) * 0.1 + (fofo > 0.5 ? 0.6 : -0.3), x, y), vo < 0 ? 0.65 : vo < 0.1 ? 0.85 : 1);
    }
    for (const [x, y, k, a] of [[5, 3, 5, 0.75], [6, 3, 4, 0.95], [7, 3, 5, 0.8], [8, 4, 4, 0.5], [4, 4, 4, 0.5]]) px(x, y, PELOS[k], a); // topete
    if (estadoOlho === "fechado") {
      px(9, 8, PELOS[0]); px(10, 8, PELOS[0], 0.85);
    } else if (estadoOlho === "feliz") {
      px(8, 8, OLHO, 0.6); px(9, 7, OLHO); px(10, 8, OLHO, 0.9);
    } else {
      px(9, 7, OLHO); px(10, 7, OLHO, 0.55); px(9, 8, OLHO); px(10, 8, OLHO, 0.8);
      px(9, 7, "#ffffff", 0.85);
      px(8, 6, PELOS[2], 0.5);
    }
    px(10, 11, FAIXA[3], 0.35); // bochecha
    px(13, 9, NARIZ); px(13, 10, NARIZ, 0.75); px(14, 9, NARIZ, 0.55); px(13, 9, "#7a5446", 0.9);
    if (estadoOlho === "feliz") {
      px(11, 12, PELOS[1], 0.8); px(12, 12, FAIXA[0]); px(12, 13, FAIXA[2]); px(12, 14, FAIXA[3], 0.9); // linguinha
    } else {
      px(11, 12, PELOS[1], 0.6); px(12, 12, PELOS[1], 0.75);
    }
    bolhaDeVidro(px, b, (x, y) => naCabeca(x + 0.5, y + 0.5) >= 0);
    return c;
  }

  // foguetinho deitado nas costas (3 px de altura): tubo do x0 ao x1 com centro na linha y
  function foguetinhoGrande(px, x0, x1, y, TONS, longe) {
    const esc = longe ? 1.2 : 0;
    for (let x = x0; x <= x1; x++) {
      const t = 5.0 - (x1 - x) * 0.07 - esc;
      px(x, y - 1, tom(TONS, t + 0.3, x, y - 1));
      px(x, y, tom(TONS, t - 0.9, x, y));
      px(x, y + 1, tom(METAL, t - 2.4, x, y + 1));
    }
    // janelinha e anel rosa
    if (!longe) { px(x1 - 1, y, "#5fe1ff"); px(x1 - 1, y - 1, "#c9f6ff", 0.6); }
    const xm = x0 + 3;
    px(xm, y - 1, FAIXA[longe ? 1 : 3]); px(xm, y, FAIXA[longe ? 1 : 2]); px(xm, y + 1, FAIXA[longe ? 0 : 1]);
    // bico arredondado
    px(x1 + 1, y - 1, FAIXA[longe ? 1 : 2]); px(x1 + 1, y, FAIXA[longe ? 1 : 3]); px(x1 + 1, y + 1, FAIXA[longe ? 0 : 1]);
    px(x1 + 2, y - 1, FAIXA[longe ? 0 : 1], 0.6); px(x1 + 2, y, FAIXA[longe ? 1 : 2]); px(x1 + 2, y + 1, FAIXA[0], 0.6);
    px(x1 + 3, y, FAIXA[longe ? 0 : 1], 0.85);
    // aleta de cima e bocal escuro atrás
    px(x0, y - 2, FAIXA[longe ? 0 : 1], 0.85); px(x0 + 1, y - 2, FAIXA[longe ? 0 : 1], 0.55);
    px(x0 - 1, y - 1, METAL[2], 0.85); px(x0 - 1, y, METAL[1]); px(x0 - 1, y + 1, METAL[0], 0.85);
  }

  // olhando: o rosto virado para a tela (a gracinha de olhar para quem está jogando)
  function quadroDeLadoGrande(fase, estadoOlho, TONS_TRAJE, PELOS, olhando = false) {
    const { c, px } = tela(GW, GH);
    const ang = (fase / 4) * Math.PI * 2;

    // 1. Chamas dos dois foguetinhos (o de longe mais fininho)
    chama(px, 10, 4, -1, 0, [5, 6, 5, 6][fase], 1, (fase + 1) % 4, 0.8);
    chama(px, 9, 6, -1, 0, [6, 7, 5, 7][fase], 3, fase, 1);

    // 2. Patinhas do lado de lá (mais escuras), remando
    const pata = (bx, defasagem, escura) => {
      const s = Math.sin(ang + defasagem);
      const dx = s > 0.45 ? 1 : s < -0.45 ? -1 : 0;
      const dy = Math.cos(ang + defasagem) > 0.35 ? -1 : 0;
      const c1 = escura ? TONS_TRAJE[1] : TONS_TRAJE[3];
      const c2 = escura ? TONS_TRAJE[0] : TONS_TRAJE[2];
      for (let y = 15; y <= 17; y++) { px(bx + (y === 17 ? dx : 0), y + dy, c1); px(bx + 1 + (y === 17 ? dx : 0), y + dy, c2); }
      // pezinho caramelo com a almofadinha rosa embaixo
      const fx = bx + dx, fy = 18 + dy;
      px(fx, fy, escura ? PELOS[2] : PELOS[4]); px(fx + 1, fy, escura ? PELOS[1] : PELOS[3]); px(fx + 2, fy, escura ? PELOS[1] : PELOS[3], 0.85);
      px(fx, fy + 1, escura ? PELOS[1] : PELOS[3], 0.8); px(fx + 1, fy + 1, escura ? ALMOFADA[0] : ALMOFADA[1]); px(fx + 2, fy + 1, escura ? ALMOFADA[0] : ALMOFADA[1], 0.85);
    };
    pata(13, Math.PI, true);
    pata(21, Math.PI + 1.5, true);

    // 3. Rabo fofo saindo de baixo das costas, curvando para cima e abanando
    const abana = [0, 1, 2, 1][fase];
    // (vai para trás como uma plumagem, com a pontinha clara subindo de leve)
    const cauda = [
      [10.6, 12.8, 1.6], [8.7, 13.6, 1.85], [6.7, 14.0, 1.95], [4.8, 13.7 - abana * 0.2, 1.85],
      [3.2, 12.8 - abana * 0.45, 1.55], [2.1, 11.6 - abana * 0.7, 1.1],
    ];
    for (let y = 7; y < GH; y++) for (let x = 0; x < 13; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let melhor = -9, k = 0;
      cauda.forEach(([rx, ry, rr], i) => { const d = 1 - Math.hypot(cx - rx, cy - ry) / rr; if (d > melhor) { melhor = d; k = i; } });
      const fofo = ruido(x + 7, y);
      if (melhor < 0 && !(melhor > -0.28 && fofo > 0.66)) continue;
      let t = 2.3 + (k / (cauda.length - 1)) * 2.6 + melhor * 1.2 - (cy - cauda[k][1]) * 0.55 + (fofo - 0.5) * 0.8;
      if (melhor < 0) t -= 0.6;
      px(x, y, tom(PELOS, t, x, y), melhor < 0 ? 0.6 : melhor < 0.15 ? 0.85 : 1);
    }

    // 4. Corpo no traje acolchoado, com a faixa rosa de missão
    for (let y = 6; y <= 18; y++) for (let x = 9; x <= 27; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = se(cx, cy, GCORPO, 2.3);
      if (v < 0) continue;
      let t = 5.5 - (cy - 8.0) * 0.48 + Math.min(0, (v - 0.25) * 2.2);
      const borda = se(cx - 1, cy, GCORPO, 2.3) < 0 || se(cx, cy - 1, GCORPO, 2.3) < 0 || se(cx, cy + 1, GCORPO, 2.3) < 0;
      const naFaixa = cx >= 19 && cx <= 21;
      if (naFaixa) t = Math.max(1.2, (t / 5.5) * 3.7);
      px(x, y, tom(naFaixa ? FAIXA : TONS_TRAJE, t, x, y), borda ? 0.8 : 1);
    }
    // costura da barriga
    for (let x = 12; x <= 24; x += 3) px(x, 15, TONS_TRAJE[2], 0.35);

    // 5. Os dois foguetinhos nas costas, presos por uma alça rosa (o de longe atrás)
    foguetinhoGrande(px, 12, 19, 4, TONS_TRAJE, true);
    foguetinhoGrande(px, 11, 18, 6, TONS_TRAJE, false);
    px(15, 8, FAIXA[1]); px(16, 8, FAIXA[2]); px(15, 9, FAIXA[0], 0.6);
    px(13, 6, fase % 2 === 0 ? "#5fe1ff" : "#ff4f8b"); // luzinha piscando no tubo

    // 6. Patinhas do lado de cá
    pata(15, 0, false);
    pata(23, 1.5, false);

    // 7. Cabeça: de perfil ou virada para a tela
    if (olhando) cabecaDeFrente(px, 16, 1, estadoOlho, PELOS, { golaEmbaixo: false });
    else c.getContext("2d").drawImage(cabecaDePerfil(estadoOlho, PELOS, fase), 24, 1);

    // 8. Gola metálica onde a bolha encontra o corpo (arco embaixo à esquerda da bolha)
    for (let y = 6; y < GH; y++) for (let x = 20; x < 34; x++) {
      const dx = x + 0.5 - GB.cx, dy = y + 0.5 - GB.cy;
      const d = Math.hypot(dx, dy), a = (((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 360;
      if (Math.abs(d - GB.r) > 0.85 || a < 100 || a > 215) continue;
      px(x, y, tom(METAL, 4.6 - (y - 8) * 0.38, x, y), d > GB.r + 0.4 ? 0.7 : 1);
    }
    return c;
  }

  // ---------- enroladinha, caçando o próprio rabo (36x34), na mesma escala ----------
  // O corpo vira um "C" em volta do centro do quadro (18, 17): a cabeça em cima à direita,
  // olhando para a esquerda, e o rabo em cima à esquerda, quase encostando no focinho. A cena
  // gira este quadro no sentido anti-horário (a cabeça vai atrás do rabo); os foguetinhos
  // ficam nas costas, do lado de fora, com a chama para trás, como um cata-vento.
  const EW = 36, EHt = 34, ECX = 18, ECY = 17, ER = 8.2, EH = 3.5;
  const E_INI = -40, E_FIM = 212; // ângulos (graus, y para baixo) onde o corpo começa e termina
  const graus = (dx, dy) => { const a = (Math.atan2(dy, dx) * 180) / Math.PI; return a < -90 ? a + 360 : a; };
  const noArco = (a, r = ER) => [ECX + r * Math.cos((a * Math.PI) / 180), ECY + r * Math.sin((a * Math.PI) / 180)];
  function distCorpo(cx, cy) {
    const dx = cx - ECX, dy = cy - ECY, a = graus(dx, dy);
    if (a >= E_INI && a <= E_FIM) return Math.abs(Math.hypot(dx, dy) - ER);
    const [x0, y0] = noArco(E_INI), [x1, y1] = noArco(E_FIM);
    return Math.min(Math.hypot(cx - x0, cy - y0), Math.hypot(cx - x1, cy - y1));
  }

  function quadroEnrolada(fase, TONS_TRAJE, PELOS) {
    const { c, g, px } = tela(EW, EHt);
    const H = { cx: 23, cy: 9.4, r: 7.3 }; // bolha do capacete (a cabeça vai espelhada)

    // 1 e 2. Foguetinhos nas costas (lado de fora do C), bico para onde ela gira, chama para trás
    for (const [ang, desloc] of [[56, 0], [128, 2]]) {
      const ar = (ang * Math.PI) / 180;
      const nx = Math.cos(ar), ny = Math.sin(ar); // para fora
      const tx = Math.sin(ar), ty = -Math.cos(ar); // para a frente (sentido do giro)
      const rcx = ECX + nx * (ER + EH + 1.0), rcy = ECY + ny * (ER + EH + 1.0);
      const L = 5.2 + ((fase + desloc) % 4 === 1 ? 2.0 : (fase + desloc) % 4 === 3 ? 1.0 : 0);
      for (let y = 0; y < EHt; y++) for (let x = 0; x < EW; x++) {
        const dx = x + 0.5 - rcx, dy = y + 0.5 - rcy;
        const u = dx * tx + dy * ty, w = dx * nx + dy * ny;
        if (u >= -2.4 && u <= 2.4 && Math.abs(w) <= 1.55) {
          const cor = Math.abs(u) < 0.5 ? FAIXA[2] : w > 0.5 ? METAL[2] : w < -0.5 ? TONS_TRAJE[5] : TONS_TRAJE[4];
          px(x, y, cor);
        } else if (u > 2.4 && u <= 4.3 && Math.abs(w) <= 1.55 - (u - 2.4) * 0.75) {
          px(x, y, u > 3.4 ? FAIXA[3] : FAIXA[2]);
        } else if (u < -2.4 && u >= -2.4 - L) {
          const k = (-u - 2.4) / L;
          if (Math.abs(w) > 1.75 * Math.pow(1 - k, 0.7) + 0.15) continue;
          px(x, y, FOGO[Math.min(FOGO.length - 1, Math.floor(k * 4.6 + Math.abs(w) * 1.1))], k > 0.75 ? 0.7 : 1);
        }
      }
    }

    // 3. Corpo em C com o traje acolchoado e a faixa rosa
    for (let y = 0; y < EHt; y++) for (let x = 0; x < EW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const d = distCorpo(cx, cy);
      if (d > EH) continue;
      const r = Math.hypot(cx - ECX, cy - ECY), a = graus(cx - ECX, cy - ECY);
      const t = 5.4 - (cy - 6) * 0.15 - Math.max(0, ER - r) * 0.26 - Math.max(0, d - (EH - 1.0)) * 1.1;
      const naFaixa = a > 96 && a < 108;
      px(x, y, naFaixa ? tom(FAIXA, (t / 5.4) * 3.6, x, y) : tom(TONS_TRAJE, t, x, y), d > EH - 0.45 ? 0.82 : 1);
    }
    // patinhas do lado de dentro (barriga), remando
    for (const [ang, k] of [[22, 0], [58, 1], [134, 2], [172, 3]]) {
      const a = ang + ((fase + k) % 2 ? 7 : -5);
      const [bx, by] = noArco(a, ER - EH - 1.0);
      for (let y = Math.floor(by - 1.6); y <= by + 1.6; y++) for (let x = Math.floor(bx - 1.6); x <= bx + 1.6; x++) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
        if (d > 1.45) continue;
        const dentro = Math.hypot(x + 0.5 - ECX, y + 0.5 - ECY) < ER - EH - 1.3;
        px(x, y, dentro ? ALMOFADA[1] : PELOS[d < 0.7 ? 4 : 3]);
      }
    }

    // 4. Rabo fofo na outra ponta do C, abanando na direção do focinho
    const abana = [0, 4, 8, 4][fase];
    const rabo = [];
    for (let i = 0; i <= 7; i++) {
      const [rx, ry] = noArco(E_FIM - 6 + i * (5.0 + abana * 0.1), ER + i * 0.12);
      rabo.push([rx, ry, 2.5 - i * 0.17]);
    }
    for (let y = 0; y < EHt; y++) for (let x = 0; x < EW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let melhor = -9, k = 0;
      rabo.forEach(([rx, ry, rr], i) => { const d = 1 - Math.hypot(cx - rx, cy - ry) / rr; if (d > melhor) { melhor = d; k = i; } });
      const fofo = ruido(x, y);
      if (melhor < 0 && !(melhor > -0.3 && fofo > 0.62)) continue;
      const t = 2.5 + (k / 7) * 2.6 + melhor * 1.2 - (cy - rabo[k][1]) * 0.5 + (fofo - 0.5) * 0.6;
      px(x, y, tom(PELOS, t, x, y), melhor < 0 ? 0.6 : 1);
    }

    // 5. Cabecinha de perfil espelhada (olhando para o rabo), com a linguinha de fora
    const cab = cabecaDePerfil("feliz", PELOS, fase);
    g.save();
    g.translate(H.cx - 8 + 17 - 1, 0);
    g.scale(-1, 1);
    g.drawImage(cab, 0, Math.round(H.cy - 8.4));
    g.restore();

    // 6. Gola de metal onde o capacete encontra o corpo
    for (let y = 0; y < EHt; y++) for (let x = 0; x < EW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const dh = Math.hypot(cx - H.cx, cy - H.cy);
      if (Math.abs(dh - H.r) < 0.85 && distCorpo(cx, cy) <= EH && cy > H.cy) px(x, y, tom(METAL, 4.4 - (cy - 10) * 0.45, x, y));
    }
    c.centroX = EW / 2;
    return c;
  }

  const montar = (tons, pelos) => {
    // de lado, grande (a cena usa estes)
    const andar = [0, 1, 2, 3].map((i) => quadroDeLadoGrande(i, "normal", tons, pelos));
    const feliz = [0, 1, 2, 3].map((i) => quadroDeLadoGrande(i, "feliz", tons, pelos));
    // de frente: 16 quadros = 4 posições do rabo (devagar) x 4 das chamas (rápido)
    const q16 = (olho) => Array.from({ length: 16 }, (_, k) => quadroDeFrente(k % 4, Math.floor(k / 4), olho, tons, pelos));
    const frente = { andar: q16("normal"), feliz: q16("feliz"), piscar: quadroDeFrente(0, 0, "fechado", tons, pelos) };
    // gracinhas de quando ela está de lado à toa: olhar para a tela e caçar o rabo
    const olhar = {
      andar: [0, 1, 2, 3].map((i) => quadroDeLadoGrande(i, "normal", tons, pelos, true)),
      feliz: [0, 1, 2, 3].map((i) => quadroDeLadoGrande(i, "feliz", tons, pelos, true)),
      piscar: quadroDeLadoGrande(0, "fechado", tons, pelos, true),
    };
    const enrolada = [0, 1, 2, 3].map((i) => quadroEnrolada(i, tons, pelos));
    // tempo esgotado: de frente, tapando os olhos com as patinhas (e espiando por uma)
    const vergonha = {
      tapando: [0, 1, 2, 3].map((i) => quadroDeFrente(i, 0, "fechado", tons, pelos, "vergonha")),
      espiando: [0, 1, 2, 3].map((i) => quadroDeFrente(i, 0, "normal", tons, pelos, "espiando")),
    };
    // ícone pequeno (28x16) para o menu, a janela de skins e a do apoio
    const icone = {
      andar: [0, 1, 2, 3].map((i) => quadroDeLado(i, "normal", tons)),
      feliz: [0, 1, 2, 3].map((i) => quadroDeLado(i, "feliz", tons)),
    };
    return { andar, feliz, piscar: quadroDeLadoGrande(0, "fechado", tons, pelos), frente, olhar, enrolada, vergonha, icone };
  };
  return { ...montar(TRAJE, PELO), dourado: montar(OURO, PELO), largura: GW, altura: GH };
}
