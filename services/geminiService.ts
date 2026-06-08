
import { GoogleGenAI } from "@google/genai";
import { Appointment, Transaction, Unit } from "../types";

export const getBusinessInsights = async (
  unit: Unit,
  appointments: Appointment[],
  transactions: Transaction[]
) => {
  const apiKey = (import.meta as any).env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Analise os dados da unidade "${unit.name}" da rede Pet Shop "iG Banho e Tosa".
    
    Dados atuais:
    - Agendamentos: ${JSON.stringify(appointments)}
    - Transações Financeiras: ${JSON.stringify(transactions)}
    
    Por favor, forneça um breve resumo (em Português) sobre a saúde desta unidade, sugerindo melhorias de lucro ou eficiência operacional. Seja direto e use bullet points se necessário.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: "Você é um consultor sênior de gestão de negócios para redes de Pet Shop."
      }
    });
    
    if (!response.text) {
      throw new Error("Resposta vazia da IA.");
    }

    return response.text;
  } catch (error: any) {
    console.error("Error fetching insights:", error);
    
    // Tratamento específico para erro de Quota (429)
    if (error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      return "LIMITE_ATINGIDO";
    }

    return "ERRO_GENERICO";
  }
};
