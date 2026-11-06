// Etiquetas estruturadas de comportamento do pet (pets.comportamento_tags).
// Valores espelham o CHECK constraint de
// supabase/migrations/0062_crm_pet_comportamento_tosa.sql.
// "critica" marca as tags que merecem destaque na agenda/painel do
// agendamento (pet morde ou é medroso), onde a equipe precisa de alerta
// rápido antes de atender.

export interface ComportamentoTagDef {
  value: string;
  label: string;
  icon: string;
  critica?: boolean;
}

export const COMPORTAMENTO_TAGS: ComportamentoTagDef[] = [
  { value: 'docil', label: 'Dócil', icon: 'fa-heart' },
  { value: 'medroso', label: 'Medroso', icon: 'fa-shield-dog', critica: true },
  { value: 'agitado', label: 'Agitado', icon: 'fa-bolt' },
  { value: 'morde', label: 'Morde', icon: 'fa-triangle-exclamation', critica: true },
  { value: 'nao_gosta_secador', label: 'Não gosta de secador', icon: 'fa-wind' },
  { value: 'idoso', label: 'Idoso', icon: 'fa-cane' },
  { value: 'primeira_vez', label: 'Primeira vez', icon: 'fa-star' }
];

export const getComportamentoTagDef = (value: string): ComportamentoTagDef | undefined =>
  COMPORTAMENTO_TAGS.find(t => t.value === value);

export const getComportamentoTagLabel = (value: string): string =>
  getComportamentoTagDef(value)?.label || value;

export const getTagsCriticas = (tags?: string[] | null): ComportamentoTagDef[] => {
  if (!tags || tags.length === 0) return [];
  return tags
    .map(getComportamentoTagDef)
    .filter((t): t is ComportamentoTagDef => !!t && !!t.critica);
};
