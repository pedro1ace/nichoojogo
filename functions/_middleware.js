// Duas tarefas, antes de qualquer página:
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
// Os arquivos do jogo (jogo/, licencas/, favicons) nem passam por aqui: estão no
// "exclude" do _routes.json, para não gastar uma execução por imagem ou script.
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

const publico = (caminho) => PUBLICOS.has(caminho) || caminho.startsWith("/api/");

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (!publico(url.pathname)) return new Response("Não encontrado", { status: 404 });
  // POST da pontuação segue no endereço onde a página abriu, para não perder a viagem
  if (VELHOS.has(url.hostname) && (request.method === "GET" || request.method === "HEAD")) {
    url.hostname = OFICIAL;
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
