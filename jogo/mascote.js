// Tardígrado mascote, desenhado pixel a pixel por código (40x30).
// Cabeção redondo, corpo gordinho em gomos, 8 perninhas com garrinhas,
// olhão brilhante, bochecha rosada e capacete de vidro.
function criarTardigrado() {
  const LW = 40, LH = 30;
  const TONS = ["#2e1a66", "#6450bf", "#8c78df", "#b6a6f3", "#e4dbff"]; // contorno, sombra, meio, luz, brilho
  const L = (() => { const v = [-0.5, -0.8, 0.55]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  // partes como elipsoides: [cx, cy, rx, ry]
  const PARTES = [
    [12.5, 16.5, 7.5, 6.2], // traseiro
    [18.5, 15.5, 6.5, 6.6], // meio
    [27, 13.5, 8, 7.6],     // cabeça
  ];
  const dentro = (x, y) => PARTES.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  function intensidade(x, y) {
    let melhor = null, d = -1;
    for (const [cx, cy, rx, ry] of PARTES) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, q = 1 - nx * nx - ny * ny;
      if (q > d) { d = q; melhor = [nx, ny, Math.sqrt(Math.max(0, q))]; }
    }
    return Math.max(0, melhor[0] * L[0] + melhor[1] * L[1] + melhor[2] * L[2]);
  }

  function quadro({ passo = 0, olho = "aberto", pulo = 0 } = {}) {
    const c = document.createElement("canvas");
    c.width = LW; c.height = LH;
    const g = c.getContext("2d");
    const px = (x, y, cor) => { g.fillStyle = cor; g.fillRect(x, y, 1, 1); };

    // perninha gordinha: 3 de largura, ponta mais escura e duas garrinhas
    const perna = (bx, by, fase, tons) => {
      const lift = Math.max(0, Math.sin(passo + fase)) * 1.4;
      const dx = Math.round(Math.cos(passo + fase) * 1);
      const topo = by - Math.round(lift);
      for (let yy = 0; yy < 4; yy++) {
        const x0 = bx - 1 + (yy >= 2 ? dx : 0);
        px(x0 - 1, topo + yy, tons[0]);
        px(x0, topo + yy, tons[3]);
        px(x0 + 1, topo + yy, tons[2]);
        px(x0 + 2, topo + yy, tons[1]);
        px(x0 + 3, topo + yy, tons[0]);
      }
      const x0 = bx - 1 + dx;
      for (let xx = -1; xx <= 3; xx++) px(x0 + xx, topo + 4, tons[0]);
      px(x0, topo + 5, "#f2eaff"); px(x0 + 2, topo + 5, "#f2eaff"); // garrinhas
    };
    const FUNDO = ["#24145a", "#3b2a86", "#4a3a9c", "#5848b0"];
    const FRENTE = ["#2e1a66", "#6450bf", "#8c78df", "#b6a6f3"];
    [8, 13, 18, 23].forEach((x, i) => perna(x + 2, 19, i * 1.6 + Math.PI, FUNDO));

    // corpo com luz suave (dithering só na passagem entre tons)
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (!dentro(cx, cy)) continue;
      const borda = !dentro(cx - 1, cy) || !dentro(cx + 1, cy) || !dentro(cx, cy - 1) || !dentro(cx, cy + 1);
      if (borda) { px(x, y, TONS[0]); continue; }
      let i = intensidade(cx, cy);
      // gomos: sulcos curvos no dorso
      for (const sx of [10.5, 15.5]) {
        const curva = sx + (cy - 12) * 0.25;
        if (Math.abs(cx - curva) < 0.55 && cy < 20) i *= 0.62;
      }
      const v = 1 + i * 3.1;
      let k = Math.floor(v);
      if (v - k > 0.35 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.4) k++;
      px(x, y, TONS[Math.max(1, Math.min(4, k))]);
    }
    // contorno interno de luz na barriga (luz refletida)
    for (let x = 8; x < 26; x++) {
      for (let y = LH - 1; y > 0; y--) if (dentro(x + 0.5, y + 0.5)) { if (dentro(x + 0.5, y - 1.5)) px(x, y - 1, TONS[2]); break; }
    }

    [8, 13, 18, 23].forEach((x, i) => perna(x, 20, i * 1.6, FRENTE));

    // olhão: 4x5, pupila escura, dois brilhos
    const ex = 28, ey = 9;
    const ESC = "#160b36";
    if (olho === "aberto") {
      const mapa = [".##.", "####", "####", "####", ".##."];
      mapa.forEach((l, j) => [...l].forEach((ch, i) => ch === "#" && px(ex + i, ey + j, ESC)));
      px(ex + 1, ey + 1, "#ffffff"); px(ex + 2, ey + 1, "#ffffff"); px(ex + 1, ey + 2, "#ffffff");
      px(ex + 2, ey + 3, "#7fdcff"); // reflexo azul
    } else if (olho === "feliz") {
      px(ex, ey + 3, ESC); px(ex + 1, ey + 2, ESC); px(ex + 2, ey + 2, ESC); px(ex + 3, ey + 3, ESC);
    } else {
      for (let i = 0; i < 4; i++) px(ex + i, ey + 3, ESC);
      px(ex - 1, ey + 2, ESC);
    }
    // sobrancelhinha, bochecha e boquinha redonda de tardígrado
    px(26, 16, "#ff8fc8"); px(27, 16, "#ff8fc8"); px(26, 17, "#ff6fae"); px(27, 17, "#ffb3dc");
    const mx = 33, my = 15;
    if (olho === "feliz") { px(mx, my, ESC); px(mx + 1, my + 1, ESC); px(mx, my + 1, "#ff6fae"); }
    else { px(mx, my, ESC); px(mx + 1, my, ESC); px(mx, my + 1, ESC); px(mx + 1, my + 1, "#4a2a6a"); }

    // capacete de vidro em volta da cabeça
    const hx = 27.5, hy = 12.5, r = 10;
    for (let y = 0; y < LH; y++) for (let x = 12; x < LW; x++) {
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
      if (d > r) continue;
      if (d > r - 1) g.fillStyle = x + 0.5 < hx - 4 ? "rgba(180, 240, 255, 0.45)" : "rgba(180, 240, 255, 0.8)";
      else if (!dentro(x + 0.5, y + 0.5)) g.fillStyle = "rgba(150, 225, 255, 0.12)";
      else continue;
      g.fillRect(x, y, 1, 1);
    }
    // reflexo do vidro
    g.fillStyle = "rgba(255, 255, 255, 0.95)";
    for (const [a, b] of [[3, -8], [4, -7], [5, -7], [6, -6], [7, -5], [7, -4]]) g.fillRect(Math.round(hx + a), Math.round(hy + b), 1, 1);
    g.fillStyle = "rgba(255, 255, 255, 0.6)";
    g.fillRect(Math.round(hx + 8), Math.round(hy - 2), 1, 1);

    if (pulo) {
      const d = document.createElement("canvas"); d.width = LW; d.height = LH;
      d.getContext("2d").drawImage(c, 0, -pulo); return d;
    }
    return c;
  }

  const andar = [0, 1, 2, 3].map((i) => quadro({ passo: (i / 4) * Math.PI * 2 }));
  return {
    andar,
    piscar: quadro({ olho: "fechado" }),
    feliz: [0, 1, 2, 3].map((i) => quadro({ passo: (i / 4) * Math.PI * 2, olho: "feliz" })),
    largura: LW,
    altura: LH,
  };
}
