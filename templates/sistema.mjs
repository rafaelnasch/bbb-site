// Páginas de conferência do sistema visual (bloco 3): só com `node build/render.mjs --sistema`.
// Ficam fora do registro padrão, com noindex, e mostram tokens, contraste, tipografia, botões,
// moldura, reveal, gavetas, comparador e View Transitions com dados reais do catálogo.
import { html, attrs } from '../build/lib/html.mjs';
import { icone } from '../build/lib/icons.mjs';
import { url } from '../build/lib/url.mjs';
import { fotoProduto } from '../build/lib/midia.mjs';
import { verificarContraste } from '../build/lib/contraste.mjs';
import { picture, SIZES_PRODUTO } from './parts/foto.mjs';
import { breadcrumb } from './parts/breadcrumb.mjs';

const ESTILO = `
.sis-hero{position:relative;min-height:88svh;display:grid;align-items:end;padding:calc(var(--cab-h) + 48px) 0 clamp(40px,6vw,88px);overflow:clip}
.sis-hero::before{content:"";position:absolute;inset:-20% -10% auto;height:120%;background:radial-gradient(50% 45% at 70% 30%,color-mix(in srgb,var(--glow) 18%,transparent),transparent 70%),radial-gradient(40% 40% at 15% 80%,color-mix(in srgb,var(--line) 14%,transparent),transparent 70%);pointer-events:none}
.sis-hero__grade{position:relative;display:grid;gap:28px}
.sis-hero h1{max-width:14ch}
.sis-acoes{display:flex;flex-wrap:wrap;gap:12px}
.sis-cores{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:12px;list-style:none;padding:0}
.sis-cor{border-radius:var(--radius);overflow:hidden;border:1px solid var(--rule);background:var(--bg)}
.sis-cor b{display:grid;place-items:center;min-height:84px;font:600 1rem var(--f-body)}
.sis-cor span{display:block;padding:10px 12px;font-size:.8125rem;line-height:1.4;color:var(--fg-2)}
.sis-tipos>*+*{margin-top:18px}
.sis-cartoes{display:grid;gap:clamp(20px,3vw,36px);grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));list-style:none;padding:0}
.sis-cartao a{display:block;text-decoration:none;color:inherit}
.sis-cartao h3{margin-top:16px;font-size:1.25rem}
.sis-cartao .etiqueta{margin-top:10px}
.sis-preco{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin-top:10px}
.sis-preco b{font:600 1.125rem var(--f-body)}
.sis-cartao__rodape{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}
.sis-tog{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid var(--rule);border-radius:var(--radius-chip);font-size:.875rem}
.sis-tog[aria-pressed="true"]{background:var(--porcelain);color:var(--ink);border-color:var(--porcelain)}
.sis-tabela{min-width:640px;width:100%;font-size:.9375rem}
.sis-tabela th,.sis-tabela td{padding:12px 14px;border-bottom:1px solid var(--rule);text-align:left}
.sis-tabela th[scope=row]{position:sticky;left:0;background:var(--bg)}
.sis-peca{display:grid;gap:32px;align-items:start}
@media (min-width:1024px){.sis-peca{grid-template-columns:7fr 5fr}}
`;

function cartao(p, i, comVt) {
  const f = fotoProduto(p.slug, 1);
  const e = p.especificacoes || {};
  const etiqueta = [e.Forma, e.Lugares, e.Material, e.Configuracao].filter(Boolean).join(' · ');
  const destino = comVt ? url('_sistema-peca.html') : url(`${p.slug}.html`);
  return html`<li class="sis-cartao" data-reveal style="--i:${i}" data-sku="${p.sku}">
    <a href="${destino}">
      ${f ? html`<div class="moldura">${picture(f, { classe: 'moldura__img', vt: comVt ? p.slug : null })}</div>` : html`<div class="moldura moldura--vazia"><p>Foto deste modelo sob consulta</p></div>`}
      <h3 data-campo="nome">${p.nome}</h3>
    </a>
    <p class="etiqueta">${etiqueta}</p>
    <p class="sis-preco num">${p.preco?.por ? html`<b data-campo="preco-por">${p.preco.por}</b>` : ''}${p.preco?.de ? html`<span class="preco-de" data-campo="preco-de">${p.preco.de}</span>` : ''}</p>
    <div class="sis-cartao__rodape"><span class="pequeno num" style="color:var(--fg-2)">${p.d_tamanhos?.[0]?.rotulo || ''}</span>
      <button type="button" class="sis-tog" data-comparar="${p.slug}" data-nome="${p.nome}" data-sku="${p.sku}" aria-pressed="false">${icone('comparar', { tamanho: 16 })}Comparar</button></div>
  </li>`;
}

