
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Unit } from '../types';
import { supabase } from '../services/supabaseClient';

interface MobileBrand {
  nome: string;
  logo_url: string;
}

interface UnitsContextValue {
  units: Unit[];
  fetchUnits: () => Promise<Unit[]>;
  mobileBrand: MobileBrand;
  fetchMobileBrand: () => Promise<void>;
}

const UnitsContext = createContext<UnitsContextValue | undefined>(undefined);

export const UnitsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [mobileBrand, setMobileBrand] = useState<MobileBrand>({ nome: 'IGUI BANHO E TOSA BIRIGUI', logo_url: '' });

  // Busca unidades - Dependência zero para evitar recriação
  const fetchUnits = useCallback(async () => {
    try {
      const { data, error: sbError } = await supabase.from('unidades').select('*');
      if (sbError) throw sbError;

      if (data) {
        const mappedUnits = data.map(u => ({
          id: u.id,
          name: u.nome,
          endereco_completo: u.endereco_completo,
          phone: u.telefone,
          whatsapp_nome_instancia: u.whatsapp_nome_instancia,
          whatsapp_token: u.whatsapp_token,
          whatsapp_url_servidor: u.whatsapp_url_servidor,
          whatsapp_ativo: u.whatsapp_ativo
        }));
        setUnits(mappedUnits);
        return mappedUnits;
      }
      return [];
    } catch (err: any) {
      console.error("ERRO AO CARREGAR UNIDADES:", err);
      // Permitimos renderização degradada (sem unidades) em vez de travar tudo
      return [];
    }
  }, []);

  // Extraído do useEffect original de App.tsx (que dependia de `session`).
  // O gatilho de "quando" chamar isso foi movido para AuthContext, que
  // conhece `session` e chama esta função via useUnits(). A query e o
  // tratamento de erro permanecem idênticos ao original.
  const fetchMobileBrand = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('config_sistema')
        .select('nome_fantasia, logo_url')
        .eq('id', 1)
        .maybeSingle();

      if (error || !data) return;

      setMobileBrand({
        nome: (data.nome_fantasia || 'IGUI BANHO E TOSA BIRIGUI').toUpperCase(),
        logo_url: data.logo_url || ''
      });
    } catch (err) {
      console.error("Erro ao carregar identidade mobile:", err);
    }
  }, []);

  const value: UnitsContextValue = {
    units,
    fetchUnits,
    mobileBrand,
    fetchMobileBrand
  };

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
};

export const useUnits = (): UnitsContextValue => {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits deve ser usado dentro de um UnitsProvider');
  return ctx;
};
