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
  function criarAmbiente() {
    const filtro = ac.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 180;
    const ganho = ac.createGain();
    ganho.gain.value = 0.016;
    const osc = [41.2, 55, 61.7].map((f) => {
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
    ambiente = { osc, filtro };
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

  const NOTAS = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]; // dó maior subindo

  return {
    ligar,
    estaMudo: () => mudo,
    alternar() {
      mudo = !mudo;
      try {
        localStorage.setItem("nicho:mudo", mudo ? "1" : "0");
      } catch {}
      if (mestre) mestre.gain.setTargetAtTime(mudo ? 0 : 0.5, ac.currentTime, 0.05);
      return mudo;
    },
    tecla: () => tom(1800 + Math.random() * 400, 0.025, { volume: 0.03 }),
    erro: () => {
      tom(160, 0.18, { tipo: "sawtooth", volume: 0.08 });
      tom(120, 0.22, { tipo: "sawtooth", volume: 0.06, atraso: 0.08 });
    },
    sugestao: () => tom(880, 0.08, { tipo: "triangle", volume: 0.08, ate: 1175 }),
    tique: (urgente) => tom(urgente ? 1400 : 1000, 0.04, { volume: urgente ? 0.07 : 0.04 }),
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
    supernova() {
      for (let i = 0; i < 12; i++) tom(NOTAS[i % 6] * (i >= 6 ? 2 : 1), 0.12, { tipo: "square", volume: 0.06, atraso: 0.05 * i });
      ruido(1.2, { volume: 0.08, de: 6000, ate: 3000 });
    },
    // "plim" quando a caixa cruza uma linha de faixa: mais agudo nas mais raras
    limiar(nivel) {
      tom(NOTAS[Math.min(5, nivel + 1)], 0.16, { tipo: "triangle", volume: 0.07 });
      tom(NOTAS[Math.min(5, nivel + 1)] * 2, 0.1, { tipo: "sine", volume: 0.03, atraso: 0.03 });
    },
    // brilho ao chegar numa resposta rara: arpejo subindo, mais longo quanto mais rara
    brilho(k) {
      const n = Math.round(4 + 8 * Math.min(1, k));
      for (let i = 0; i < n; i++) tom(NOTAS[i % 6] * (i >= 6 ? 2 : 1), 0.1, { tipo: "triangle", volume: 0.05 + 0.03 * k, atraso: 0.04 * i });
      if (k > 0.6) ruido(0.5, { volume: 0.04, de: 5000, ate: 9000 });
    },
    fim() {
      [392, 523.25, 659.25, 783.99].forEach((f, i) => tom(f, 0.35, { tipo: "triangle", volume: 0.1, atraso: 0.15 * i }));
    },
    profundidade(al) {
      if (!ambiente) return;
      const f = Math.max(0.6, 1 - al / 20000);
      ambiente.osc.forEach((o, i) => o.frequency.setTargetAtTime([41.2, 55, 61.7][i] * f, ac.currentTime, 0.5));
    },
  };
})();
