
import React, { useState } from 'react';
import { Unit } from '../types';
import { enviarNotificacaoWhatsApp } from '../services/whatsappService';

interface ReceptionProps {
  unit: Unit;
  supabaseClient: any;
}

const Reception: React.FC<ReceptionProps> = ({ unit, supabaseClient }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [petName, setPetName] = useState('');
  const [petBreed, setPetBreed] = useState('');
  const [petSize, setPetSize] = useState('Médio');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseClient) {
      alert("Configure as chaves do Supabase no topo do arquivo App.tsx para salvar dados reais.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // 1. Inserir Cliente - Alinhado com a coluna 'unidade_preferencial_id' do SQL
      const { data: clientData, error: clientError } = await supabaseClient
        .from('clientes')
        .insert([{ 
          nome: clientName, 
          telefone: clientPhone, 
          unidade_preferencial_id: unit.id 
        }])
        .select()
        .single();

      if (clientError) throw clientError;

      // 2. Inserir Pet vinculado ao Cliente - Alinhado com a coluna 'porte' do SQL
      const { error: petError } = await supabaseClient
        .from('pets')
        .insert([{
          cliente_id: clientData.id,
          nome: petName,
          raca: petBreed,
          porte: petSize
        }]);

      if (petError) throw petError;

      // --- GATILHO WHATSAPP BOAS-VINDAS (NÃO-BLOQUEANTE) ---
      if (clientPhone) {
        const msg = `Olá, ${clientName}! Seja bem-vindo(a) à Igui Banho e Tosa! 🐾 Já estamos com a ficha do(a) ${petName} pronta aqui. ✨`;
        enviarNotificacaoWhatsApp({
          telefone: clientPhone,
          mensagem: msg,
          unidadeId: unit.id,
          supabaseClient
        });
      }

      setSuccess(true);
      // Limpar form
      setClientName('');
      setClientPhone('');
      setPetName('');
      setPetBreed('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao salvar os dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 p-6 text-white">
          <h2 className="text-2xl font-bold">Nova Recepção - {unit.name}</h2>
          <p className="text-indigo-100 text-sm">Cadastre o cliente e o pet para iniciar o atendimento.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Sessão Cliente */}
          <div>
            <div className="flex items-center space-x-2 mb-4 border-b border-slate-100 pb-2">
              <span className="text-xl">👤</span>
              <h3 className="text-lg font-bold text-slate-800">Dados do Responsável</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Nome do Dono</label>
                <input 
                  required
                  type="text" 
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Telefone / WhatsApp</label>
                <input 
                  required
                  type="tel" 
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          {/* Sessão Pet */}
          <div>
            <div className="flex items-center space-x-2 mb-4 border-b border-slate-100 pb-2">
              <span className="text-xl">🐾</span>
              <h3 className="text-lg font-bold text-slate-800">Dados do Pet</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Nome do Pet</label>
                <input 
                  required
                  type="text" 
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Ex: Rex"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Raça</label>
                <input 
                  required
                  type="text" 
                  value={petBreed}
                  onChange={(e) => setPetBreed(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Ex: Golden Retriever"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Porte</label>
                <select 
                  value={petSize}
                  onChange={(e) => setPetSize(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="Pequeno">Pequeno</option>
                  <option value="Médio">Médio</option>
                  <option value="Grande">Grande</option>
                  <option value="Gigante">Gigante</option>
                </select>
              </div>
            </div>
          </div>

          {/* Alertas */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
              ❌ {error}
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">
              ✅ Cliente e Pet cadastrados com sucesso no Supabase!
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button 
              type="submit"
              disabled={loading}
              className={`px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                  SALVANDO...
                </>
              ) : (
                'SALVAR CADASTRO'
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-start space-x-3">
          <span className="text-xl">ℹ️</span>
          <p className="text-sm text-amber-800">
            <strong>Dica:</strong> Após salvar, você poderá agendar um serviço para este pet na aba <b>Agendamentos</b>.
          </p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-start space-x-3">
          <span className="text-xl">📡</span>
          <p className="text-sm text-indigo-800">
            <strong>Status do Banco:</strong> Conectado à unidade <b>{unit.name}</b>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Reception;
