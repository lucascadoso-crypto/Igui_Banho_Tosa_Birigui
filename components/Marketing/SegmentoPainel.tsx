import React, { useMemo, useRef, useState } from 'react';
import { Unit, UserProfile } from '../../types';
import { enviarNotificacaoWhatsApp } from '../../services/whatsappService';
import { registrarAtividade } from '../../services/logger';
import { getLastImgBBUploadError, uploadToImgBB } from '../../services/imgbbService';
import { SegmentoDef, ClienteSegmento } from './segmentos';

interface SegmentoPainelProps {
  segmento: SegmentoDef;
  clientes: ClienteSegmento[];
  unit: Unit;
  supabaseClient: any;
  userProfile?: UserProfile;
  onClose: () => void;
}

interface EnvioResultado {
  clienteId: number | string;
  nome: string;
  status: 'enviado' | 'falha' | 'sem_telefone' | 'sem_agendamento_ancora';
  detalhe?: string;
}

const aplicarTemplate = (template: string, nome: string) => template.replace(/\{nome\}/g, nome || 'Cliente');

// Formata "YYYY-MM-DD" (ou ISO completo) pra "DD/MM/AAAA" sem passar por
// Date/timezone (mesmo motivo de outras telas do app: evita deslocar o dia).
const formatDataBR = (value?: string | null) => {
  if (!value) return null;
  const [ano, mes, dia] = value.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return null;
  return `${dia}/${mes}/${ano}`;
};

type ColunaOrdenavel = 'nome' | 'telefone' | 'ultimoBanho' | 'pacotes' | 'avulsos' | 'status';

const getValorOrdenavel = (c: ClienteSegmento, resultado: EnvioResultado | undefined, coluna: ColunaOrdenavel) => {
  switch (coluna) {
    case 'nome': return (c.nome || '').toLowerCase();
    case 'telefone': return c.telefone || '';
    case 'ultimoBanho': return c.ultimoBanhoEm || '';
    case 'pacotes': return c.totalPacotes || 0;
    case 'avulsos': return c.avulsosFinalizados || 0;
    case 'status': return resultado?.status || '';
  }
};

