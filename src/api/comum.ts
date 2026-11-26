// Utilidades compartilhadas pelas implementações da API (mock e Supabase).
import { z } from 'zod';
import { ApiError } from './errors';
import { primeiraMensagem, type AtaInput, type EventoInput } from '../domain/schemas';
import type { AtaDados, EventoDados } from '../domain/types';

/** Valida uma entrada com Zod; se falhar, vira um ApiError de validação. */
export function validar<S extends z.ZodType>(schema: S, dados: unknown): z.output<S> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new ApiError('VALIDACAO', primeiraMensagem(r.error));
  return r.data;
}

/** Remove campos vazios para guardar só o que existe. */
export function limpo(e: EventoInput): EventoDados {
  const out: EventoDados = { data: e.data, c: e.c, n: e.n };
  if (e.t) out.t = e.t;
  if (e.l) out.l = e.l;
  if (e.un) out.un = e.un;
  if (e.esp) out.esp = e.esp;
  if (e.fim) out.fim = e.fim;
  return out;
}

/** Ata validada → só os campos preenchidos. */
export function ataLimpa(a: z.output<typeof AtaInput>): AtaDados {
  const out: AtaDados = { titulo: a.titulo, data: a.data, conteudo: a.conteudo, fixada: a.fixada };
  if (a.participantes) out.participantes = a.participantes;
  if (a.resumo) out.resumo = a.resumo;
  if (a.eventoId) out.eventoId = a.eventoId;
  return out;
}
