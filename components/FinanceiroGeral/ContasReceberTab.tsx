import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile } from '../../types';
import { formatCurrencyBR } from '../../services/appointmentTotals';
import { buildWhatsAppLink } from '../../services/clientLinks';
import {
  ContaReceberPendencia,
  ClienteDevedor,
  FaixaIdadeDivida,
  FAIXAS_IDADE_LABEL,
  fetchContasReceberDetalhe,
  agruparPorCliente
} from '../../services/financeiroGeral';
import SectionTitle from '../Dashboard/SectionTitle';
import CardSkeleton from '../Dashboard/CardSkeleton';
import ReceberPendenciaModal from './ReceberPendenciaModal';

interface ContasReceberTabProps {
  unidadeId: number | null;
  supabaseClient: any;
  userProfile?: UserProfile;
}

const FAIXA_COR: Record<FaixaIdadeDivida, string> = {
  a_vencer: 'bg-slate-100 text-slate-500',
  '1_7': 'bg-amber-50 text-amber-600',
  '8_30': 'bg-orange-50 text-orange-600',
  '31_60': 'bg-rose-50 text-rose-600',
  mais_60: 'bg-rose-100 text-rose-700'
};

const ORIGEM_LABEL: Record<string, string> = { avulso: 'Avulso', pacote: 'Pacote', adicional: 'Extra' };

const ContasReceberTab: React.FC<ContasReceberTabProps> = ({ unidadeId, supabaseClient, userProfile }) => {
  const [pendencias, setPendencias] = useState<ContaReceberPendencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [recebendo, setRecebendo] = useState<ContaReceberPendencia | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    setErro(null);
    fetchContasReceberDetalhe(supabaseClient, unidadeId)
      .then(setPendencias)
      .catch((err) => { console.error('Erro ao carregar contas a receber:', err); setErro(err?.message || 'Falha ao carregar.'); })
      .finally(() => setLoading(false));
  }, [supabaseClient, unidadeId]);

  useEffect(() => { carregar(); }, [carregar]);

  const clientes = useMemo(() => agruparPorCliente(pendencias), [pendencias]);

  const clientesFiltrados = useMemo(() => {
    if (!busca.trim()) return clientes;
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => c.clienteNome.toLowerCase().includes(termo));
  }, [clientes, busca]);

  const totais = useMemo(() => {
    const totalGeral = pendencias.reduce((acc, p) => acc + p.valor, 0);
    const totalVencido = pendencias.filter((p) => p.vencido).reduce((acc, p) => acc + p.valor, 0);
    return { totalGeral, totalVencido, qtdClientes: clientes.length };
  }, [pendencias, clientes]);

  const contagemPorFaixa = useMemo(() => {
    const base: Record<FaixaIdadeDivida, number> = { a_vencer: 0, '1_7': 0, '8_30': 0, '31_60': 0, mais_60: 0 };
    clientes.forEach((c) => { base[c.faixaMaisCritica] += 1; });
    return base;
  }, [clientes]);

  const abrirWhatsApp = (cliente: ClienteDevedor) => {
    const link = buildWhatsAppLink(cliente.clienteTelefone);
    if (!link) { alert('Cliente sem telefone cadastrado.'); return; }
    const mensagem = `Olá, ${cliente.clienteNome}! Identificamos uma pendência de ${formatCurrencyBR(cliente.totalDevido)} referente a ${cliente.itens.length > 1 ? `${cliente.itens.length} atendimentos` : cliente.itemMaisAntigo.descricao}. Poderia regularizar quando possível? Qualquer dúvida estamos à disposição. Obrigado!`;
    window.open(`${link}?text=${encodeURIComponent(mensagem)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {erro && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation"></i> {erro}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total a Receber</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : formatCurrencyBR(totais.totalGeral)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vencido</p>
          <p className="text-2xl font-black text-rose-600">{loading ? '...' : formatCurrencyBR(totais.totalVencido)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Clientes com pendência</p>
          <p className="text-2xl font-black text-slate-800">{loading ? '...' : totais.qtdClientes}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(['a_vencer', '1_7', '8_30', '31_60', 'mais_60'] as FaixaIdadeDivida[]).map((f) => (
            <span key={f} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide ${FAIXA_COR[f]}`}>
              {FAIXAS_IDADE_LABEL[f]}: {contagemPorFaixa[f]}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionTitle title="Clientes com pendência" subtitle="Agrupado por cliente, ordenado do maior para o menor devedor" />
          <input
            type="text" placeholder="Buscar cliente..." value={busca} onChange={(e) => setBusca(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm outline-none w-full sm:w-64"
          />
        </div>

        {loading ? <CardSkeleton height={220} /> : clientesFiltrados.length === 0 ? (
          <p className="text-center text-slate-300 font-bold italic py-10">Nenhuma pendência encontrada.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {clientesFiltrados.map((cliente) => {
              const chave = String(cliente.clienteId ?? cliente.clienteNome);
              const aberto = expandido === chave;
              return (
                <div key={chave} className="py-4">
                  <button onClick={() => setExpandido(aberto ? null : chave)} className="w-full flex items-center justify-between gap-4 text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <i className={`fa-solid fa-chevron-${aberto ? 'down' : 'right'} text-slate-300 text-xs`}></i>
                      <div className="min-w-0">
                        <p className="font-black text-slate-800 truncate">{cliente.clienteNome}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${FAIXA_COR[cliente.faixaMaisCritica]}`}>
                          {FAIXAS_IDADE_LABEL[cliente.faixaMaisCritica]} · {cliente.itens.length} item(ns)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-black text-slate-800">{formatCurrencyBR(cliente.totalDevido)}</span>
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); abrirWhatsApp(cliente); }}
                        title="Cobrar no WhatsApp"
                        className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center"
                      >
                        <i className="fa-brands fa-whatsapp"></i>
                      </span>
                    </div>
                  </button>

                  {aberto && (
                    <div className="mt-3 pl-7 space-y-2">
                      {cliente.itens.map((item) => (
                        <div key={`${item.origem}-${item.referenciaId}`} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{item.descricao}</p>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">
                              {ORIGEM_LABEL[item.origem]} · venc. {item.vencimento.split('-').reverse().join('/')} {item.vencido && <span className="text-rose-500">· vencido</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-black text-slate-800">{formatCurrencyBR(item.valor)}</span>
                            {userProfile?.cargo !== 'financeiro' && (
                              <button
                                onClick={() => setRecebendo(item)}
                                className="px-3 py-2 bg-[#00BFA5] text-white rounded-lg font-black text-[10px] uppercase tracking-wide"
                              >
                                Receber
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {recebendo && (
        <ReceberPendenciaModal
          pendencia={recebendo}
          supabaseClient={supabaseClient}
          userProfile={userProfile}
          onClose={() => setRecebendo(null)}
          onReceived={carregar}
        />
      )}
    </div>
  );
};

export default ContasReceberTab;
