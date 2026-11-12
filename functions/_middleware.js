// Três tarefas, antes de qualquer página:
//
// 1. Manda quem entra por um endereço velho para o endereço oficial, nichoojogo.com.
//      nichoojogo.pages.dev/qualquer-coisa  ->  https://nichoojogo.com/qualquer-coisa
//      www.nichoojogo.com/qualquer-coisa     ->  https://nichoojogo.com/qualquer-coisa
//    As prévias do Pages (algo.nichoojogo.pages.dev) continuam abrindo normalmente.
//
// 2. Esconde o que não é do jogo. O Pages publica a pasta inteira do repositório,
//    então README, LICENSE, dados/, scripts/, docs/ e banco/ ficariam abertos.
//    Aqui só passam as páginas da lista abaixo e a API; o resto dá 404.
//
// 3. O jogo abre direto em nichoojogo.com/, sem página de "redirecionando".
//    O arquivo continua sendo jogar.html (é o que os scripts geram); aqui ele é
//    servido em "/". Links antigos para /jogar levam um 301 para "/" (o Pages já
//    manda /jogar.html para /jogar sozinho). Os dias do arquivo também abrem o jogo,
//    com endereço limpo: /dia/2 (quem lê o número é o jogo.js).
//
// O "/" também não passa: é o index.html (cópia do jogar.html, feita pelo scripts/montar_jogo.py),
// servido direto como arquivo. Assim cada visita não gasta uma execução, e o jogo abre mesmo se o
// limite diário das Functions estourar ("fail open"). O código do "/" abaixo fica para as prévias.
// Os arquivos do jogo (jogo/, licencas/, favicons) nem passam por aqui: estão no
// "exclude" do _routes.json, para não gastar uma execução por imagem ou script.
// A exceção é o /jogo/dados.js (todas as respostas de todos os dias): ele fica fora do "exclude"
// (o scripts/montar_jogo.py monta a lista) e cai aqui, no 404. Ver docs/CONTA.md.
// Arquivo novo na raiz que precise ficar público (ads.txt, robots.txt...) entra em PUBLICOS.

const OFICIAL = "nichoojogo.com";
const VELHOS = new Set(["nichoojogo.pages.dev", "www.nichoojogo.com"]);
const PAGINAS = ["index", "jogar", "privacidade", "termos", "creditos"];
const PUBLICOS = new Set([
  "/",
  ...PAGINAS.flatMap((p) => [`/${p}`, `/${p}.html`]),
  "/ads.txt",
  "/robots.txt",
  "/sitemap.xml",
]);

const DIA_DO_ARQUIVO = /^\/dia\/\d+\/?$/;
const publico = (caminho) => PUBLICOS.has(caminho) || DIA_DO_ARQUIVO.test(caminho) || caminho.startsWith("/api/");

const ANTIGOS_DO_JOGO = new Set(["/jogar", "/jogar.html", "/index", "/index.html"]);

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  if (!publico(url.pathname)) return new Response("Não encontrado", { status: 404 });
  if (ANTIGOS_DO_JOGO.has(url.pathname) && (request.method === "GET" || request.method === "HEAD")) {
    url.pathname = "/";
    if (VELHOS.has(url.hostname)) { url.hostname = OFICIAL; url.protocol = "https:"; url.port = ""; }
    return Response.redirect(url.toString(), 301);
  }
  // POST da pontuação segue no endereço onde a página abriu, para não perder a viagem
  if (VELHOS.has(url.hostname) && (request.method === "GET" || request.method === "HEAD")) {
    url.hostname = OFICIAL;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname === "/" || DIA_DO_ARQUIVO.test(url.pathname)) {
    const jogo = new URL(url);
    jogo.pathname = "/jogar";
    return env.ASSETS.fetch(new Request(jogo, request));
  }
  return next();
}
