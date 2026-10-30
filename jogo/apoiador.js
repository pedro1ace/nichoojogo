// Skin da Laika, a cachorrinha cosmonauta (28x16), liberada ao apoiar o jogo.
// Desenhada pixel a pixel por código, no mesmo estilo do tardígrado e do Neil:
// luz vinda de cima, sombreado com dithering Bayer 4x4 e borda macia sem contorno preto.
// Traje branco com faixa rosa, mochila a jato soltando plasma e capacete-bolha de vidro
// com a cabecinha caramelo lá dentro. Olha para a direita; a cena espelha quando vira.
// Devolve o mesmo formato de criarTardigrado(): { andar[4], feliz, piscar, dourado }.
function criarApoiador() {
  const LW = 28, LH = 16;
  const TRAJE = ["#232648", "#3f4573", "#6d75a6", "#a5add6", "#dde2f7", "#ffffff"];
  const OURO = ["#5a3a06", "#8f6410", "#c3921c", "#e8bd34", "#fbdc6a", "#fff4b8"];
  const PELO = ["#36190c", "#5e2e16", "#8f4c25", "#c2733c", "#e69f63", "#fadbb8"];
  const FAIXA = ["#6b1136", "#ad2158", "#ff4f8b", "#ffa6c6"];
  const METAL = ["#171a30", "#2f3457", "#535b87", "#858eb8", "#bcc3e3", "#eef0ff"];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  const se = (x, y, e, p = 2.2) => 1 - Math.abs((x - e.cx) / e.rx) ** p - Math.abs((y - e.cy) / e.ry) ** p;
  const CORPO = { cx: 11.2, cy: 8.7, rx: 5.1, ry: 3.8 };
  const MOCHILA = { cx: 6.8, cy: 7.4, rx: 2.2, ry: 3.3 };
  const BOLHA = { cx: 20.5, cy: 7.5, rx: 6.1, ry: 6.1 };
  const CRANIO = { cx: 19.4, cy: 7.2, rx: 3.5, ry: 3.7 };
  const FOCINHO = { cx: 22.8, cy: 8.5, rx: 2.5, ry: 1.95 };

  function quadro(fase, estadoOlho, TONS_TRAJE) {
    const c = document.createElement("canvas");
    c.width = LW; c.height = LH;
    const g = c.getContext("2d");
    const px = (x, y, cor, a = 1) => {
      if (x < 0 || x >= LW || y < 0 || y >= LH) return;
      g.globalAlpha = a;
      g.fillStyle = cor;
      g.fillRect(x, y, 1, 1);
      g.globalAlpha = 1;
    };
    const tom = (tons, t, x, y) => {
      let k = Math.floor(t);
      if (t - k > 0.25 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.5) k++;
      return tons[Math.max(0, Math.min(tons.length - 1, k))];
    };

    const ang = (fase / 4) * Math.PI * 2;

    // 1. Jato de plasma da mochila (4 quadros vivos em branco, ouro e rosa)
    const comprJato = [3, 4, 3, 4][fase];
    px(4, 7, "#ffffff", 0.95);
    px(4, 8, "#ffd23f", 0.95);
    px(4, 6, "#ff9cbd", 0.65);
    px(4, 9, "#ff4f8b", 0.65);
    for (let i = 1; i <= comprJato; i++) {
      const x = 4 - i;
      const a = 1 - i / (comprJato + 0.9);
      px(x, 7, i === 1 ? "#ffd23f" : "#ff4f8b", a * 0.95);
      px(x, 8, i === 1 ? "#ff7aa8" : "#c38bff", a * 0.85);
      if (i <= 2) {
        px(x, 6, "#ff4f8b", a * 0.45);
        px(x, 9, "#962fbf", a * 0.4);
      }
    }
    const [fx, fy] = [[0, 7], [0, 8], [1, 6], [0, 7]][fase];
    px(fx, fy, fase % 2 ? "#5fe1ff" : "#ffc2d6", 0.7);

    // 2. Patinhas (par de trás mais escuro, par da frente mais claro, espaçados)
    const pata = (bx, defasagem, escura) => {
      const s = Math.sin(ang + defasagem);
      const dx = s > 0.45 ? 1 : 0;
      const dy = Math.cos(ang + defasagem) > 0.35 ? -1 : 0;
      const c1 = escura ? TONS_TRAJE[1] : TONS_TRAJE[3];
      const c2 = escura ? TONS_TRAJE[0] : TONS_TRAJE[2];
      const bota = escura ? FAIXA[1] : FAIXA[2];
      px(bx, 12 + dy, c1); px(bx + 1, 12 + dy, c2);
      px(bx + dx, 13 + dy, c1); px(bx + 1 + dx, 13 + dy, c2);
      px(bx + 1 + dx, 14 + dy, bota, escura ? 0.6 : 0.95);
    };
    pata(9, Math.PI, true);
    pata(13, Math.PI + 1.5, true);

    // 3. Mochila a jato nas costas
    for (let y = 4; y <= 11; y++) for (let x = 5; x <= 9; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = se(cx, cy, MOCHILA, 2.4);
      if (v < 0) continue;
      const t = 4.7 - (cy - 4.4) * 0.65 - (7.8 - cx) * 0.22;
      const borda = se(cx - 1, cy, MOCHILA, 2.4) < 0 || se(cx, cy - 1, MOCHILA, 2.4) < 0 || se(cx, cy + 1, MOCHILA, 2.4) < 0;
      px(x, y, tom(METAL, t, x, y), borda ? 0.8 : 1);
    }
    px(5, 7, METAL[1]); px(5, 8, METAL[1]);
    px(7, 5, fase % 2 === 0 ? "#5fe1ff" : "#ff4f8b", 0.95);

    // 4. Corpo com traje espacial acolchoado + faixa rosa de missão
    for (let y = 4; y <= 13; y++) for (let x = 6; x <= 16; x++) {
      const cx = x + 0.5, cy = y + 0.5, v = se(cx, cy, CORPO, 2.4);
      if (v < 0) continue;
      const t = 5.4 - (cy - 5.0) * 0.68 + Math.min(0, (v - 0.28) * 2.2);
      const borda = se(cx - 1, cy, CORPO, 2.4) < 0 || se(cx, cy - 1, CORPO, 2.4) < 0 || (se(cx, cy + 1, MOCHILA, 2.4) < 0 && se(cx, cy + 1, CORPO, 2.4) < 0);
      const naFaixa = cx >= 11.0 && cx <= 12.6 && cy >= 5.5 && cy <= 12.0;
      const pal = naFaixa ? FAIXA : TONS_TRAJE;
      const tf = naFaixa ? (t / 5.4) * 3.5 : t;
      px(x, y, tom(pal, tf, x, y), borda ? 0.78 : 1);
    }

    // 5. Rabinho no traje (abanando de leve) e patinhas da frente
    const ry = fase % 2 === 0 ? 10 : 9;
    px(5, ry, TONS_TRAJE[2], 0.9); px(4, ry + 1, TONS_TRAJE[1], 0.75);
    pata(7, 0, false);
    pata(12, 1.5, false);

    // 6. Aro metálico da gola do capacete
    for (let y = 3; y <= 12; y++) {
      const x = y < 5 || y > 10 ? 15 : 14;
      const t = 5.0 - ((y - 3) / 9) * 4.2;
      px(x, y, tom(METAL, t, x, y), y === 3 || y === 12 ? 0.75 : 0.95);
    }

    // 7. Cabecinha da Laika dentro da bolha (caramelo com focinho claro e orelha caída)
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
      px(21, 6, "#120703"); px(21, 7, "#120703", 0.72);
      px(20, 6, "#120703", 0.45);
      px(21, 5, "#ffffff", 0.7);
    }
    px(24, 7, "#1a0a05"); px(25, 8, "#1a0a05", 0.85);
    px(23, 10, PELO[1], 0.65);
    if (estadoOlho === "feliz") px(23, 10, "#ff4f8b", 0.9);

    // 8. Bolha de vidro transparente do capacete por cima da cabeça
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
    for (const [rx, ry, a] of [[18, 2, 0.75], [19, 2, 0.92], [20, 2, 0.85], [17, 3, 0.7], [18, 3, 0.45], [22, 3, 0.35]]) {
      px(rx, ry, "#ffffff", a);
    }

    return c;
  }

  const montar = (tons) => {
    const andar = [0, 1, 2, 3].map((i) => quadro(i, "normal", tons));
    const feliz = [0, 1, 2, 3].map((i) => quadro(i, "feliz", tons));
    return { andar, feliz, piscar: quadro(0, "fechado", tons) };
  };
  return { ...montar(TRAJE), dourado: montar(OURO), largura: LW, altura: LH };
}
