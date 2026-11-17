// =====================================================================
// AJUDANTES DE DOM — com HTML seguro por padrão.
// Toda montagem de HTML usa o template `html`, que ESCAPA cada valor
// inserido. Só o que for marcado com raw() entra sem escape, e raw() só
// deve receber HTML escrito por nós, nunca dados digitados por alguém.
// =====================================================================

const RAW = Symbol('html-seguro');
export interface SafeHtml { readonly [RAW]: string }

/** Marca um trecho de HTML escrito por nós como confiável. */
export const raw = (s: string): SafeHtml => ({ [RAW]: s });

const isSafe = (v: unknown): v is SafeHtml => typeof v === 'object' && v !== null && RAW in v;

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

type Valor = SafeHtml | string | number | boolean | null | undefined | readonly Valor[];

function render(v: Valor): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (isSafe(v)) return v[RAW];
  return esc(String(v));
}

/** Template de HTML que escapa automaticamente todos os valores. */
export function html(partes: TemplateStringsArray, ...valores: Valor[]): SafeHtml {
  let out = partes[0] ?? '';
  valores.forEach((v, i) => { out += render(v) + (partes[i + 1] ?? ''); });
  return raw(out);
}

/** Único ponto do app que escreve innerHTML. */
export function setHtml(el: Element, conteudo: SafeHtml): void {
  el.innerHTML = conteudo[RAW];
}

/** querySelector que falha alto se o elemento não existir. */
export function $<T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document): T {
  const el = raiz.querySelector<T & Element>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
}

export function $$<T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document): T[] {
  return [...raiz.querySelectorAll<T & Element>(sel)];
}
