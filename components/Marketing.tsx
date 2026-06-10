import React, { useEffect, useMemo, useState } from 'react';

type CampaignStatus = 'rascunho' | 'em_producao' | 'aprovado' | 'publicado';

interface MarketingCampaign {
  id: number;
  titulo: string;
  objetivo: string;
  publico: string;
  data: string;
  canal: string;
  legenda: string;
  chamada: string;
  temaVisual: string;
  linkCanva: string;
  modelo: string;
  status: CampaignStatus;
}

const modelLibrary = [
  'Banho e tosa',
  'Pacote mensal',
  'Pet shop',
  'Aniversario do pet',
  'Antes/depois',
  'Promocao',
  'Datas comemorativas'
];

const statusMeta: Record<CampaignStatus, { label: string; className: string }> = {
  rascunho: { label: 'Rascunho', className: 'bg-slate-100 text-slate-600' },
  em_producao: { label: 'Em producao', className: 'bg-amber-100 text-amber-700' },
  aprovado: { label: 'Aprovado', className: 'bg-sky-100 text-sky-700' },
  publicado: { label: 'Publicado', className: 'bg-emerald-100 text-emerald-700' }
};

const emptyCampaign: Omit<MarketingCampaign, 'id'> = {
  titulo: '',
  objetivo: '',
  publico: '',
  data: new Date().toISOString().slice(0, 10),
  canal: 'Instagram',
  legenda: '',
  chamada: '',
  temaVisual: '',
  linkCanva: '',
  modelo: 'Banho e tosa',
  status: 'rascunho'
};

const initialCampaigns: MarketingCampaign[] = [
  {
    id: 1,
    titulo: 'Pacote mensal de banho',
    objetivo: 'Gerar recorrencia e vender pacotes de fidelidade',
    publico: 'Tutores de caes pequenos e medios',
    data: new Date().toISOString().slice(0, 10),
    canal: 'Instagram',
    legenda: 'Seu pet limpo, cheiroso e com cuidados em dia o mes inteiro. Conheca nossos pacotes mensais e agende o melhor horario.',
    chamada: 'Pacote mensal com carinho de verdade',
    temaVisual: 'Foto alegre do pet no pos-banho, tons verde e branco, selo de beneficio.',
    linkCanva: '',
    modelo: 'Pacote mensal',
    status: 'em_producao'
  },
  {
    id: 2,
    titulo: 'Antes e depois da tosa',
    objetivo: 'Mostrar resultado e gerar prova social',
    publico: 'Clientes que valorizam estetica e conforto',
    data: new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10),
    canal: 'Instagram/Facebook',
    legenda: 'Transformacao feita com tecnica, cuidado e muito amor. Seu pet tambem merece esse momento.',
    chamada: 'Antes e depois que encanta',
    temaVisual: 'Comparativo lado a lado, fundo claro, destaque no brilho da pelagem.',
    linkCanva: '',
    modelo: 'Antes/depois',
    status: 'aprovado'
  }
];

