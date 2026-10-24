// Satélite e Estação Espacial (ISS), desenhados pixel a pixel no mesmo estilo
// do tardígrado: poucos tons, luz de cima, sem contorno escuro (as bordas são
// o próprio tom, meio transparentes). A cena desenha um brilho leve em volta.
function criarNaves() {
  const tela = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  };
  // retângulo com volume: linha de cima clara, de baixo escura, cantos macios
  function bloco(g, x, y, w, h, [escuro, medio, claro, brilho]) {
    g.fillStyle = medio; g.fillRect(x, y, w, h);
    g.fillStyle = claro; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    if (brilho) { g.fillStyle = brilho; g.fillRect(x + 1, y, Math.max(1, Math.floor(w / 3)), 1); }
    g.fillStyle = escuro; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y + 1, 1, h - 1);
    // cantos meio transparentes: some o "recorte" duro
    g.clearRect(x, y, 1, 1); g.clearRect(x + w - 1, y, 1, 1);
    g.clearRect(x, y + h - 1, 1, 1); g.clearRect(x + w - 1, y + h - 1, 1, 1);
    g.globalAlpha = 0.5;
    g.fillStyle = claro; g.fillRect(x, y, 1, 1); g.fillRect(x + w - 1, y, 1, 1);
    g.fillStyle = escuro; g.fillRect(x, y + h - 1, 1, 1); g.fillRect(x + w - 1, y + h - 1, 1, 1);
    g.globalAlpha = 1;
  }
  // placa solar: faixas de células e um reflexo suave no alto
  function placa(g, x, y, w, h, tons) {
    bloco(g, x, y, w, h, [tons[0], tons[1], tons[2]]);
    g.globalAlpha = 0.7; g.fillStyle = tons[0];
    for (let i = x + 2; i < x + w - 1; i += 2) g.fillRect(i, y + 1, 1, h - 2);
    g.fillRect(x + 1, y + Math.floor(h / 2), w - 2, 1);
    g.globalAlpha = 0.45; g.fillStyle = tons[3];
    g.fillRect(x + 1, y + 1, w - 2, 1);
    g.globalAlpha = 1;
  }

  const OURO = ["#6b3a12", "#b06c24", "#e0a048", "#ffd890"]; // manta térmica dourada
  const PAINEL = ["#1a2a5a", "#2c4a8c", "#4a72b8", "#9fc4ff"]; // azul das placas
  const COBRE = ["#5a2c14", "#94521f", "#c98236", "#ffd08a"]; // placas da ISS (vistas do Sol, puxam pro dourado)
  const METAL = ["#5a6078", "#9aa2bc", "#d4dbee", "#ffffff"];
  const BRANCO = ["#8a92ac", "#d0d6e8", "#f2f4fc", "#ffffff"];

  // satélite (26 x 13): corpo dourado, duas asas azuis e uma antena-prato
  const satelite = tela(26, 13);
  {
    const g = satelite.getContext("2d");
    placa(g, 0, 3, 9, 7, PAINEL);
    placa(g, 17, 3, 9, 7, PAINEL);
    g.fillStyle = METAL[1]; g.fillRect(9, 6, 8, 1);
    bloco(g, 10, 2, 6, 9, OURO);
    g.fillStyle = OURO[0]; g.fillRect(11, 6, 4, 1); // dobra da manta
    g.fillStyle = METAL[2]; g.fillRect(12, 0, 2, 2);
    g.fillStyle = METAL[1]; g.fillRect(12, 11, 2, 2);
    g.fillStyle = METAL[3]; g.fillRect(12, 0, 1, 1);
  }

  // ISS (52 x 22): treliça comprida, 4 pares de placas, módulos brancos no meio
  const iss = tela(52, 22);
  {
    const g = iss.getContext("2d");
    for (const x of [1, 9, 36, 44]) {
      placa(g, x, 0, 7, 9, COBRE);
      placa(g, x, 13, 7, 9, COBRE);
      g.fillStyle = METAL[0]; g.fillRect(x + 3, 9, 1, 4);
    }
    bloco(g, 0, 10, 52, 2, METAL);
    // módulos
    bloco(g, 19, 7, 14, 7, BRANCO);
    g.fillStyle = BRANCO[0]; g.fillRect(25, 8, 1, 5);
    bloco(g, 24, 3, 4, 15, BRANCO);
    bloco(g, 16, 8, 3, 5, METAL);
    bloco(g, 33, 8, 3, 5, METAL);
    // radiadores brancos, finos
    bloco(g, 21, 15, 2, 5, BRANCO);
    bloco(g, 29, 15, 2, 5, BRANCO);
  }
  // esfera com luz de cima à esquerda, poucos tons e dithering, sem contorno
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  function esferaMini(g, cx, cy, r, tons, extra) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d);
      let t = Math.max(0, -nx * 0.5 - ny * 0.6 + nz * 0.62) * (tons.length - 0.6);
      if (extra) t += extra(x, y, nx, ny);
      let k = Math.floor(t);
      if (t - k > BAYER[(y & 3) * 4 + (x & 3)]) k++;
      g.globalAlpha = d > 0.82 ? 0.75 : 1; // borda macia
      g.fillStyle = tons[Math.max(0, Math.min(tons.length - 1, k))];
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
  }

  // lua pequena com crateras (faixa comum)
  const lua = tela(11, 11);
  {
    const g = lua.getContext("2d");
    const crateras = [[3.5, 4, 1.4], [6.8, 6.6, 1.2], [4.8, 7.8, 0.9]];
    esferaMini(g, 5.5, 5.5, 5.2, ["#2a5470", "#4a8cb0", "#8ac8e4", "#d4f2ff"], (x, y) =>
      crateras.some(([a, b, r]) => (x + 0.5 - a) ** 2 + (y + 0.5 - b) ** 2 < r * r) ? -1 : 0);
  }

  // planetinha com anel (faixa incomum): o anel passa atrás e na frente
  const planeta = tela(19, 11);
  {
    const g = planeta.getContext("2d");
    const anel = (frente) => {
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * Math.PI * 2;
        const x = 9.5 + Math.cos(a) * 8.6, y = 5.5 + Math.sin(a) * 2.2;
        if ((Math.sin(a) > 0) !== frente) continue;
        g.fillStyle = Math.sin(a) > 0 ? "#fff0a8" : "#b8902a";
        g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
    };
    anel(false);
    esferaMini(g, 9.5, 5.5, 4.6, ["#7a5410", "#b8861e", "#ffd23f", "#fff0a0"], (x, y) => (y % 3 === 0 ? -0.6 : 0));
    anel(true);
  }

  // cabeça do cometa (faixa rara); a cauda a cena desenha ao longo da órbita
  const cometa = tela(9, 9);
  esferaMini(cometa.getContext("2d"), 4.5, 4.5, 4.1, ["#4a2a8a", "#8a5ae0", "#c38bff", "#f4e8ff"]);

  // Voyager (30 x 18): a antena grande em prato, o corpo dourado e as hastes finas
  const voyager = tela(30, 18);
  {
    const g = voyager.getContext("2d");
    // hastes: magnetômetro comprido para a esquerda, gerador (RTG) para baixo à direita
    g.fillStyle = METAL[1]; g.fillRect(0, 10, 13, 1);
    g.fillStyle = METAL[2]; g.fillRect(0, 10, 4, 1);
    g.fillStyle = METAL[1]; g.fillRect(16, 12, 1, 5); g.fillRect(17, 16, 6, 1);
    bloco(g, 22, 15, 4, 3, METAL);
    // corpo
    bloco(g, 12, 9, 7, 5, OURO);
    // prato da antena (visto meio de lado): elipse clara com sombra embaixo
    for (let y = 0; y < 10; y++) for (let x = 6; x < 26; x++) {
      const nx = (x + 0.5 - 15.5) / 9.6, ny = (y + 0.5 - 4.8) / 4.6, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const t = d > 0.72 ? (ny < 0 ? 3 : 1) : ny < -0.2 ? 2 : 1;
      g.globalAlpha = d > 0.85 ? 0.8 : 1;
      g.fillStyle = BRANCO[t];
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
    g.fillStyle = BRANCO[0]; g.fillRect(15, 4, 2, 2); // receptor no meio do prato
  }

  // Pilares da Criação: nebulosa difusa, no estilo da foto do Hubble. Colunas de poeira
  // marrom-avermelhada com bordas acesas, gás azul-esverdeado em volta e estrelas.
  // Sai suave (sem pixel duro) e meio transparente: a cena desenha bem grande, misturado ao fundo.
  const pilares = tela(220, 280);
  {
    const W = 220, H = 280;
    const g = pilares.getContext("2d");
    const hash = (k, j) => { const v = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };
    const mancha = (x, y, r, cor, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${cor}, ${a})`);
      gr.addColorStop(1, `rgba(${cor}, 0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // gás: manchas grandes e macias, verde-azulado no meio, dourado em cima e embaixo
    for (let k = 0; k < 40; k++) {
      const x = 20 + hash(k, 1) * (W - 40), y = 20 + hash(k, 2) * (H - 40);
      const cor = y < H * 0.25 ? "205, 170, 110" : y > H * 0.8 ? "190, 150, 90" : hash(k, 3) < 0.5 ? "60, 140, 150" : "40, 100, 140";
      mancha(x, y, 30 + hash(k, 4) * 50, cor, 0.1 + hash(k, 5) * 0.12);
    }
    // contorno torto de cada coluna (de baixo para cima), como fumaça endurecida
    const colunas = [[62, 54, 250, 0.17, 1], [130, 40, 196, 0.1, 2], [178, 30, 140, -0.05, 3]];
    const caminho = (bx, larg, alt, incl, sem, dx = 0, dy = 0) => {
      g.beginPath();
      const pts = [];
      for (let k = 0; k <= alt; k += 4) {
        const f = k / alt;
        // a coluna da esquerda tem a "cabeça" mais larga no alto, como na foto
        const cabeca = sem === 1 ? 1 + 0.4 * Math.max(0, 1 - Math.abs(f - 0.84) / 0.1) : 1;
        const w = larg * 0.5 * (1 - f * 0.5) * cabeca * (f > 0.9 ? Math.sqrt(Math.max(0, (1 - f) / 0.1)) : 1);
        const cx = bx + k * incl + Math.sin(k * 0.031 + sem) * 4 + Math.sin(k * 0.09 + sem * 2) * 2;
        const irreg = (a) => 1 + Math.sin(k * 0.13 + a) * 0.1 + Math.sin(k * 0.37 + a * 2) * 0.07 + Math.sin(k * 0.83 + a * 3) * 0.05;
        const wl = w * irreg(sem * 3), wr = w * irreg(sem * 5 + 1);
        pts.push([cx - wl, H - k, cx + wr]);
      }
      g.moveTo(pts[0][0] + dx, pts[0][1] + dy);
      for (const p of pts) g.lineTo(p[0] + dx, p[1] + dy);
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][2] + dx, pts[i][1] + dy);
      g.closePath();
    };
    for (const [bx, larg, alt, incl, sem] of colunas) {
      // brilho da borda (a luz das estrelas que bate de cima e da esquerda)
      g.save();
      g.shadowColor = "rgba(255, 220, 170, 0.8)";
      g.shadowBlur = 12;
      caminho(bx, larg, alt, incl, sem, -1.5, -2);
      g.fillStyle = "rgba(240, 200, 150, 0.4)";
      g.fill();
      g.restore();
      // corpo: poeira marrom-avermelhada, mais escura embaixo
      caminho(bx, larg, alt, incl, sem);
      const gr = g.createLinearGradient(0, H - alt, 0, H);
      gr.addColorStop(0, "rgba(128, 80, 60, 0.85)");
      gr.addColorStop(0.5, "rgba(92, 52, 40, 0.85)");
      gr.addColorStop(1, "rgba(56, 30, 28, 0.8)");
      g.fillStyle = gr;
      g.fill();
      // textura: manchas escuras e claras só dentro da coluna
      g.save();
      caminho(bx, larg, alt, incl, sem);
      g.clip();
      // luz vindo da esquerda: lado esquerdo mais claro, direito na sombra
      const lado = g.createLinearGradient(bx - larg * 0.6, 0, bx + larg * 0.6 + alt * incl * 0.5, 0);
      lado.addColorStop(0, "rgba(255, 205, 160, 0.2)");
      lado.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      lado.addColorStop(1, "rgba(10, 4, 10, 0.5)");
      g.fillStyle = lado;
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 26; k++) {
        const yy = H - hash(k, sem) * alt, xx = bx + (H - yy) * incl + (hash(k, sem + 9) - 0.5) * larg;
        mancha(xx, yy, 6 + hash(k, sem + 4) * 14, hash(k, sem + 7) < 0.6 ? "50, 24, 20" : "190, 130, 90", 0.35);
      }
      g.restore();
      // ponta acesa
      mancha(bx + alt * incl + Math.sin(alt * 0.045 + sem) * 6, H - alt + 6, 14, "255, 230, 190", 0.55);
    }
    // estrelas com brilho em cruz, como na foto
    for (let k = 0; k < 22; k++) {
      const x = hash(k, 21) * W, y = hash(k, 22) * H, r = 0.6 + hash(k, 23) * 1.4;
      mancha(x, y, r * 4, "255, 236, 220", 0.9);
      if (r > 1.5) { g.fillStyle = "rgba(255, 230, 220, 0.45)"; g.fillRect(x - r * 6, y - 0.4, r * 12, 0.8); g.fillRect(x - 0.4, y - r * 6, 0.8, r * 12); }
    }
    // some nas bordas: nenhum recorte de "quadro"
    g.globalCompositeOperation = "destination-in";
    const fade = g.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.28, W / 2, H * 0.5, Math.max(W, H) * 0.62);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);
    // a base das colunas some aos poucos no gás, sem linha de corte
    const base = g.createLinearGradient(0, H * 0.7, 0, H);
    base.addColorStop(0, "rgba(0,0,0,1)");
    base.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  }

  // Nebulosa de Órion: nuvem macia rosa e avermelhada, com um "buraco" azul-esverdeado
  // iluminado no meio e as quatro estrelinhas do Trapézio. Sem pixel duro, some nas bordas.
  const orion = tela(240, 180);
  {
    const W = 240, H = 180;
    const g = orion.getContext("2d");
    const hash = (k, j) => { const v = Math.sin(k * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };
    const mancha = (x, y, r, cor, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${cor}, ${a})`);
      gr.addColorStop(1, `rgba(${cor}, 0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    // asas de gás em arco, como a forma de "pássaro" da foto
    for (let k = 0; k < 70; k++) {
      const t = hash(k, 1) * Math.PI * 1.6 - Math.PI * 0.3;
      const raio = 45 + hash(k, 2) * 50;
      const x = W / 2 + Math.cos(t) * raio * 1.2, y = H / 2 + Math.sin(t) * raio * 0.75;
      const cor = hash(k, 3) < 0.55 ? "220, 80, 130" : hash(k, 3) < 0.85 ? "180, 60, 90" : "240, 150, 120";
      mancha(x, y, 16 + hash(k, 4) * 34, cor, 0.16 + hash(k, 5) * 0.16);
    }
    // miolo claro azul-esverdeado
    mancha(W / 2, H / 2, 60, "110, 200, 210", 0.4);
    mancha(W / 2 - 6, H / 2 - 4, 30, "200, 240, 230", 0.3);
    // filamentos escuros de poeira por cima
    g.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 14; k++) {
      mancha(W / 2 + (hash(k, 7) - 0.5) * 180, H / 2 + (hash(k, 8) - 0.3) * 120, 10 + hash(k, 9) * 18, "0,0,0", 0.35);
    }
    g.globalCompositeOperation = "source-over";
    // Trapézio: quatro estrelas no meio
    for (const [dx, dy] of [[-4, -3], [4, -2], [-2, 4], [5, 5]]) {
      mancha(W / 2 + dx, H / 2 + dy, 2.5, "255, 255, 255", 1);
    }
    for (let k = 0; k < 14; k++) mancha(hash(k, 11) * W, hash(k, 12) * H, 2 + hash(k, 13) * 2, "255, 240, 230", 0.8);
    // some nas bordas
    g.globalCompositeOperation = "destination-in";
    const fade = g.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 120);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  }

  // Buraco negro (estilo Gargântua): disco de acreção achatado e brilhante, anel de luz
  // em volta da sombra e o miolo preto. Suave, para virar pano de fundo.
  const buraco = tela(320, 200);
  {
    const W = 320, H = 200, cx = W / 2, cy = H / 2, R = 34;
    const g = buraco.getContext("2d");
    const halo = g.createRadialGradient(cx, cy, R, cx, cy, 150);
    halo.addColorStop(0, "rgba(255, 130, 40, 0.55)");
    halo.addColorStop(1, "rgba(255, 120, 40, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    // disco achatado (atrás e na frente)
    const disco = (frente) => {
      g.save();
      g.translate(cx, cy);
      g.scale(1, 0.22);
      for (let r = R * 1.3; r < R * 4.2; r += 1.2) {
        const k = 1 - (r - R * 1.3) / (R * 2.9);
        g.strokeStyle = `rgba(255, ${Math.round(110 + 110 * k)}, ${Math.round(20 + 120 * k)}, ${0.15 + 0.6 * k})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.arc(0, 0, r, frente ? 0 : Math.PI, frente ? Math.PI : Math.PI * 2);
        g.stroke();
      }
      g.restore();
    };
    disco(false);
    // a luz do disco que passa por cima e por baixo da sombra (o "arco" do filme)
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.95);
    for (let r = R * 1.05; r < R * 1.6; r += 1) {
      const k = 1 - (r - R * 1.05) / (R * 0.55);
      g.strokeStyle = `rgba(255, ${Math.round(150 + 80 * k)}, ${Math.round(50 + 120 * k)}, ${0.2 + 0.65 * k})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    // sombra
    const sombra = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.05);
    sombra.addColorStop(0, "rgba(0, 0, 0, 1)");
    sombra.addColorStop(0.7, "rgba(0, 0, 0, 1)");
    sombra.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = sombra;
    g.beginPath();
    g.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
    g.fill();
    disco(true);
  }

  return { satelite, iss, lua, planeta, cometa, voyager, pilares, orion, buraco };
}
