// Tardígrado mascote (36x22), desenhado pixel a pixel por código.
// Corpo em barril com cinco gomos, cabeça rombuda com o focinho em tubo e
// 8 patinhas curtas com garras. Luz quente de cima (o mesmo laranja do brilho
// da cena) e um contraluz frio de estrela por baixo, que separa o bicho do fundo.
// Sem contorno preto: a borda é o próprio tom do corpo, e o brilho quente em
// volta é desenhado na cena. Olha para a direita; a cena espelha.
function criarTardigrado() {
  const LW = 36, LH = 22;
  const MARROM = ["#2a1208", "#4a220f", "#6e3518", "#934d24", "#b8692f", "#d58a48", "#ecb072", "#fbd9a8"];
  // dourado: depois de achar uma supernova, ele fica assim pelo resto do dia
  const OURO = ["#3d2604", "#6a4609", "#9a6b10", "#c8961c", "#e6bb33", "#f7d75c", "#ffeb96", "#fff8d6"];
  let TONS = MARROM;
  let ARO = "#8fc4ff"; // contraluz frio, de baixo
  const GARRA = "#f6e3c8";
  const OLHO = "#140803";
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const ruido = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  const CORPO = { cx: 15.5, cy: 10.0, rx: 13.4, ry: 6.8 };
  const CABECA = { cx: 29.6, cy: 10.6, rx: 5.0, ry: 4.7 };
  const FOCINHO = { cx: 34.0, cy: 11.8, rx: 1.7, ry: 1.6 };
  const DOBRAS = [7.6, 12.6, 17.6, 22.4, 26.0];
  const se = (x, y, e, p = 2.5) => 1 - Math.abs((x - e.cx) / e.rx) ** p - Math.abs((y - e.cy) / e.ry) ** p;
  const afundaEm = (x) => {
    let a = 0;
    for (const d of DOBRAS) a = Math.max(a, Math.max(0, 1 - Math.abs(x - d) / 1.2) * 0.75);
    return a;
  };
  // qual forma manda em cada ponto (corpo, cabeça ou focinho) e o quanto está dentro
  const forma = (x, y) => {
    const yy = y < CORPO.cy ? y - afundaEm(x) : y; // dorso com gomos: cada dobra afunda o contorno de cima
    const c = se(x, yy, CORPO, 2.15), h = se(x, y, CABECA, 2.2), f = se(x, y, FOCINHO, 2);
    if (f >= c && f >= h) return { v: f, e: FOCINHO };
    return h > c ? { v: h, e: CABECA } : { v: c, e: CORPO };
  };
  const dentro = (x, y) => forma(x, y).v >= 0;
  // luz quente vindo de cima e um pouco de trás-frente
  const LUZ = (() => { const l = [-0.25, -0.8, 0.55], n = Math.hypot(...l); return l.map((v) => v / n); })();

  function quadro(passo, olhar) {
    const c = document.createElement("canvas");
    c.width = LW; c.height = LH;
    const g = c.getContext("2d");
    const px = (x, y, cor, a = 1) => {
      if (x < 0 || y < 0 || x >= LW || y >= LH) return;
      g.globalAlpha = a; g.fillStyle = cor; g.fillRect(x, y, 1, 1); g.globalAlpha = 1;
    };

    // patinha: toco de 3 px que afina, com duas garras curvas na ponta
    const pata = (bx, by, fase, longe) => {
      const s = Math.sin(passo + fase);
      const ergue = s > 0.3 ? 1 : 0;
      const dx = Math.round(Math.cos(passo + fase) * 1.2);
      const t0 = longe ? 1 : 3; // tom base (as de longe ficam na sombra)
      const fim = by + 3 - ergue;
      for (let y = by; y <= fim; y++) {
        const desl = y >= fim - 1 ? dx : 0;
        const largo = y === fim ? 2 : 3;
        for (let i = 0; i < largo; i++) {
          let t = t0 + (i === 0 ? 1 : i === 2 ? -1 : 0) - (y === by && !longe ? 1 : 0);
          if (y === fim && i === 1) t -= 1;
          px(bx + desl + i, y, TONS[Math.max(0, Math.min(7, t))]);
        }
      }
      // garras viradas para a frente (para a direita)
      const gx = bx + dx + 1, gy = fim + 1;
      px(gx, gy, longe ? "#a88a70" : GARRA, longe ? 0.55 : 0.95);
      px(gx + 1, gy, longe ? "#a88a70" : GARRA, longe ? 0.4 : 0.8);
      if (!longe) px(gx + 2, gy - 1, GARRA, 0.55);
    };

    // par de longe, atrás do corpo
    [9, 14, 19, 24].forEach((x, i) => pata(x + 1, 14, i * 1.7 + Math.PI, true));

    // corpo e cabeça, com volume
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const { v, e } = forma(cx, cy);
      if (v < 0) {
        if (v > -0.18 && dentro(cx, cy + 1)) px(x, y, TONS[4], 0.3); // borda de cima esfumada
        continue;
      }
      let nx = (cx - e.cx) / e.rx, ny = (cy - e.cy) / e.ry;
      const r = Math.hypot(nx, ny);
      if (r > 0.98) { nx /= r / 0.98; ny /= r / 0.98; }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let lam = nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2];
      let t = 1.0 + Math.max(0, lam) * 5.4 + (ny < -0.6 ? 0.4 : 0);
      if (e === CORPO) {
        // cada gomo estufa: sulco escuro na dobra, um brilho logo atrás dela
        for (const d of DOBRAS) {
          const dist = cx - d - (cy - 6) * 0.15;
          if (Math.abs(dist) < 0.55 && cy < 15.5) t -= 1.6 - Math.max(0, ny) * 0.8;
          else if (dist > -1.9 && dist < -0.55 && cy < 9.5) t += 0.6;
        }
        // textura da cutícula: pintinhas no dorso
        if (ny < 0.35 && ruido(x, y) < 0.1) t -= 0.9;
        if (ny < -0.2 && ruido(x + 7, y) < 0.05) t += 0.8;
      }
      if (e === CABECA && x < 26) t -= 0.5; // pescoço: a cabeça faz sombra no primeiro gomo
      let k = Math.floor(t);
      if (t - k > 0.25 + BAYER4[(y & 3) * 4 + (x & 3)] * 0.5) k++;
      k = Math.max(0, Math.min(7, k));
      const baixo = !dentro(cx, cy + 1), cima = !dentro(cx, cy - 1);
      const lado = !dentro(cx - 1, cy) || !dentro(cx + 1, cy);
      if (baixo || (lado && ny > 0)) k = Math.max(0, k - 1);
      px(x, y, TONS[k], cima || lado ? 0.8 : 1);
      // contraluz frio na barriga: uma linha fina de estrela
      if (e === CORPO && ny > 0.6 && baixo && ruido(x, 3) > 0.3) px(x, y, ARO, 0.55);
    }

    // par de perto, na frente do corpo
    [7, 12, 17, 22].forEach((x, i) => pata(x, 15, i * 1.7, false));
    // par de trás, saindo do fim do corpo, virado para trás
    const r = Math.sin(passo + 0.8) > 0.3 ? 1 : 0;
    px(3, 13, TONS[3]); px(4, 13, TONS[2]); px(2, 14, TONS[4]); px(3, 14, TONS[2]);
    px(1, 15 - r, TONS[3]); px(2, 15 - r, TONS[1]);
    px(0, 16 - r, GARRA, 0.85); px(1, 16 - r, GARRA, 0.55);

    // focinho em tubo: a boquinha redonda na ponta
    px(35, 11, TONS[2]); px(35, 12, OLHO, 0.9); px(34, 13, TONS[2], 0.8);
    px(34, 10, TONS[6], 0.7);

    // olho: 2x2 escuro com um pontinho de luz; fechado vira um tracinho
    if (olhar === "piscar") {
      px(30, 9, TONS[1]); px(31, 9, TONS[1]);
    } else if (olhar === "feliz") {
      px(29, 9, OLHO, 0.9); px(30, 8, OLHO); px(31, 8, OLHO); px(32, 9, OLHO, 0.9);
    } else {
      px(30, 8, "#fff6e6"); px(31, 8, OLHO); px(30, 9, OLHO); px(31, 9, OLHO);
      px(32, 9, OLHO, 0.35);
    }
    // bochecha rosada, bem de leve
    px(31, 11, "#ff8a7a", 0.4); px(32, 11, "#ff8a7a", 0.3);
    return c;
  }

  const jogo = (tons, aro) => {
    TONS = tons; ARO = aro;
    const andar = [0, 1, 2, 3].map((i) => quadro((i / 4) * Math.PI * 2, "aberto"));
    const feliz = [0, 1, 2, 3].map((i) => quadro((i / 4) * Math.PI * 2, "feliz"));
    return { andar, feliz, piscar: quadro(0, "piscar") };
  };
  const normal = jogo(MARROM, "#a8d4ff");
  const dourado = jogo(OURO, "#ffffff");
  TONS = MARROM;
  return { ...normal, dourado, largura: LW, altura: LH };
}