const Marketing: React.FC = () => {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(() => {
    try {
      const stored = localStorage.getItem('pet_marketing_campaigns');
      return stored ? JSON.parse(stored) : initialCampaigns;
    } catch {
      return initialCampaigns;
    }
  });
  const [form, setForm] = useState<Omit<MarketingCampaign, 'id'>>(emptyCampaign);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    localStorage.setItem('pet_marketing_campaigns', JSON.stringify(campaigns));
  }, [campaigns]);

  const campaignsInMonth = useMemo(() => {
    return campaigns
      .filter((campaign) => campaign.data.startsWith(selectedMonth))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [campaigns, selectedMonth]);

  const groupedByDay = useMemo(() => {
    return campaignsInMonth.reduce<Record<string, MarketingCampaign[]>>((acc, campaign) => {
      const day = campaign.data.slice(8, 10);
      acc[day] = [...(acc[day] || []), campaign];
      return acc;
    }, {});
  }, [campaignsInMonth]);

  const updateForm = (field: keyof Omit<MarketingCampaign, 'id'>, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const generateSuggestion = () => {
    const petHook = form.modelo === 'Aniversario do pet'
      ? 'Hoje e dia de celebrar quem enche a casa de amor.'
      : 'Seu pet merece cuidado, conforto e aquele cheirinho de banho tomado.';

    const chamada = `${form.modelo}: cuidado que aparece no primeiro olhar`;
    const legenda = `${petHook} Na Igui Banho e Tosa Birigui, cada detalhe e pensado para deixar o banho, a tosa e a rotina do seu melhor amigo mais leves. ${form.objetivo ? `Campanha focada em ${form.objetivo.toLowerCase()}.` : 'Agende um horario e venha sentir a diferenca.'}`;
    const temaVisual = `Visual claro e afetivo, foto real do pet, selo curto com "${chamada}", cores verde/teal e detalhes brancos.`;

    setForm((current) => ({ ...current, chamada, legenda, temaVisual }));
  };

  const saveCampaign = (event: React.FormEvent) => {
    event.preventDefault();
    const campaign: MarketingCampaign = {
      ...form,
      id: Date.now()
    };
    setCampaigns((current) => [campaign, ...current]);
    setForm({ ...emptyCampaign, data: form.data });
  };

  const calendarDays = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, '0'));

  return (
    <div className="space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.24em]">Marketing PET</p>
          <h2 className="mt-1 text-3xl font-black text-slate-900 tracking-tighter uppercase">Calendario de Campanhas</h2>
          <p className="mt-2 text-sm font-semibold text-slate-500 max-w-2xl">
            Planeje postagens, organize ideias e gere textos base para Instagram e Facebook.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-100 p-2 shadow-sm">
          <i className="fa-solid fa-calendar-days text-emerald-500 ml-2"></i>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="bg-transparent px-2 py-2 text-sm font-black text-slate-700 outline-none"
          />
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_25rem] gap-6">
        <form onSubmit={saveCampaign} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 md:p-7 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-800">Nova campanha</h3>
              <p className="text-xs font-bold text-slate-400 mt-1">Briefing rapido para conteudo social.</p>
            </div>
            <button
              type="button"
              onClick={generateSuggestion}
              className="h-11 px-4 rounded-2xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 active:scale-95 transition-all"
            >
              <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
              Gerar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Titulo</span>
              <input required value={form.titulo} onChange={(event) => updateForm('titulo', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</span>
              <input type="date" required value={form.data} onChange={(event) => updateForm('data', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Objetivo</span>
              <input value={form.objetivo} onChange={(event) => updateForm('objetivo', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Publico</span>
              <input value={form.publico} onChange={(event) => updateForm('publico', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Canal</span>
              <select value={form.canal} onChange={(event) => updateForm('canal', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400">
                <option>Instagram</option>
                <option>Facebook</option>
                <option>Instagram/Facebook</option>
                <option>Stories</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
              <select value={form.status} onChange={(event) => updateForm('status', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="rascunho">Rascunho</option>
                <option value="em_producao">Em producao</option>
                <option value="aprovado">Aprovado</option>
                <option value="publicado">Publicado</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelo</span>
              <select value={form.modelo} onChange={(event) => updateForm('modelo', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400">
                {modelLibrary.map((model) => <option key={model}>{model}</option>)}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link do Canva</span>
              <input value={form.linkCanva} onChange={(event) => updateForm('linkCanva', event.target.value)} placeholder="https://www.canva.com/design/..." className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
            </label>
          </div>

          <label className="space-y-2 block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chamada da arte</span>
            <input value={form.chamada} onChange={(event) => updateForm('chamada', event.target.value)} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-400" />
          </label>

          <label className="space-y-2 block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legenda</span>
            <textarea value={form.legenda} onChange={(event) => updateForm('legenda', event.target.value)} rows={4} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </label>

          <label className="space-y-2 block">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tema visual</span>
            <textarea value={form.temaVisual} onChange={(event) => updateForm('temaVisual', event.target.value)} rows={3} className="w-full rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
          </label>

          <button type="submit" className="w-full rounded-2xl bg-slate-900 py-4 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.99] transition-all">
            Salvar campanha
          </button>
        </form>

        <aside className="space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5">
            <h3 className="text-lg font-black text-slate-800">Banco de ideias</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {modelLibrary.map((model) => (
                <button
                  key={model}
                  onClick={() => updateForm('modelo', model)}
                  className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${form.modelo === model ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5">
            <h3 className="text-lg font-black text-slate-800">Campanhas</h3>
            <div className="mt-4 space-y-3 max-h-[28rem] overflow-y-auto pr-1">
              {campaigns.map((campaign) => (
                <article key={campaign.id} className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 break-words">{campaign.titulo}</p>
                      <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(campaign.data).toLocaleDateString('pt-BR')} • {campaign.canal}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusMeta[campaign.status].className}`}>
                      {statusMeta[campaign.status].label}
                    </span>
                  </div>
                  {campaign.linkCanva && (
                    <a href={campaign.linkCanva} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      Abrir Canva
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div>
            <h3 className="text-xl font-black text-slate-800">Calendario mensal</h3>
            <p className="text-xs font-bold text-slate-400 mt-1">Postagens planejadas para {selectedMonth}.</p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{campaignsInMonth.length} campanhas</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {calendarDays.map((day) => (
            <div key={day} className="min-h-28 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 overflow-hidden">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dia {day}</p>
              <div className="mt-2 space-y-2">
                {(groupedByDay[day] || []).map((campaign) => (
                  <div key={campaign.id} className="rounded-xl bg-white p-2 shadow-sm">
                    <p className="text-[11px] font-black text-slate-700 leading-tight break-words">{campaign.titulo}</p>
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusMeta[campaign.status].className}`}>
                      {statusMeta[campaign.status].label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Marketing;