const SegmentoPainel: React.FC<SegmentoPainelProps> = ({ segmento, clientes, unit, supabaseClient, userProfile, onClose }) => {
  const [mensagem, setMensagem] = useState(segmento.mensagemPadrao);
  const [brinde, setBrinde] = useState(segmento.brindePadrao);
  const [selecionados, setSelecionados] = useState<Set<number | string>>(
    () => new Set(clientes.filter(c => !!c.telefone).map(c => c.clienteId))
  );
  const [disparando, setDisparando] = useState(false);
  const [resultados, setResultados] = useState<EnvioResultado[] | null>(null);
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState('');
  const imagemInputRef = useRef<HTMLInputElement>(null);
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaOrdenavel; direcao: 'asc' | 'desc' } | null>(null);

  const alternarOrdenacao = (coluna: ColunaOrdenavel) => {
    setOrdenacao(prev => {
      if (prev?.coluna === coluna) return { coluna, direcao: prev.direcao === 'asc' ? 'desc' : 'asc' };
      return { coluna, direcao: 'asc' };
    });
  };

  // So reordena a mesma lista ja recebida (sem nenhuma consulta nova) -
  // puramente visual, igual clicar num cabecalho de planilha.
  const clientesOrdenados = useMemo(() => {
    if (!ordenacao) return clientes;
    const { coluna, direcao } = ordenacao;
    const copia = [...clientes];
    copia.sort((a, b) => {
      const va = getValorOrdenavel(a, resultados?.find(r => r.clienteId === a.clienteId), coluna);
      const vb = getValorOrdenavel(b, resultados?.find(r => r.clienteId === b.clienteId), coluna);
      if (va < vb) return direcao === 'asc' ? -1 : 1;
      if (va > vb) return direcao === 'asc' ? 1 : -1;
      return 0;
    });
    return copia;
  }, [clientes, resultados, ordenacao]);

  const handleImagemUpload = async (file?: File) => {
    if (!file) return;
    setErroImagem('');
    setEnviandoImagem(true);
    try {
      const url = await uploadToImgBB(file);
      if (!url) throw new Error(getLastImgBBUploadError() || 'Não foi possível enviar a imagem.');
      setImagemUrl(url);
    } catch (err: any) {
      setErroImagem(err.message || 'Não foi possível enviar a imagem.');
    } finally {
      setEnviandoImagem(false);
      if (imagemInputRef.current) imagemInputRef.current.value = '';
    }
  };

  const previewNome = clientes[0]?.nome || 'Cliente';
  const mensagemFinal = useMemo(() => {
    const base = aplicarTemplate(mensagem, previewNome);
    return brinde ? `${base}\n\n🎁 ${brinde}` : base;
  }, [mensagem, brinde, previewNome]);

  const toggleSelecionado = (id: number | string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDisparar = async () => {
    const alvos = clientes.filter(c => selecionados.has(c.clienteId));
    if (alvos.length === 0) return;

    if (!window.confirm(`Disparar mensagem via WhatsApp para ${alvos.length} cliente(s) do segmento "${segmento.titulo}"?`)) {
      return;
    }

    setDisparando(true);
    const novosResultados: EnvioResultado[] = [];

    for (const cliente of alvos) {
      const telefone = cliente.telefone?.replace(/\D/g, '');
      if (!telefone) {
        novosResultados.push({ clienteId: cliente.clienteId, nome: cliente.nome, status: 'sem_telefone' });
        continue;
      }
      if (!cliente.ultimoAgendamentoId) {
        novosResultados.push({ clienteId: cliente.clienteId, nome: cliente.nome, status: 'sem_agendamento_ancora' });
        continue;
      }

      const texto = `${aplicarTemplate(mensagem, cliente.nome)}${brinde ? `\n\n🎁 ${brinde}` : ''}`;

      try {
        const result = await enviarNotificacaoWhatsApp({
          telefone,
          mensagem: texto,
          imagemUrl: imagemUrl || undefined,
          unidadeId: unit.id,
          supabaseClient,
          agendamentoId: cliente.ultimoAgendamentoId,
          tipo: 'manual',
          origem: 'manual'
        });

        if (result?.ok) {
          novosResultados.push({ clienteId: cliente.clienteId, nome: cliente.nome, status: 'enviado' });
        } else {
          novosResultados.push({ clienteId: cliente.clienteId, nome: cliente.nome, status: 'falha', detalhe: result?.error });
        }
      } catch (err: any) {
        novosResultados.push({ clienteId: cliente.clienteId, nome: cliente.nome, status: 'falha', detalhe: err?.message });
      }
    }

    setResultados(novosResultados);
    setDisparando(false);

    const enviados = novosResultados.filter(r => r.status === 'enviado').length;
    registrarAtividade(
      unit.id,
      userProfile?.email || 'sistema',
      'CAMPANHA_MARKETING_WA',
      `Disparou campanha "${segmento.titulo}" via WhatsApp para ${enviados}/${alvos.length} cliente(s).`,
      userProfile?.nome,
      userProfile?.cargo
    );
  };

  return (
    <div className="app-modal-overlay fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-4 overflow-y-auto overflow-x-hidden">
      <div className="app-modal-panel bg-gray-50 w-[calc(100vw-24px)] max-w-[calc(100vw-24px)] mx-auto md:max-w-6xl md:w-full rounded-[2rem] shadow-2xl overflow-y-auto overflow-x-hidden md:overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[calc(100vh-24px)] md:max-h-[90vh]">
        <div className="bg-white px-6 md:px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{clientes.length} cliente(s)</p>
            <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">{segmento.titulo}</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6">
          <div className="bg-white p-5 md:p-6 rounded-[1.5rem] border border-slate-100 shadow-sm space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mensagem (use {'{nome}'} para personalizar)</label>
              <textarea
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Brinde / incentivo (opcional)</label>
              <input
                value={brinde}
                onChange={e => setBrinde(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Imagem (opcional)</label>
              <input
                ref={imagemInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                onChange={e => handleImagemUpload(e.target.files?.[0])}
              />
              {imagemUrl ? (
                <div className="mt-1.5 flex items-center gap-3">
                  <img src={imagemUrl} alt="Imagem da campanha" className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0" />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => imagemInputRef.current?.click()}
                      className="text-[11px] font-black uppercase tracking-widest text-teal-600 hover:text-teal-700"
                    >
                      Trocar imagem
                    </button>
                    <button
                      type="button"
                      onClick={() => setImagemUrl(null)}
                      className="text-[11px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imagemInputRef.current?.click()}
                  disabled={enviandoImagem}
                  className="mt-1.5 w-full rounded-xl border-2 border-dashed border-slate-200 p-4 text-xs font-bold text-slate-400 hover:border-teal-300 hover:text-teal-600 transition-all disabled:opacity-60"
                >
                  {enviandoImagem ? (
                    <><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Enviando imagem...</>
                  ) : (
                    <><i className="fa-solid fa-image mr-2"></i>Anexar imagem à campanha</>
                  )}
                </button>
              )}
              {erroImagem && <p className="mt-1.5 text-[11px] font-bold text-rose-500">{erroImagem}</p>}
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Prévia (para {previewNome})</p>
              {imagemUrl && <img src={imagemUrl} alt="Imagem da campanha" className="w-full max-w-xs rounded-xl mb-2 border border-slate-200" />}
              <p className="text-sm font-semibold text-slate-700 whitespace-pre-wrap">{mensagemFinal}</p>
            </div>
          </div>

          <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Destinatários</p>
              <p className="text-[11px] font-bold text-slate-400">{selecionados.size} selecionado(s)</p>
            </div>
            <div className="max-h-80 overflow-y-auto overflow-x-hidden">
              {clientes.length === 0 && (
                <p className="text-center text-sm font-bold text-slate-400 py-8">Nenhum cliente neste segmento.</p>
              )}
              {clientes.length > 0 && (() => {
                const cabecalho = (coluna: ColunaOrdenavel, label: string, largura: string) => (
                  <th
                    onClick={() => alternarOrdenacao(coluna)}
                    className={`${largura} px-2 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-slate-600 transition-colors`}
                  >
                    {label}
                    <i className={`fa-solid ml-1 text-[9px] ${
                      ordenacao?.coluna === coluna
                        ? (ordenacao.direcao === 'asc' ? 'fa-sort-up text-teal-600' : 'fa-sort-down text-teal-600')
                        : 'fa-sort text-slate-300'
                    }`}></i>
                  </th>
                );
                return (
              <table className="w-full table-fixed text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    <th className="w-[4%] px-5 py-2.5"></th>
                    {cabecalho('nome', 'Nome', 'w-[18%]')}
                    {cabecalho('telefone', 'Telefone', 'w-[15%]')}
                    <th className="w-[16%] px-2 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contexto</th>
                    {cabecalho('ultimoBanho', 'Último banho', 'w-[13%]')}
                    {cabecalho('pacotes', 'Pacotes', 'w-[13%]')}
                    {cabecalho('avulsos', 'Avulsos', 'w-[10%]')}
                    {cabecalho('status', 'Status', 'w-[11%]')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
              {clientesOrdenados.map(cliente => {
                const resultado = resultados?.find(r => r.clienteId === cliente.clienteId);
                const ultimoBanho = formatDataBR(cliente.ultimoBanhoEm);
                return (
                  <tr key={cliente.clienteId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="w-[4%] px-5 py-2.5">
                      <input
                        type="checkbox"
                        checked={selecionados.has(cliente.clienteId)}
                        onChange={() => toggleSelecionado(cliente.clienteId)}
                        disabled={!cliente.telefone || disparando}
                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-200"
                      />
                    </td>
                    <td className="px-2 py-2.5 text-sm font-bold text-slate-800 truncate" title={cliente.nome}>{cliente.nome}</td>
                    <td className="px-2 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">
                      {cliente.telefone || 'Sem telefone'}
                      {!cliente.ultimoAgendamentoId && <span className="block text-[10px] text-amber-600">sem agendamento p/ ancorar envio</span>}
                    </td>
                    <td className="px-2 py-2.5 text-xs font-semibold text-slate-500">{cliente.subtitulo || '—'}</td>
                    <td className="px-2 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">{ultimoBanho || 'Nunca'}</td>
                    <td className="px-2 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">
                      {(cliente.totalPacotes || 0) > 0 ? `${cliente.totalPacotes} (${cliente.pacotesConcluidos || 0} concl.)` : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">{cliente.avulsosFinalizados || 0}</td>
                    <td className="px-5 py-2.5">
                    {resultado && (
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 inline-block ${
                        resultado.status === 'enviado' ? 'bg-emerald-50 text-emerald-600'
                        : resultado.status === 'falha' ? 'bg-rose-50 text-rose-600'
                        : 'bg-amber-50 text-amber-600'
                      }`}>
                        {resultado.status === 'enviado' ? 'Enviado'
                          : resultado.status === 'falha' ? 'Falhou'
                          : resultado.status === 'sem_telefone' ? 'Sem telefone'
                          : 'Sem agendamento'}
                      </span>
                    )}
                    </td>
                  </tr>
                );
              })}
                </tbody>
              </table>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="bg-white px-6 md:px-8 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] font-semibold text-slate-400">
            Cada mensagem é enviada individualmente pela função de WhatsApp já usada nos lembretes do sistema.
          </p>
          <button
            onClick={handleDisparar}
            disabled={disparando || selecionados.size === 0}
            className="px-6 py-3 bg-teal-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
          >
            {disparando ? (
              <><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>Disparando...</>
            ) : (
              <><i className="fa-brands fa-whatsapp mr-2"></i>Disparar campanha</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SegmentoPainel;
