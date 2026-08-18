// Checklist minimo antes de qualquer rascunho/emissao de NFS-e: dados da
// empresa preenchidos e servico com configuracao fiscal ativa.
//
// CPF e endereco do tomador sao sempre opcionais, independente do valor da
// nota: nenhum dos dois e exigido pelo leiaute da DPS para emissao via API
// (toma e toma/end sao opcionais no XSD oficial; sem CPF, a DPS usa
// cNaoNIF - "Dispensado do NIF"/"Nao exigencia do NIF" - mecanismo
// confirmado no manual do Emissor Publico Nacional, sem limite de valor
// associado). Endereco nem chega a ser enviado na DPS.
//
// Se o cadastro do cliente ja tiver CPF/endereco, eles sao usados
// normalmente - isso so afeta o que BLOQUEIA a criacao do rascunho.

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
  podeEmitir: boolean;
  pendencias: string[];
}

export const avaliarChecklistFiscal = ({ configFiscal, servicosFiscais }: ChecklistFiscalInput): ChecklistFiscalResultado => {
  const empresaOk = !!(configFiscal?.cnpj && configFiscal?.inscricao_municipal && configFiscal?.regime_tributario);

  const servicoOk = (servicosFiscais || []).length > 0
    && servicosFiscais.every(sf => !!(sf?.codigo_servico_municipal && sf?.codigo_nbs));

  // CPF e endereco nunca bloqueiam mais a emissao - so informam se o
  // cadastro ja tiver.
  const clienteCpfOk = true;
  const clienteEnderecoOk = true;

  const pendencias: string[] = [];
  if (!empresaOk) pendencias.push('Cadastro da empresa incompleto (CNPJ, inscrição municipal ou regime tributário).');
  if (!servicoOk) pendencias.push('Um ou mais serviços deste atendimento ainda não têm configuração fiscal ativa.');

  return {
    empresaOk,
    servicoOk,
    clienteCpfOk,
    clienteEnderecoOk,
    podeEmitir: empresaOk && servicoOk,
    pendencias
  };
};
