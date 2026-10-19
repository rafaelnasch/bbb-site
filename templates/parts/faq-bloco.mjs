// Bloco de perguntas (SPEC 9.3, seção 12, e 11.2 FAQPage): itens de data/faq.json em <details>.
// Só itens exibíveis, nunca os de garantia (oculto_ate_decisao). A seleção por tipo de peça é
// editorial (quais perguntas cabem na página); pergunta e resposta são as da fonte.
import { html, attrs } from '../../build/lib/html.mjs';

// Perguntas por tipo de peça, na ordem de exibição (ids de data/faq.json).
export const FAQ_POR_TIPO = Object.freeze({
  banheira: ['faq-02', 'faq-40', 'faq-14', 'faq-16', 'faq-11', 'faq-36'],
  spa: ['faq-02', 'faq-14', 'faq-13', 'faq-37', 'faq-11', 'faq-22'],
  ofuro: ['faq-02', 'faq-14', 'faq-11', 'faq-36', 'faq-21'],
  sauna: ['faq-11', 'faq-23', 'faq-24', 'faq-05'],
  acessorio: ['faq-27', 'faq-12', 'faq-14', 'faq-15', 'faq-05'],
});

const exibivel = (f) => f && f.exibir !== false && !f.oculto_ate_decisao && (f.resposta_exibida || '').trim();

/** Pergunta da fonte em caixa alta vira frase (apresentação; o texto não muda). */
export function perguntaLegivel(q) {
  const s = String(q || '').trim();
  if (s !== s.toUpperCase()) return s;
  const min = s.toLocaleLowerCase('pt-BR');
  return min.charAt(0).toLocaleUpperCase('pt-BR') + min.slice(1);
}

export function faqsDoTipo(D, tipo) {
  const todas = D.ler('faq.json') || [];
  const porId = new Map(todas.map((f) => [f.id, f]));
  return (FAQ_POR_TIPO[tipo] || FAQ_POR_TIPO.banheira).map((id) => porId.get(id)).filter(exibivel).slice(0, 6);
}

export function faqBloco(itens) {
  return html`<div class="faq-bloco">${itens.map((f) => html`<details class="faq-item">
  <summary class="faq-item__q">${perguntaLegivel(f.pergunta)}</summary>
  <div class="faq-item__r"><p data-campo="faq-resposta">${f.resposta_exibida}</p>${/^https?:/.test(f.fonte || '') ? html`<p class="faq-item__fonte"><a${attrs({ class: 'link', href: f.fonte, target: '_blank', rel: 'noopener' })}>fonte</a></p>` : ''}</div>
</details>`)}</div>`;
}

/** FAQPage só com itens publicados (tipo=publicada) visíveis na página (SPEC 11.2). */
export function faqJsonLd(itens) {
  const pub = itens.filter((f) => f.tipo === 'publicada');
  if (!pub.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: pub.map((f) => ({ '@type': 'Question', name: perguntaLegivel(f.pergunta), acceptedAnswer: { '@type': 'Answer', text: f.resposta_exibida } })),
  };
}