export function paginas(ctx) {
  const { dados: D, layout } = ctx;
  const prods = D.ler('produtos.json');
  const cat = D.catPorPath.get('banheiras.html');
  const lista = cat.produtos.slice(0, 6).map((s) => prods.find((p) => p.slug === s)).filter(Boolean);
  const pares = verificarContraste();
  const peca = lista[0];

  const corpo = html`<style>${ESTILO}</style>
<section class="sala sis-hero" aria-labelledby="sis-h1">
  <div class="wrap sis-hero__grade">
    <p class="etiqueta etiqueta--linha" data-intro style="--i:0">Bloco 3 · conferência interna</p>
    <h1 id="sis-h1" class="t-display" data-intro="mascara" style="--i:1">Sistema visual da galeria</h1>
    <p class="lead" data-intro style="--i:2">Tokens, tipografia, cabeçalho, gavetas, rodapé, WhatsApp, reveal, View Transitions e modo lite, com dados reais do catálogo.</p>
    <div class="sis-acoes" data-intro style="--i:3">
      <a class="btn btn--whats" href="${D.wa('venda_principal')}" target="_blank" rel="noopener" data-wa-papel="venda_principal" data-wa-contexto="sistema" data-wa-sync="venda">${icone('whatsapp', { tamanho: 20 })}Comprar pelo WhatsApp</a>
      <button class="btn btn--fantasma" type="button" data-gaveta-abrir="gaveta-whats" data-gaveta-foco="consultores" aria-haspopup="dialog">${icone('pessoas', { tamanho: 18 })}Escolher meu consultor</button>
    </div>
  </div>
</section>

<section class="dia secao" aria-labelledby="sis-cores">
  <div class="wrap">
    <p class="etiqueta">Contraste calculado no build</p>
    <h2 id="sis-cores" style="margin:12px 0 28px">Pares de cor usados em texto</h2>
    <ul class="sis-cores" data-reveal-grupo>${pares.map((r, i) => html`<li class="sis-cor" data-reveal style="--i:${i % 8}"><b style="background:${r.bgHex};color:${r.fgHex}">${r.razao}:1 ${r.ok ? 'AA' : 'falha'}</b><span>${r.uso}<br>${r.fg} sobre ${r.bg}</span></li>`)}</ul>
  </div>
</section>

<section class="dia dia--areia secao" aria-labelledby="sis-tipo">
  <div class="wrap sis-tipos prosa">
    <p class="etiqueta">Libre Franklin, auto-hospedada</p>
    <h2 id="sis-tipo">Títulos e corpo em Libre Franklin</h2>
    <p class="t-h3">Subtítulo em Libre Franklin</p>
    <p>Corpo de 18 px com entrelinha 1,6. Medidas e preços usam algarismos tabulares: <span class="num">0,79 x 1,41 x 0,37</span>.</p>
    <p class="pequeno">Texto pequeno para notas: preços e medidas publicados pela empresa, coletados em ${D.dataColeta}.</p>
    <div class="rolagem" tabindex="0" role="region" aria-label="Tabela de exemplo com rolagem local"><table class="sis-tabela num"><thead><tr><th scope="col">Modelo</th><th scope="col">Tamanho</th><th scope="col">Material</th><th scope="col">Configuração</th><th scope="col">Lugares</th></tr></thead>
      <tbody>${lista.map((p) => html`<tr><th scope="row">${p.nome}</th><td>${p.d_tamanhos?.[0]?.rotulo || ''}</td><td>${p.especificacoes?.Material || ''}</td><td>${p.especificacoes?.Configuracao || ''}</td><td>${p.especificacoes?.Lugares || ''}</td></tr>`)}</tbody></table></div>
  </div>
</section>

<section class="sala secao" aria-labelledby="sis-galeria">
  <div class="wrap">
    ${breadcrumb([{ nome: 'Início', href: url('') }, { nome: 'Sistema', href: url('_sistema.html') }, { nome: 'Galeria' }])}
    <h2 id="sis-galeria" style="margin:16px 0 32px">Moldura, reveal e comparador</h2>
    <ul class="sis-cartoes" data-reveal-grupo>${lista.map((p, i) => cartao(p, i, i === 0))}</ul>
  </div>
</section>`;

  const fPeca = fotoProduto(peca.slug, 1);
  const corpoPeca = html`<style>${ESTILO}</style>
<section class="sala secao" style="padding-top:calc(var(--cab-h) + 32px)" aria-labelledby="sis-peca">
  <div class="wrap sis-peca">
    <div class="letterbox">${fPeca ? html`<div class="moldura">${picture(fPeca, { classe: 'moldura__img', prioridade: true, sizes: SIZES_PRODUTO, vtChegada: peca.slug })}</div><p class="moldura__leg">Imagem ilustrativa</p>` : ''}</div>
    <div>
      ${breadcrumb([{ nome: 'Sistema', href: url('_sistema.html') }, { nome: peca.nome }])}
      <h1 id="sis-peca" style="margin-top:16px" data-intro="mascara" data-campo="nome">${peca.nome}</h1>
      <p class="etiqueta" style="margin-top:14px;--i:1" data-intro>Nº de catálogo <span data-campo="sku">${peca.sku}</span></p>
      <div class="sis-acoes" style="margin-top:28px" data-sku="${peca.sku}">
        <a${attrs({ class: 'btn btn--whats', href: D.wa('venda_principal'), target: '_blank', rel: 'noopener', 'data-wa-papel': 'venda_principal', 'data-wa-contexto': 'produto', 'data-wa-sync': 'venda' })}>${icone('whatsapp', { tamanho: 20 })}Comprar pelo WhatsApp</a>
        <button class="btn btn--fantasma" type="button" data-gaveta-abrir="gaveta-whats" data-gaveta-foco="consultores">Escolher meu consultor</button>
        <button type="button" class="sis-tog" data-comparar="${peca.slug}" data-nome="${peca.nome}" data-sku="${peca.sku}" aria-pressed="false">${icone('comparar', { tamanho: 16 })}Comparar</button>
      </div>
    </div>
  </div>
</section>`;

  return [
    { saida: '_sistema.html', html: layout({ saida: '_sistema.html', titulo: 'Sistema visual | Banheiras Bom Banho', descricao: 'Conferência interna do sistema visual do novo site da Banheiras Bom Banho.', robots: 'noindex,nofollow', corpo, sobre: true, critico: ['peca'] }) },
    { saida: '_sistema-peca.html', html: layout({ saida: '_sistema-peca.html', titulo: `${peca.nome} | Sistema visual`, descricao: 'Conferência interna da transição entre cartão e moldura.', robots: 'noindex,nofollow', corpo: corpoPeca, esperar: 'sis-peca', critico: ['peca'] }) },
  ];
}
