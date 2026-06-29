
import React, { useEffect, useState } from 'react';

interface CadastroPublicoProps {
  supabaseClient: any;
}

interface UnidadeInfo {
  id: number;
  nome: string;
  telefone?: string | null;
}

interface PetDraft {
  nome: string;
  genero: string;
  especie: string;
  raca: string;
  porte: string;
  temAlergia: '' | 'sim' | 'nao';
  alergiaDescricao: string;
  comportamento: string[];
  observacoes: string;
}

const emptyPet = (): PetDraft => ({
  nome: '',
  genero: '',
  especie: '',
  raca: '',
  porte: '',
  temAlergia: '',
  alergiaDescricao: '',
  comportamento: [],
  observacoes: ''
});

const BRAND_GREEN = '#0F6E56';

const PORTE_OPTIONS = ['Pequeno', 'Médio', 'Grande', 'Gigante'];
const COMPORTAMENTO_OPTIONS = ['Dócil', 'Agitado', 'Ansioso', 'Agressivo'];

const maskTelefone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const maskCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const isValidCpf = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += parseInt(digits[i], 10) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(9) === parseInt(digits[9], 10) && calcDigit(10) === parseInt(digits[10], 10);
};

const maskCep = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const ChipButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-4 py-3 rounded-2xl border text-sm font-bold transition-all ${
      active
        ? 'text-white border-transparent shadow-md'
        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`}
    style={active ? { backgroundColor: BRAND_GREEN } : undefined}
  >
    {children}
  </button>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{children}</label>
);

const inputClass = "w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-700 focus:ring-2 transition-all";

const CadastroPublico: React.FC<CadastroPublicoProps> = ({ supabaseClient }) => {
  const [unidadeId, setUnidadeId] = useState<number | null>(null);
  const [unidadeInfo, setUnidadeInfo] = useState<UnidadeInfo | null>(null);
  const [unidadeError, setUnidadeError] = useState(false);
  const [loadingUnidade, setLoadingUnidade] = useState(true);

  // step 1 = tutor, 2 = pet (dados basicos), 3 = pet (saude/comportamento)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successData, setSuccessData] = useState<{ clienteNome: string; petNomes: string[] } | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Etapa 1 - Tutor
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');

  // Etapas 2/3 - Pets (cada pet tem seus proprios dados e saude)
  const [pets, setPets] = useState<PetDraft[]>([]);
  const [currentPet, setCurrentPet] = useState<PetDraft>(emptyPet());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('unidade');
    const parsed = raw ? Number(raw) : NaN;

    if (!raw || !Number.isFinite(parsed)) {
      setUnidadeError(true);
      setLoadingUnidade(false);
      return;
    }

    setUnidadeId(parsed);

    (async () => {
      try {
        const { data, error } = await supabaseClient.rpc('unidade_publica_info', { p_unidade_id: parsed });
        if (error || !data) {
          setUnidadeError(true);
        } else {
          setUnidadeInfo(data as UnidadeInfo);
        }
      } catch (err) {
        console.error('Erro ao buscar unidade:', err);
        setUnidadeError(true);
      } finally {
        setLoadingUnidade(false);
      }
    })();
  }, [supabaseClient]);

  const handleCepBlur = async () => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setLogradouro(data.logradouro || '');
        setBairro(data.bairro || '');
        setCidade(data.localidade || '');
        setEstado(data.uf || '');
      }
    } catch (err) {
      console.error('Erro ao buscar CEP:', err);
    } finally {
      setBuscandoCep(false);
    }
  };

  const toggleComportamento = (opt: string) => {
    setCurrentPet(prev => ({
      ...prev,
      comportamento: prev.comportamento.includes(opt)
        ? prev.comportamento.filter(o => o !== opt)
        : [...prev.comportamento, opt]
    }));
  };

  const removePet = (index: number) => {
    setPets(prev => prev.filter((_, i) => i !== index));
  };

  const cpfPreenchidoEInvalido = cpf.replace(/\D/g, '').length > 0 && !isValidCpf(cpf);
  const canAdvanceStep1 = nome.trim().length > 0 && telefone.replace(/\D/g, '').length >= 10 && !cpfPreenchidoEInvalido;
  const canAdvanceStep2 = currentPet.nome.trim().length > 0 && currentPet.genero !== '' && currentPet.especie !== '';

  const buildPetPayload = (pet: PetDraft) => ({
    nome: pet.nome,
    genero: pet.genero,
    especie: pet.especie,
    raca: pet.raca,
    porte: pet.porte,
    restricoes: pet.temAlergia === 'sim' ? pet.alergiaDescricao.trim() : '',
    comportamento: pet.comportamento.join(', '),
    notas_internas: pet.observacoes
  });

  const handleAddAnotherPet = () => {
    setPets(prev => [...prev, currentPet]);
    setCurrentPet(emptyPet());
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!unidadeId) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const allPets = [...pets, currentPet];

      const { data, error } = await supabaseClient.rpc('cadastro_publico_tutor_pets', {
        p_unidade_id: unidadeId,
        p_tutor: { nome, telefone, cpf, cep, logradouro, numero, bairro, cidade, estado },
        p_pets: allPets.map(buildPetPayload)
      });

      if (error) throw error;

      if (!data?.ok) {
        if (data?.erro === 'cpf_invalido') {
          setSubmitError('O CPF informado é inválido. Volte na primeira etapa e confira os números.');
        } else {
          setSubmitError('Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
        }
        return;
      }

      setSuccessData({
        clienteNome: data.cliente_nome,
        petNomes: (data.pets || []).map((p: any) => p.pet_nome)
      });
    } catch (err) {
      console.error('Erro ao enviar cadastro:', err);
      setSubmitError('Não foi possível concluir o cadastro. Verifique os dados e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingUnidade) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl" style={{ color: BRAND_GREEN }}></i>
      </div>
    );
  }

  if (unidadeError) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <i className="fa-solid fa-triangle-exclamation text-4xl text-amber-500 mb-4"></i>
        <h2 className="text-xl font-black text-slate-800 mb-2">Link inválido</h2>
        <p className="text-slate-500 font-medium">Peça um novo link de cadastro para a unidade.</p>
      </div>
    );
  }

  if (successData) {
    const telefoneUnidade = (unidadeInfo?.telefone || '').replace(/\D/g, '');
    const whatsappLink = telefoneUnidade
      ? `https://wa.me/55${telefoneUnidade}`
      : null;
    const petsTexto = successData.petNomes.filter(Boolean).join(', ');

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ backgroundColor: `${BRAND_GREEN}1A` }}>
          <i className="fa-solid fa-circle-check text-4xl" style={{ color: BRAND_GREEN }}></i>
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-3">Cadastro recebido!</h2>
        <p className="text-slate-500 font-medium max-w-sm mb-8">
          <span className="font-bold text-slate-700">{successData.clienteNome}</span>, o cadastro de{' '}
          <span className="font-bold text-slate-700">{petsTexto}</span> foi concluído com sucesso. Em breve entraremos em contato!
        </p>
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 rounded-2xl font-black text-white shadow-lg flex items-center gap-2"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            <i className="fa-brands fa-whatsapp text-xl"></i>
            Falar com a gente
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-6 pt-10 pb-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4" style={{ backgroundColor: BRAND_GREEN }}>
          <i className="fa-solid fa-paw text-2xl text-white"></i>
        </div>
        <h1 className="text-lg font-black text-slate-800">Igui Banho e Tosa</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{unidadeInfo?.nome}</p>
      </div>

      <div className="px-6 mb-8">
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className="flex-1 h-2 rounded-full transition-all"
              style={{ backgroundColor: s <= step ? BRAND_GREEN : '#E2E8F0' }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-32 space-y-5 max-w-md w-full mx-auto">
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <h2 className="text-xl font-black text-slate-800">Dados do tutor</h2>

            <div>
              <FieldLabel>Nome completo *</FieldLabel>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} className={inputClass} placeholder="Seu nome completo" />
            </div>

            <div>
              <FieldLabel>Celular / WhatsApp *</FieldLabel>
              <input
                type="tel"
                value={telefone}
                onInput={e => setTelefone(maskTelefone((e.target as HTMLInputElement).value))}
                className={inputClass}
                placeholder="(00) 00000-0000"
              />
            </div>

            <div>
              <FieldLabel>CPF</FieldLabel>
              <input
                type="text"
                value={cpf}
                onInput={e => setCpf(maskCpf((e.target as HTMLInputElement).value))}
                className={inputClass}
                placeholder="000.000.000-00"
              />
              {cpfPreenchidoEInvalido && (
                <p className="text-xs font-bold text-rose-500 mt-1.5 ml-1">CPF inválido. Confira os números ou deixe em branco.</p>
              )}
            </div>

            <div>
              <FieldLabel>CEP</FieldLabel>
              <div className="relative">
                <input
                  type="text"
                  value={cep}
                  onInput={e => setCep(maskCep((e.target as HTMLInputElement).value))}
                  onBlur={handleCepBlur}
                  className={inputClass}
                  placeholder="00000-000"
                />
                {buscandoCep && <i className="fa-solid fa-circle-notch fa-spin absolute right-4 top-1/2 -translate-y-1/2" style={{ color: BRAND_GREEN }}></i>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FieldLabel>Logradouro</FieldLabel>
                <input type="text" value={logradouro} onChange={e => setLogradouro(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>Número</FieldLabel>
                <input type="text" value={numero} onChange={e => setNumero(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <FieldLabel>Bairro</FieldLabel>
              <input type="text" value={bairro} onChange={e => setBairro(e.target.value)} className={inputClass} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FieldLabel>Cidade</FieldLabel>
                <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} className={inputClass} />
              </div>
              <div>
                <FieldLabel>UF</FieldLabel>
                <input type="text" value={estado} onChange={e => setEstado(e.target.value.toUpperCase().slice(0, 2))} className={inputClass} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-800">Dados do pet</h2>
              {pets.length > 0 && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg" style={{ color: BRAND_GREEN, backgroundColor: `${BRAND_GREEN}14` }}>
                  Pet {pets.length + 1}
                </span>
              )}
            </div>

            {pets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pets.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600">
                    <i className="fa-solid fa-paw text-[10px]" style={{ color: BRAND_GREEN }}></i>
                    {p.nome}
                    <button type="button" onClick={() => removePet(i)} className="text-slate-400 hover:text-rose-500">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div>
              <FieldLabel>Nome do pet *</FieldLabel>
              <input type="text" value={currentPet.nome} onChange={e => setCurrentPet(prev => ({ ...prev, nome: e.target.value }))} className={inputClass} placeholder="Ex: Rex" />
            </div>

            <div>
              <FieldLabel>Sexo *</FieldLabel>
              <div className="flex gap-3">
                <ChipButton active={currentPet.genero === 'Macho'} onClick={() => setCurrentPet(prev => ({ ...prev, genero: 'Macho' }))}>Macho</ChipButton>
                <ChipButton active={currentPet.genero === 'Fêmea'} onClick={() => setCurrentPet(prev => ({ ...prev, genero: 'Fêmea' }))}>Fêmea</ChipButton>
              </div>
            </div>

            <div>
              <FieldLabel>Espécie *</FieldLabel>
              <div className="flex gap-3">
                <ChipButton active={currentPet.especie === 'Cachorro'} onClick={() => setCurrentPet(prev => ({ ...prev, especie: 'Cachorro' }))}>Cachorro</ChipButton>
                <ChipButton active={currentPet.especie === 'Gato'} onClick={() => setCurrentPet(prev => ({ ...prev, especie: 'Gato' }))}>Gato</ChipButton>
              </div>
            </div>

            <div>
              <FieldLabel>Raça</FieldLabel>
              <input type="text" value={currentPet.raca} onChange={e => setCurrentPet(prev => ({ ...prev, raca: e.target.value }))} className={inputClass} placeholder="Ex: SRD, Golden, etc." />
            </div>

            <div>
              <FieldLabel>Porte</FieldLabel>
              <div className="flex flex-wrap gap-3">
                {PORTE_OPTIONS.map(opt => (
                  <ChipButton key={opt} active={currentPet.porte === opt} onClick={() => setCurrentPet(prev => ({ ...prev, porte: opt }))}>{opt}</ChipButton>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <h2 className="text-xl font-black text-slate-800">Saúde de {currentPet.nome || 'seu pet'}</h2>

            <div>
              <FieldLabel>O pet tem alguma alergia?</FieldLabel>
              <div className="flex gap-3">
                <ChipButton active={currentPet.temAlergia === 'sim'} onClick={() => setCurrentPet(prev => ({ ...prev, temAlergia: 'sim' }))}>Sim</ChipButton>
                <ChipButton active={currentPet.temAlergia === 'nao'} onClick={() => setCurrentPet(prev => ({ ...prev, temAlergia: 'nao', alergiaDescricao: '' }))}>Não</ChipButton>
              </div>
            </div>

            {currentPet.temAlergia === 'sim' && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <FieldLabel>Descreva a alergia</FieldLabel>
                <textarea
                  rows={3}
                  value={currentPet.alergiaDescricao}
                  onChange={e => setCurrentPet(prev => ({ ...prev, alergiaDescricao: e.target.value }))}
                  className={`${inputClass} resize-none`}
                  placeholder="Ex: alergia a determinado shampoo, picadas de pulga..."
                />
              </div>
            )}

            <div>
              <FieldLabel>Comportamento</FieldLabel>
              <div className="flex flex-wrap gap-3">
                {COMPORTAMENTO_OPTIONS.map(opt => (
                  <ChipButton key={opt} active={currentPet.comportamento.includes(opt)} onClick={() => toggleComportamento(opt)}>{opt}</ChipButton>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Observações adicionais</FieldLabel>
              <textarea
                rows={3}
                value={currentPet.observacoes}
                onChange={e => setCurrentPet(prev => ({ ...prev, observacoes: e.target.value }))}
                className={`${inputClass} resize-none`}
                placeholder="Alguma informação importante sobre o pet?"
              />
            </div>

            {submitError && (
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                <p className="text-sm font-bold text-rose-600">{submitError}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 flex flex-col gap-3 max-w-md mx-auto w-full">
        {step === 3 && (
          <button
            type="button"
            disabled={submitting}
            onClick={handleAddAnotherPet}
            className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wide border-2 border-dashed disabled:opacity-50 transition-all"
            style={{ borderColor: BRAND_GREEN, color: BRAND_GREEN }}
          >
            <i className="fa-solid fa-plus mr-2"></i>
            Adicionar outro pet
          </button>
        )}

        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(prev => (prev - 1) as 1 | 2)}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm uppercase tracking-wide"
            >
              Voltar
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 ? !canAdvanceStep1 : !canAdvanceStep2}
              onClick={() => setStep(prev => (prev + 1) as 2 | 3)}
              className="flex-[2] py-4 rounded-2xl font-black text-sm uppercase tracking-wide text-white shadow-lg disabled:opacity-40 disabled:shadow-none transition-all"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="flex-[2] py-4 rounded-2xl font-black text-sm uppercase tracking-wide text-white shadow-lg disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              {submitting ? <i className="fa-solid fa-circle-notch fa-spin"></i> : null}
              Finalizar Cadastro
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CadastroPublico;
