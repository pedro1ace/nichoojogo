// Sons 8-bit gerados na hora (Web Audio), sem arquivos de áudio.
// O navegador só deixa tocar som depois de um clique, então Som.ligar()
// é chamado no botão de começar.

const Som = (() => {
  let ac = null;
  let mestre = null;
  let ambiente = null;
  let mudo = false;
  try {
    mudo = localStorage.getItem("nicho:mudo") === "1";
  } catch {}

  function ligar() {
    // o navegador cria o áudio "pausado": no clique a gente destrava
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    ac = new Contexto();
    mestre = ac.createGain();
    mestre.gain.value = mudo ? 0 : 0.5;
    mestre.connect(ac.destination);
    if (ac.state === "suspended") ac.resume();
    criarAmbiente();
  }

  // Zumbido grave e calmo de fundo, que fica mais grave conforme desce.
  // Só toca durante a viagem (some na tela inicial e no fim). Nota e oitava,
  // sem notas vizinhas: duas notas graves próximas "batem" e viram um tutututu chato.
  const BASE_AMBIENTE = [55, 110];
  const VOLUME_AMBIENTE = 0.014;
  function criarAmbiente() {
    const filtro = ac.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 180;
    const ganho = ac.createGain();
    ganho.gain.value = 0;
    const osc = BASE_AMBIENTE.map((f) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(filtro);
      o.start();
      return o;
    });
    const lfo = ac.createOscillator();
    const lfoGanho = ac.createGain();
    lfo.frequency.value = 0.07;
    lfoGanho.gain.value = 50;
    lfo.connect(lfoGanho).connect(filtro.frequency);
    lfo.start();
    filtro.connect(ganho).connect(mestre);
    ambiente = { osc, filtro, ganho };
  }

  function tom(freq, duracao, { tipo = "square", volume = 0.12, atraso = 0, ate = null } = {}) {
    if (!ac) return;
    const t = ac.currentTime + atraso;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + duracao);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
    o.connect(g).connect(mestre);
    o.start(t);
    o.stop(t + duracao + 0.05);
  }

  function ruido(duracao, { volume = 0.1, de = 2000, ate = 200 } = {}) {
    if (!ac) return;
    const t = ac.currentTime;
    const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * duracao), ac.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    const fonte = ac.createBufferSource();
    fonte.buffer = buffer;
    const filtro = ac.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.setValueAtTime(de, t);
    filtro.frequency.exponentialRampToValueAtTime(ate, t + duracao);
    const g = ac.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
    fonte.connect(filtro).connect(g).connect(mestre);
    fonte.start(t);
  }

  // Céu da tela inicial: vento lá no alto + bipes de satélite bem baixinhos.
  let ceu = null;
  function ligarCeu() {
    if (!ac || ceu) return;
    const saida = ac.createGain();
    saida.gain.setValueAtTime(0.0001, ac.currentTime);
    saida.gain.exponentialRampToValueAtTime(1, ac.currentTime + 2);
    saida.connect(mestre);
    // vento: ruído em loop, filtrado, com a "rajada" subindo e descendo devagar
    const buf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const d = buf.getChannelData(0);
    let ult = 0;
    for (let i = 0; i < d.length; i++) { ult = ult * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = ult * 6; }
    const vento = ac.createBufferSource();
    vento.buffer = buf;
    vento.loop = true;
    const filtro = ac.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.value = 420;
    filtro.Q.value = 0.8;
    const gv = ac.createGain();
    gv.gain.value = 0.05;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoG = ac.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(filtro.frequency);
    const lfo2 = ac.createOscillator();
    lfo2.frequency.value = 0.07;
    const lfo2G = ac.createGain();
    lfo2G.gain.value = 0.03;
    lfo2.connect(lfo2G).connect(gv.gain);
    vento.connect(filtro).connect(gv).connect(saida);
    vento.start(); lfo.start(); lfo2.start();
    // bipes: o "bip... bip..." clássico de satélite e, às vezes, um chiado de dados
    const bip = (f, dur, atraso, vol = 0.022) => {
      const t = ac.currentTime + atraso;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.setValueAtTime(vol, t + dur - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(saida);
      o.start(t); o.stop(t + dur + 0.05);
    };
    let n = 0;
    const relogio = setInterval(() => {
      n++;
      bip(1480, 0.14, 0);
      if (n % 2 === 0) bip(1480, 0.14, 0.5);
      if (n % 5 === 0) for (let k = 0; k < 9; k++) bip(1800 + Math.random() * 1200, 0.035, 0.9 + k * 0.045, 0.012);
    }, 1600);
    ceu = { saida, fontes: [vento, lfo, lfo2], relogio };
  }
  function desligarCeu() {
    if (!ceu) return;
    const c = ceu;
    ceu = null;
    clearInterval(c.relogio);
    c.saida.gain.setTargetAtTime(0.0001, ac.currentTime, 0.4);
    setTimeout(() => c.fontes.forEach((f) => f.stop()), 2500);
  }

  // liga ou desliga o zumbido de fundo devagar (constante de tempo em segundos)
  function fundo(ligado, suave = 0.6) {
    if (!ambiente) return;
    ambiente.ganho.gain.cancelScheduledValues(ac.currentTime);
    ambiente.ganho.gain.setTargetAtTime(ligado ? VOLUME_AMBIENTE : 0, ac.currentTime, suave);
  }

  const NOTAS = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]; // dó maior subindo

  return {
    ligar,
    fundo,
    estaMudo: () => mudo,
    alternar() {
      mudo = !mudo;
      try {
        localStorage.setItem("nicho:mudo", mudo ? "1" : "0");
      } catch {}
      if (mestre) mestre.gain.setTargetAtTime(mudo ? 0 : 0.5, ac.currentTime, 0.05);
      return mudo;
    },
    ceu(ligado) {
      if (ligado) ligarCeu();
      else desligarCeu();
    },
    // clique do botão de iniciar: um "tuc" curto e claro
    clique() {
      tom(660, 0.06, { tipo: "square", volume: 0.07 });
      tom(1320, 0.08, { tipo: "triangle", volume: 0.06, atraso: 0.04 });
    },
    // Sons de interface das janelas (jogo/janelas.js): baixinhos, só para o ouvido saber
    // que algo abriu, fechou ou deu certo. Ficam bem abaixo dos sons da viagem.
    // abrir: dois "tic" subindo e um sopro curto, como uma janela de computador antigo
    janelaAbrir() {
      if (!ac) return;
      ruido(0.14, { volume: 0.018, de: 700, ate: 3400 });
      tom(784, 0.045, { tipo: "square", volume: 0.022 });
      tom(1175, 0.07, { tipo: "triangle", volume: 0.03, atraso: 0.045 });
    },
    // fechar: o mesmo, descendo
    janelaFechar() {
      if (!ac) return;
      ruido(0.11, { volume: 0.014, de: 3000, ate: 600 });
      tom(1047, 0.045, { tipo: "triangle", volume: 0.026 });
      tom(659, 0.07, { tipo: "square", volume: 0.018, atraso: 0.04 });
    },
    // deu certo (login, apelido salvo, código copiado): um "tlin-tlim" curto de confirmação
    confirmar() {
      if (!ac) return;
      tom(1319, 0.06, { tipo: "square", volume: 0.022 });
      tom(1976, 0.26, { tipo: "triangle", volume: 0.04, atraso: 0.075 });
      tom(3951, 0.18, { tipo: "sine", volume: 0.01, atraso: 0.075 }); // brilho
    },
    // ligar ou desligar uma chave das opções: um clique seco, mais agudo ao ligar
    chave(ligada) {
      if (!ac) return;
      tom(ligada ? 1480 : 990, 0.035, { tipo: "square", volume: 0.022 });
      tom(ligada ? 2217 : 740, 0.04, { tipo: "triangle", volume: 0.018, atraso: 0.03 });
    },
    // passar o mouse no botão de jogar: um "tuuuuu" grave e espacial, bem baixinho
    pairar() {
      if (!ac) return;
      const t = ac.currentTime;
      const o = ac.createOscillator(), o2 = ac.createOscillator();
      const vib = ac.createOscillator(), vg = ac.createGain();
      const g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = "sine"; o2.type = "triangle";
      o.frequency.setValueAtTime(92, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
      o2.frequency.setValueAtTime(184.6, t); o2.frequency.exponentialRampToValueAtTime(140.8, t + 0.9);
      vib.frequency.value = 5.5; vg.gain.value = 2.5;
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      f.type = "lowpass"; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.9);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(f); o2.connect(f); f.connect(g).connect(mestre);
      [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + 1.05); });
    },
    // clique no botão de jogar: "KATCHIN!" — estalo metálico, arpejo rápido e um brilho que fica ecoando
    katchin() {
      if (!ac) return;
      ruido(0.07, { volume: 0.22, de: 5200, ate: 1800 }); // "ka"
      tom(196, 0.09, { tipo: "square", volume: 0.1, ate: 98 }); // pancada grave
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tom(f, 0.12, { tipo: "square", volume: 0.06, atraso: 0.05 + i * 0.035 })); // "tchi"
      // "iiin": dois sinos levemente desafinados que brilham e somem devagar
      [[2637, 0], [2649, 0], [3951, 0.02], [5274, 0.04]].forEach(([f, a], i) =>
        tom(f, 1.4 - i * 0.2, { tipo: "sine", volume: i < 2 ? 0.07 : 0.035, atraso: 0.19 + a }));
      ruido(0.5, { volume: 0.05, de: 9000, ate: 6000 }); // faísca
    },
    tecla: () => tom(1800 + Math.random() * 400, 0.025, { volume: 0.03 }),
    erro: () => {
      tom(160, 0.18, { tipo: "sawtooth", volume: 0.08 });
      tom(120, 0.22, { tipo: "sawtooth", volume: 0.06, atraso: 0.08 });
    },
    sugestao: () => tom(880, 0.08, { tipo: "triangle", volume: 0.08, ate: 1175 }),
    // troca de skin: um "vuuu" descendo (o antigo se desfaz) e um brilho subindo (o novo aparece)
    materializar() {
      if (!ac) return;
      tom(1200, 0.35, { tipo: "triangle", volume: 0.05, ate: 300 });
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tom(f, 0.09, { tipo: "square", volume: 0.045, atraso: 0.42 + i * 0.06 }));
      tom(2093, 0.25, { tipo: "triangle", volume: 0.035, atraso: 0.75 });
    },
    // tempo esgotado com a Laika: um "uf" abafado e um chorinho "iiinn" descendo, bem baixinho
    latidoTriste() {
      if (!ac) return;
      const t0 = ac.currentTime;
      // "uf": sopro curto e um tom que cai, passando por um filtro de boca fechada
      const latido = (t, f0, f1, dura, vol) => {
        const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dura);
        fl.type = "lowpass"; fl.frequency.setValueAtTime(1400, t); fl.frequency.exponentialRampToValueAtTime(500, t + dura); fl.Q.value = 6;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
        o.connect(fl).connect(g).connect(mestre);
        o.start(t); o.stop(t + dura + 0.05);
      };
      latido(t0, 560, 330, 0.11, 0.045);
      // "iiinn": chorinho fino que desce tremendo (vibrato), duas vezes, a segunda mais curta
      const choro = (t, f0, f1, dura, vol) => {
        const o = ac.createOscillator(), g = ac.createGain(), fl = ac.createBiquadFilter();
        const vib = ac.createOscillator(), vg = ac.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dura);
        vib.frequency.value = 7.5; vg.gain.value = f0 * 0.025;
        vib.connect(vg).connect(o.frequency);
        fl.type = "lowpass"; fl.frequency.value = 1800;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
        g.gain.setValueAtTime(vol, t + dura * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
        o.connect(fl).connect(g).connect(mestre);
        [o, vib].forEach((x) => { x.start(t); x.stop(t + dura + 0.05); });
      };
      choro(t0 + 0.2, 980, 640, 0.55, 0.03);
      choro(t0 + 0.85, 860, 560, 0.4, 0.022);
    },
    tique: (urgente) => tom(urgente ? 1400 : 1000, 0.04, { volume: urgente ? 0.07 : 0.04 }),
    // pergunta nova chegou: "pi-pi-plim!" de radar, três notas rápidas subindo e um brilho no fim
    pergunta() {
      if (!ac) return;
      tom(783.99, 0.07, { tipo: "square", volume: 0.07 });
      tom(1046.5, 0.07, { tipo: "square", volume: 0.07, atraso: 0.075 });
      tom(1568, 0.32, { tipo: "square", volume: 0.065, atraso: 0.15 });
      tom(3136, 0.5, { tipo: "sine", volume: 0.035, atraso: 0.15 }); // brilho
      tom(1568, 0.3, { tipo: "triangle", volume: 0.02, atraso: 0.33 }); // eco
    },
    contagem: (ultimo) => tom(ultimo ? 880 : 440, ultimo ? 0.25 : 0.12, { tipo: "triangle", volume: 0.1 }),
    // buraco negro: um "wooon" grave que desce oscilando, com um zap de laser
    buraco() {
      tom(180, 1.8, { tipo: "sawtooth", volume: 0.09, ate: 35 });
      tom(90, 2.2, { tipo: "sine", volume: 0.16, ate: 28 });
      tom(1400, 0.5, { tipo: "square", volume: 0.05, ate: 90 });
      ruido(1.6, { volume: 0.08, de: 3000, ate: 80 });
    },
    // início da viagem: um "fuuuum" que sobe e um brilho de três notas, ecoando no espaço
    inicio() {
      fundo(true, 1);
      ruido(1.4, { volume: 0.06, de: 300, ate: 3200 });
      tom(110, 1.2, { tipo: "sine", volume: 0.16, ate: 440 });
      [523.25, 783.99, 1046.5].forEach((f, i) => {
        tom(f, 0.9, { tipo: "triangle", volume: 0.12, atraso: 0.35 + i * 0.12 });
        tom(f, 0.9, { tipo: "triangle", volume: 0.025, atraso: 0.65 + i * 0.12 }); // eco
      });
      tom(65.4, 2.2, { tipo: "sine", volume: 0.09, atraso: 0.9, ate: 55 }); // grave que segura a descida
    },
    // descida: um "vuuum" mais longo e grave quanto mais rara a resposta
    descer(peso) {
      ruido(0.6 + peso * 1.8, { volume: 0.05 + peso * 0.12, de: 2400, ate: 120 + (1 - peso) * 400 });
      tom(220, 0.5 + peso * 1.5, { tipo: "sine", volume: 0.08, ate: 60 });
    },
    // acorde da faixa: mais notas para faixas mais raras
    faixa(nivel) {
      for (let i = 0; i <= nivel + 1; i++) tom(NOTAS[i], 0.18, { tipo: "square", volume: 0.07, atraso: 0.09 * i });
    },
    // espertalhão: o tardigradozinho andando na caixa (tic tic tic bem agudo)
    passinhos(segundos) {
      const n = Math.round(segundos / 0.09);
      for (let i = 0; i < n; i++) tom(i % 2 ? 2350 : 2100, 0.025, { tipo: "square", volume: 0.018, atraso: 0.25 + i * 0.09 });
    },
    // ...e o tombo: "ops!", apito de queda descendo e um "ploc" lá embaixo
    tombo() {
      tom(1400, 0.08, { tipo: "square", volume: 0.05, ate: 1900 });
      tom(1900, 0.6, { tipo: "triangle", volume: 0.06, atraso: 0.1, ate: 260 });
      tom(180, 0.12, { tipo: "sine", volume: 0.09, atraso: 0.72, ate: 70 });
      ruido(0.06, { volume: 0.03, de: 1200, ate: 300 });
    },
    supernova() {
      for (let i = 0; i < 12; i++) tom(NOTAS[i % 6] * (i >= 6 ? 2 : 1), 0.12, { tipo: "square", volume: 0.06, atraso: 0.05 * i });
      ruido(1.2, { volume: 0.08, de: 6000, ate: 3000 });
    },
    // "plim" quando a caixa cruza uma linha de faixa: mais agudo nas mais raras
    limiar(nivel) {
      tom(NOTAS[Math.min(5, nivel + 1)], 0.16, { tipo: "triangle", volume: 0.07 });
      tom(NOTAS[Math.min(5, nivel + 1)] * 2, 0.1, { tipo: "sine", volume: 0.03, atraso: 0.03 });
    },
    // a caixa pousa: um "toc" de vidro e um sino que cresce com a raridade
    // (0 óbvia, 1 letrado, 2 raro, 3 espaço profundo, 4 singularidade)
    pouso(nivel) {
      if (!ac) return;
      const n = Math.max(0, Math.min(4, nivel));
      // baque macio: mais grave e mais cheio nas raras
      tom(150 - n * 18, 0.16 + n * 0.08, { tipo: "sine", volume: 0.1 + n * 0.025, ate: 55 - n * 6 });
      ruido(0.05 + n * 0.02, { volume: 0.04 + n * 0.012, de: 1800, ate: 400 });
      // sino: notas da escala subindo, cada faixa ganha uma a mais e soa mais longe
      const escala = [783.99, 1046.5, 1318.5, 1568, 2093, 2637];
      const notas = escala.slice(0, n + 1 + (n >= 3 ? 1 : 0));
      const passo = n >= 3 ? 0.07 : 0.085;
      const longa = 0.35 + n * 0.25;
      notas.forEach((f, i) => {
        const a = 0.04 + i * passo;
        const vol = 0.045 + n * 0.006;
        tom(f, longa, { tipo: "sine", volume: vol, atraso: a });
        tom(f * 2.01, longa * 0.5, { tipo: "sine", volume: vol * 0.3, atraso: a }); // brilho de vidro
        if (n >= 1) tom(f, longa, { tipo: "triangle", volume: vol * 0.25, atraso: a + 0.22 }); // eco
      });
      // nas mais raras, o acorde fica soando (levemente desafinado, como um coro) e cai poeira de estrela
      if (n >= 2) {
        const fim = 0.04 + notas.length * passo;
        const acorde = n >= 4 ? [523.25, 659.25, 783.99, 1046.5] : n >= 3 ? [523.25, 783.99, 1046.5] : [659.25, 1046.5];
        acorde.forEach((f) => {
          tom(f * 0.997, 1 + n * 0.3, { tipo: "sine", volume: 0.02 + n * 0.004, atraso: fim });
          tom(f * 1.003, 1 + n * 0.3, { tipo: "sine", volume: 0.02 + n * 0.004, atraso: fim });
        });
        ruido(0.4 + n * 0.2, { volume: 0.015 + n * 0.008, de: 5000, ate: 9500 });
      }
      if (n >= 3) tom(55, 1.2 + n * 0.2, { tipo: "sine", volume: 0.08 + (n - 3) * 0.04, ate: 41 }); // grave do fundo
      if (n >= 4) for (let i = 0; i < 8; i++) tom(2637 + Math.random() * 2500, 0.06, { tipo: "sine", volume: 0.02, atraso: 0.5 + i * 0.09 + Math.random() * 0.04 });
    },
    // volta para a Terra no fim: o motorzinho do tardígrado acelerando para cima,
    // um "fuuuu" de vento que cresce e passa, e estrelinhas zunindo ao lado
    subir(dura) {
      if (!ac) return;
      const t = ac.currentTime;
      const d = dura / 1000;
      const saida = ac.createGain();
      saida.gain.setValueAtTime(0.0001, t);
      saida.gain.exponentialRampToValueAtTime(1, t + 0.4);
      saida.gain.setValueAtTime(1, t + d * 0.65);
      saida.gain.exponentialRampToValueAtTime(0.0001, t + d);
      saida.connect(mestre);
      // motor: dois osciladores levemente desafinados, subindo de tom, com um "tremido"
      const filtro = ac.createBiquadFilter();
      filtro.type = "lowpass";
      filtro.frequency.setValueAtTime(260, t);
      filtro.frequency.exponentialRampToValueAtTime(1300, t + d);
      const gm = ac.createGain();
      gm.gain.value = 0.05;
      const tremido = ac.createOscillator(), tg = ac.createGain();
      tremido.frequency.setValueAtTime(7, t);
      tremido.frequency.linearRampToValueAtTime(14, t + d);
      tg.gain.value = 0.018;
      tremido.connect(tg).connect(gm.gain);
      const motores = [[65, "sawtooth"], [65.6, "triangle"], [130, "sine"]].map(([f, tipo]) => {
        const o = ac.createOscillator();
        o.type = tipo;
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 3.2, t + d);
        o.connect(filtro);
        return o;
      });
      filtro.connect(gm).connect(saida);
      // vento: ruído que abre de grave para agudo
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * d), ac.sampleRate);
      const dados = buf.getChannelData(0);
      for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
      const vento = ac.createBufferSource();
      vento.buffer = buf;
      const fv = ac.createBiquadFilter();
      fv.type = "bandpass";
      fv.Q.value = 1.2;
      fv.frequency.setValueAtTime(220, t);
      fv.frequency.exponentialRampToValueAtTime(2600, t + d);
      const gv = ac.createGain();
      gv.gain.setValueAtTime(0.0001, t);
      gv.gain.exponentialRampToValueAtTime(0.06, t + d * 0.55);
      gv.gain.exponentialRampToValueAtTime(0.01, t + d);
      vento.connect(fv).connect(gv).connect(saida);
      [...motores, tremido, vento].forEach((x) => { x.start(t); x.stop(t + d + 0.05); });
      // estrelinhas passando: "fiu" curtinhos, cada vez mais rápidos
      for (let a = 0.5, i = 0; a < d - 0.5; a += Math.max(0.16, 0.45 - i * 0.03), i++) {
        const f = 1500 + Math.random() * 1500;
        tom(f, 0.12, { tipo: "sine", volume: 0.012 + Math.random() * 0.01, atraso: a, ate: f * 0.7 });
      }
      if (ambiente) ambiente.osc.forEach((o, i) => o.frequency.setTargetAtTime(BASE_AMBIENTE[i], t, d / 3));
      fundo(false, d / 4);
    },
    fim() {
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tom(f, 0.35, { tipo: "triangle", volume: 0.1, atraso: 0.15 * i }));
    },
    profundidade(al) {
      if (!ambiente) return;
      const f = Math.max(0.6, 1 - al / 65000); // al em anos-luz de verdade
      ambiente.osc.forEach((o, i) => o.frequency.setTargetAtTime(BASE_AMBIENTE[i] * f, ac.currentTime, 0.5));
    },
  };
})();
// "const" no topo do arquivo não vira window.Som; a cena procura window.Som antes de tocar
window.Som = Som;
