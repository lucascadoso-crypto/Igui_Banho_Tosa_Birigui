// Checklist minimo antes de qualquer rascunho/emissao de NFS-e: dados da
// empresa preenchidos, servico com configuracao fiscal ativa e cliente com
// CPF + endereco validos (exigencia da nota fiscal de servico) - exceto
// quando o valor fiscal e ate R$100, caso em que o Sistema Nacional NFS-e
// nao exige identificacao do tomador (toma e opcional no leiaute da DPS).

export const LIMITE_VALOR_SEM_DADOS_CLIENTE = 100;

export interface ChecklistFiscalInput {
  configFiscal?: any | null;
  servicosFiscais: any[];
  cliente?: any | null;
  valorFiscal?: number;
}

export interface ChecklistFiscalResultado {
  empresaOk: boolean;
  servicoOk: boolean;
  clienteCpfOk: boolean;
  clienteEnderecoOk: boolean;
  dadosClienteDispensados: boolean;
  podeEmitir: boolean;
  pendencias: string[];
}

export const avaliarChecklistFiscal = ({ configFiscal, servicosFiscais, cliente, valorFiscal }: ChecklistFiscalInput): ChecklistFiscalResultado => {
  const empresaOk = !!(configFiscal?.cnpj && configFiscal?.inscricao_municipal && configFiscal?.regime_tributario);

  const servicoOk = (servicosFiscais || []).length > 0
    && servicosFiscais.every(sf => !!(sf?.codigo_servico_municipal && sf?.codigo_nbs));

  const dadosClienteDispensados = Number(valorFiscal || 0) > 0 && Number(valorFiscal || 0) <= LIMITE_VALOR_SEM_DADOS_CLIENTE;

  const clienteCpfOk = dadosClienteDispensados || !!(cliente?.cpf && cliente.cpf.replace(/\D/g, '').length === 11);

  const clienteEnderecoOk = dadosClienteDispensados || !!(
    cliente?.logradouro && cliente?.numero && cliente?.cidade && cliente?.estado && cliente?.cep
  );

  const pendencias: string[] = [];
  if (!empresaOk) pendencias.push('Cadastro da empresa incompleto (CNPJ, inscrição municipal ou regime tributário).');
  if (!servicoOk) pendencias.push('Um ou mais serviços deste atendimento ainda não têm configuração fiscal ativa.');
  if (!clienteCpfOk) pendencias.push('Cliente sem CPF válido cadastrado.');
  if (!clienteEnderecoOk) pendencias.push('Cliente sem endereço completo cadastrado.');

  return {
    empresaOk,
    servicoOk,
    clienteCpfOk,
    clienteEnderecoOk,
    dadosClienteDispensados,
    podeEmitir: empresaOk && servicoOk && clienteCpfOk && clienteEnderecoOk,
    pendencias
  };
};

// Monta o link de auto-cadastro (mesma rota publica de App.tsx) e um texto
// pronto para enviar por WhatsApp, reaproveitando o merge automatico da
// Frente 1 quando o cliente preencher os dados que faltam.
export const montarLinkCadastroWhatsapp = (unidadeId: number | string, telefone?: string | null, nomeCliente?: string) => {
  const link = `${window.location.origin}/cadastro?unidade=${unidadeId}`;
  const texto = `Olá${nomeCliente ? ` ${nomeCliente}` : ''}! Para emitirmos sua nota fiscal, precisamos completar seu cadastro (CPF e endereço). Por favor, preencha por este link: ${link}`;
  const digits = (telefone || '').replace(/\D/g, '');
  const whatsappUrl = digits
    ? `https://wa.me/55${digits}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  return { link, whatsappUrl };
};
