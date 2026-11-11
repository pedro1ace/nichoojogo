// Conta opcional com Google, progresso salvo na conta e placar do dia.
// Servidor: functions/api/conta/ e functions/api/placar/ (regras em servidor/conta.js e docs/CONTA.md).
//
// Sem conta, o jogo é exatamente o mesmo de antes. Com conta:
//   - as viagens guardadas no navegador (nicho:v7:<dia>) também ficam na conta, e outro aparelho
//     recebe tudo ao entrar (sequência, recorde e skins vêm junto, porque saem desses registros);
//   - a viagem completa de HOJE entra no placar do dia (o servidor confere o relógio e os pontos).
// Aberto do computador (file://), em /jogo/ ou nos modos de teste, nada disto aparece.
// Vem de jogo.js: estado, $, MODO_TESTE, RODADAS_POR_DIA, completa, hojeLocal, numero, dataCurta,
// mostrarMelhor, mostrarDiaESequencia, abrirJanela.

const Conta = (() => {
  const LIGADA = location.protocol !== "file:" && !MODO_TESTE && !/\/jogo\//.test(location.pathname);
  const GSI = "https://accounts.google.com/gsi/client";
  const TOP_CURTO = 10;
  let google = null; // client id do Google, ou null (login desligado no servidor)
  let conta = null; // { apelido, escolheuApelido }
  let envio = Promise.resolve(); // último envio de progresso (o placar espera ele terminar)
  let ultimoPlacar = null;
  let mostrarTodos = false;

  const api = (caminho, opcoes = {}) =>
    fetch(caminho, {
      credentials: "same-origin",
      ...opcoes,
      headers: { "content-type": "application/json", ...(opcoes.headers || {}) },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    }).then(async (r) => ({ ok: r.ok, status: r.status, corpo: await r.json().catch(() => ({})) }));

  // ---------- progresso ----------

  function registrosLocais() {
    const saida = {};
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith("nicho:v7:")) continue;
        const r = JSON.parse(localStorage.getItem(k) || "null");
        if (r && Array.isArray(r.historico) && r.historico.length) saida[k.slice(9)] = r;
      }
    } catch {}
    return saida;
  }

  // O que vale quando o navegador e a conta têm o mesmo dia: a completa (a 1ª que chegou à conta é a que
  // conta, como no placar) ou, se nenhuma terminou, a mais adiantada.
  function escolher(local, daConta) {
    if (!local) return daConta;
    if (completa(daConta)) return daConta;
    if (completa(local)) return local;
    return daConta.historico.length > local.historico.length ? daConta : local;
  }

  // a conta guarda uma cópia limpa do registro: compara o que importa
  const resumoDaViagem = (r) => r && `${r.total}|${r.historico.map((h) => `${h.resposta}:${h.pontos}`).join(",")}`;
  const mesmaViagem = (a, b) => !!a && !!b && resumoDaViagem(a) === resumoDaViagem(b);

  async function sincronizar() {
    const locais = registrosLocais();
    if (Object.keys(locais).length) {
      await api("/api/conta/progresso", { method: "POST", corpo: { registros: locais } }).catch(() => null);
    }
    const r = await api("/api/conta/progresso").catch(() => null);
    if (!r?.ok || !r.corpo.registros) return;
    let mudouHoje = false;
    for (const [dia, daConta] of Object.entries(r.corpo.registros)) {
      const local = locais[dia];
      const vale = escolher(local, daConta);
      if (vale === local || mesmaViagem(vale, local)) continue;
      try { localStorage.setItem(`nicho:v7:${dia}`, JSON.stringify(vale)); } catch {}
      if (dia === estado.data && !estado.replay) mudouHoje = true;
    }
    // o dia aberto mudou (terminado em outro aparelho): recarrega, se não estiver no meio da viagem
    const parado = !$("inicio").hidden || !$("fim").hidden;
    const chave = `nicho:recarregou:${estado.data}`;
    let jaRecarregou = false;
    try { jaRecarregou = sessionStorage.getItem(chave) === "1"; } catch {}
    if (mudouHoje && parado && !estado.ativa && !jaRecarregou) {
      try { sessionStorage.setItem(chave, "1"); } catch {}
      location.reload();
      return;
    }
    try { mostrarMelhor(); mostrarDiaESequencia(); } catch {}
  }

  // jogo.js chama a cada resposta; só manda a viagem completa (1 envio por dia, não 7)
  function registroSalvo(dia, registro) {
    if (!LIGADA || !conta || !completa(registro)) return;
    envio = api("/api/conta/progresso", { method: "POST", corpo: { registros: { [dia]: registro } } }).catch(() => null);
  }

  // ---------- login ----------

  let promessaGsi = null;
  function carregarGsi() {
    if (window.google?.accounts?.id) return Promise.resolve(true);
    promessaGsi ||= new Promise((pronto) => {
      const s = document.createElement("script");
      s.src = GSI;
      s.async = true;
      s.onload = () => pronto(true);
      s.onerror = () => { promessaGsi = null; pronto(false); };
      document.head.append(s);
    });
    return promessaGsi;
  }

  async function mostrarBotaoGoogle() {
    const lugar = $("conta-botao-google");
    if (!google || lugar.dataset.pronto) return;
    $("conta-erro").textContent = "";
    if (!(await carregarGsi())) {
      $("conta-erro").textContent = "Não deu para carregar o login do Google. Confira a conexão (ou um bloqueador de anúncios) e tente de novo.";
      return;
    }
    window.google.accounts.id.initialize({ client_id: google, callback: aoEntrar, ux_mode: "popup", cancel_on_tap_outside: true });
    window.google.accounts.id.renderButton(lugar, { theme: "filled_black", size: "large", text: "signin_with", shape: "rectangular", locale: "pt-BR", width: 260 });
    lugar.dataset.pronto = "1";
  }

  async function aoEntrar(resposta) {
    $("conta-erro").textContent = "Entrando…";
    const r = await api("/api/conta/entrar", { method: "POST", corpo: { credential: resposta.credential } }).catch(() => null);
    if (!r?.ok) {
      $("conta-erro").textContent = "Não deu para entrar agora. Tente de novo daqui a pouco.";
      return;
    }
    $("conta-erro").textContent = "";
    conta = r.corpo.conta;
    atualizarJanela();
    window.Janelas?.confirmar($("conta-dentro"));
    envio = sincronizar().catch(() => {});
    await envio;
    if (!$("fim").hidden) mostrarPlacar(estado.data);
    if (!conta.escolheuApelido) {
      $("conta-msg").textContent = "Escolha como você quer aparecer no placar.";
      $("conta-input-apelido").focus();
      $("conta-input-apelido").select();
    }
  }

  async function sair() {
    await api("/api/conta/sair", { method: "POST" }).catch(() => null);
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
    conta = null;
    atualizarJanela();
    if (!$("fim").hidden) mostrarPlacar(estado.data);
  }

  let confirmarExclusao = 0;
  async function excluir() {
    const b = $("conta-excluir");
    if (Date.now() - confirmarExclusao > 5000) {
      confirmarExclusao = Date.now();
      b.textContent = "TOQUE DE NOVO PARA EXCLUIR";
      setTimeout(() => { b.textContent = "EXCLUIR CONTA"; }, 5000);
      return;
    }
    const r = await api("/api/conta", { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      $("conta-msg").textContent = "Não deu para excluir agora. Tente de novo.";
      return;
    }
    conta = null;
    b.textContent = "EXCLUIR CONTA";
    atualizarJanela();
    $("conta-erro").textContent = "Conta excluída. O progresso continua só neste navegador.";
    if (!$("fim").hidden) mostrarPlacar(estado.data);
  }

  async function salvarApelido(e) {
    e.preventDefault();
    const campo = $("conta-input-apelido");
    const msg = $("conta-msg");
    const texto = campo.value.trim();
    if (!texto) return;
    msg.textContent = "Conferindo…";
    msg.className = "conta-msg";
    const r = await api("/api/conta/apelido", { method: "POST", corpo: { apelido: texto } }).catch(() => null);
    if (r?.corpo?.ok) {
      conta = { apelido: r.corpo.apelido, escolheuApelido: true };
      msg.textContent = "Apelido salvo ✓";
      msg.className = "conta-msg certo";
      window.Janelas?.confirmar(msg);
      atualizarJanela();
      if (!$("fim").hidden) mostrarPlacar(estado.data);
    } else {
      msg.textContent = r?.corpo?.motivo || "Não deu para salvar agora. Tente de novo.";
      msg.className = "conta-msg erro";
    }
  }

  // o mascote escolhido no topo da janela (desenharSkin e SKINS vêm de jogo.js)
  function desenharMascote() {
    try {
      const skin = SKINS.find((k) => k.id === skinEscolhida());
      desenharSkin($(conta ? "conta-mascote-dentro" : "conta-mascote"), skin);
    } catch {}
  }

  function atualizarJanela() {
    desenharMascote();
    $("conta-fora").hidden = !!conta;
    $("conta-dentro").hidden = !conta;
    $("abrir-conta").classList.toggle("logado", !!conta);
    $("abrir-conta").setAttribute("aria-label", conta ? `Conta: ${conta.apelido}` : "Entrar com Google");
    if (conta) {
      $("conta-apelido").textContent = conta.apelido;
      $("conta-apelido").classList.toggle("dev", !!conta.dev);
      if (document.activeElement !== $("conta-input-apelido")) $("conta-input-apelido").value = conta.escolheuApelido ? conta.apelido : "";
      $("conta-input-apelido").placeholder = conta.apelido;
    } else {
      $("conta-msg").textContent = "";
      mostrarBotaoGoogle();
    }
  }

  function abrir() {
    atualizarJanela();
    abrirJanela("janela-conta");
  }

  // ---------- placar ----------

  async function mostrarPlacar(dia) {
    const secao = $("secao-placar");
    await pronto;
    if (!LIGADA || !google) {
      secao.hidden = true;
      return;
    }
    await envio;
    const r = await api(`/api/placar?dia=${dia}`).catch(() => null);
    if (!r?.ok) {
      secao.hidden = true;
      return;
    }
    ultimoPlacar = r.corpo;
    secao.hidden = false;
    desenharPlacar();
  }

  function desenharPlacar() {
    const p = ultimoPlacar;
    if (!p) return;
    const hoje = p.dia === hojeLocal();
    $("placar-estado").textContent = p.fechado ? `· fechou às 23:59 de ${dataCurta(p.dia)}` : "· aberto até 23:59";
    const lista = $("placar-lista");
    lista.innerHTML = "";
    const mostrar = mostrarTodos ? p.top : p.top.slice(0, TOP_CURTO);
    let posicao = 0;
    p.top.forEach((linha, i) => {
      if (i === 0 || linha.pontos !== p.top[i - 1].pontos) posicao = i + 1;
      if (i >= mostrar.length) return;
      const li = document.createElement("li");
      li.className = "placar-linha" + (linha.voce ? " voce" : "") + (posicao <= 3 ? ` podio podio-${posicao}` : "");
      const pos = document.createElement("span");
      pos.className = "placar-pos";
      pos.textContent = `${posicao}º`;
      const nome = document.createElement("span");
      nome.className = "placar-nome";
      nome.textContent = linha.apelido + (linha.voce ? " (você)" : "");
      if (linha.dev) {
        li.classList.add("dev");
        const selo = document.createElement("span");
        selo.className = "selo-dev";
        selo.textContent = "DEV";
        selo.title = "Equipe do Nicho";
        nome.prepend(selo);
      }
      const pts = document.createElement("span");
      pts.className = "placar-pontos";
      pts.textContent = numero(linha.pontos);
      li.append(pos, nome, pts);
      if (conta && !linha.voce && !linha.dev && !/^Viajante[- ]/.test(linha.apelido)) li.append(botaoDenunciar(linha));
      lista.append(li);
    });
    if (!p.top.length) {
      const li = document.createElement("li");
      li.className = "placar-vazio";
      li.textContent = p.fechado ? "Ninguém entrou no placar deste dia." : "Ninguém no placar ainda. O primeiro lugar está livre!";
      lista.append(li);
    }
    const mais = $("placar-mais");
    mais.hidden = p.top.length <= TOP_CURTO;
    mais.textContent = mostrarTodos ? "mostrar só o top 10" : `ver o top ${p.top.length}`;

    const voce = $("placar-voce");
    const entrar = $("placar-entrar");
    entrar.hidden = true;
    voce.className = "placar-voce";
    if (p.voce) {
      voce.textContent = `Você ficou em ${p.voce.posicao}º de ${numero(p.total)} · ${numero(p.voce.pontos)} pts`;
      if (p.voce.pontos < Math.round(estado.total) && hoje) voce.textContent += " (pontos conferidos pelo servidor)";
    } else if (!conta && hoje && !estado.replay) {
      voce.textContent = "Sua viagem de hoje ainda pode entrar: o placar é só de quem está logado.";
      entrar.hidden = false;
    } else if (!conta) {
      voce.textContent = `${numero(p.total)} viajantes no placar. Só entra quem estava logado e jogou no próprio dia.`;
    } else if (!hoje) {
      voce.textContent = "O placar é só de quem jogou no próprio dia, logado. Viagens pelo arquivo não entram.";
    } else {
      voce.textContent = "Sua viagem ainda não entrou no placar. Confira a conexão e abra o jogo de novo.";
      voce.className = "placar-voce aviso";
    }
  }

  function botaoDenunciar(linha) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "placar-denunciar";
    b.textContent = "⚑";
    b.title = "Denunciar apelido ofensivo";
    b.setAttribute("aria-label", `Denunciar o apelido ${linha.apelido}`);
    let armado = false;
    b.addEventListener("click", async () => {
      if (!armado) {
        armado = true;
        b.textContent = "denunciar?";
        b.classList.add("armado");
        setTimeout(() => { if (armado && b.isConnected) { armado = false; b.textContent = "⚑"; b.classList.remove("armado"); } }, 4000);
        return;
      }
      armado = false;
      b.disabled = true;
      const r = await api("/api/placar/denunciar", { method: "POST", corpo: { id: linha.id } }).catch(() => null);
      b.textContent = r?.corpo?.ok ? "denunciado ✓" : r?.corpo?.motivo || "erro";
      b.classList.remove("armado");
      if (r?.corpo?.escondido) mostrarPlacar(ultimoPlacar.dia);
    });
    return b;
  }

  // ---------- começo ----------

  const pronto = (async () => {
    if (!LIGADA) return;
    const r = await api("/api/conta").catch(() => null);
    google = r?.corpo?.google || null;
    conta = r?.corpo?.conta || null;
    if (!google) return;
    $("abrir-conta").hidden = false;
    atualizarJanela();
    if (conta) envio = sincronizar().catch(() => {});
  })();

  $("abrir-conta").addEventListener("click", abrir);
  $("placar-entrar").addEventListener("click", abrir);
  $("placar-mais").addEventListener("click", () => { mostrarTodos = !mostrarTodos; desenharPlacar(); });
  $("conta-form-apelido").addEventListener("submit", salvarApelido);
  $("conta-sair").addEventListener("click", sair);
  $("conta-excluir").addEventListener("click", excluir);

  return { registroSalvo, mostrarPlacar };
})();
