import type { DataIso } from '../domain/types';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;
export const MESES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] as const;

const p2 = (n: number) => String(n).padStart(2, '0');
const mes = (m: number) => MESES[m] ?? '';

export const key = (y: number, m: number, d: number): DataIso => `${y}-${p2(m + 1)}-${p2(d)}`;

export function parseKey(k: DataIso): Date {
  const [y = 0, m = 1, d = 1] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const hojeKey = (): DataIso => { const t = new Date(); return key(t.getFullYear(), t.getMonth(), t.getDate()); };
export const fmtDate = (k: DataIso) => { const d = parseKey(k); return `${d.getDate()} de ${mes(d.getMonth())} de ${d.getFullYear()}`; };
export const fmtShort = (k: DataIso) => { const d = parseKey(k); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtWhen = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES_C[d.getMonth()]} · ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const diaDaSemana = (k: DataIso) => DIAS[parseKey(k).getDay()] ?? '';
export const nomeMes = mes;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "18h30" → minutos desde 0h (para ordenar). Sem horário vem antes. */
export function minutos(t?: string): number {
  if (!t) return -1;
  const [h = '0', m = '0'] = t.split('h');
  return Number(h) * 60 + (Number(m) || 0);
}
/** "18h30" → "18:30" (valor do <input type="time">) */
export function horaParaInput(t?: string): string {
  if (!t) return '';
  const [h = '0', m = ''] = t.split('h');
  return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
}
/** "18:30" → "18h30", "10:00" → "10h" */
export function inputParaHora(v: string): string {
  if (!v) return '';
  const [h = '0', m = '00'] = v.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}
export const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
