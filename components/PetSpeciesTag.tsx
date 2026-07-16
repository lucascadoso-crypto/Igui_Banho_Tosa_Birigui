import React from 'react';

interface PetSpeciesTagProps {
  especie?: string | null;
  raca?: string | null;
  className?: string;
}

const normalize = (value: any) => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

const getSpeciesVariant = (especie?: string | null): 'dog' | 'cat' | null => {
  const n = normalize(especie);
  if (!n) return null;
  if (n.includes('cachorro') || n.includes('cao') || n.includes('canino') || n === 'dog') return 'dog';
  if (n.includes('gato') || n.includes('felino') || n === 'cat') return 'cat';
  return null;
};

/** Tag compacta de espécie (Dog/Gato) + raça opcional, usada nos cards e no modal de detalhes de agendamento. */
const PetSpeciesTag: React.FC<PetSpeciesTagProps> = ({ especie, raca, className = '' }) => {
  const variant = getSpeciesVariant(especie);
  if (!variant) return null;

  const label = variant === 'dog' ? 'Dog' : 'Gato';
  const icon = variant === 'dog' ? 'fa-dog' : 'fa-cat';
  const colorClass = variant === 'dog'
    ? 'bg-sky-50 text-sky-700 border-sky-100'
    : 'bg-purple-50 text-purple-700 border-purple-100';
  const racaTrim = String(raca || '').trim();
  const text = racaTrim ? `${label} · ${racaTrim}` : label;

  return (
    <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border ${colorClass} ${className}`}>
      <i className={`fa-solid ${icon} text-[10px]`}></i>
      {text}
    </span>
  );
};

export default PetSpeciesTag;
