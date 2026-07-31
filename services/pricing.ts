export interface AppointmentTotalsInput {
  mainItemValues: number[];
  extraItemValues: number[];
  valorTransporte: number;
  valorDesconto: number;
  valorAcrescimo: number;
  isPacote: boolean;
  valorTotalSalvo: number;
  valorServicosSalvo: number;
}

export interface AppointmentTotalsResult {
  valorServicos: number;
  totalExtra: number;
  valorTransporte: number;
  valorDesconto: number;
  valorAcrescimo: number;
  totalGeral: number;
}

export function calculateAppointmentTotals(input: AppointmentTotalsInput): AppointmentTotalsResult {
  const {
    mainItemValues,
    extraItemValues,
    valorTransporte,
    valorDesconto,
    valorAcrescimo,
    isPacote,
    valorTotalSalvo,
    valorServicosSalvo
  } = input;

  const totalMainItems = mainItemValues.reduce((acc, v) => acc + (Number(v) || 0), 0);
  const totalExtraItens = extraItemValues.reduce((acc, v) => acc + (Number(v) || 0), 0);
  const totalExtra = extraItemValues.length > 0 ? totalExtraItens : 0;
  const totalBaseAgendamento = Number(valorTotalSalvo || 0);
  const valorServicosSalvoNum = Number(valorServicosSalvo || 0);

  const valorServicosDireto = valorServicosSalvoNum > 0 ? valorServicosSalvoNum : totalMainItems;
  const totalDireto = valorServicosDireto + valorTransporte + totalExtra - valorDesconto + valorAcrescimo;
  const valorServicosCalculado = Math.max(0, totalBaseAgendamento - valorTransporte - totalExtra + valorDesconto - valorAcrescimo);
  const deveUsarFallbackDoTotal = totalBaseAgendamento > 0 && (valorServicosDireto <= 0 || Math.abs(totalDireto - totalBaseAgendamento) > 0.01);

  const valorServicos = isPacote
    ? Math.max(0, valorServicosDireto || totalBaseAgendamento)
    : (deveUsarFallbackDoTotal ? valorServicosCalculado : Math.max(0, valorServicosDireto));

  const totalGeral = isPacote
    ? totalBaseAgendamento
    : Math.max(0, valorServicos + valorTransporte + totalExtra - valorDesconto + valorAcrescimo);

  return {
    valorServicos,
    totalExtra,
    valorTransporte,
    valorDesconto,
    valorAcrescimo,
    totalGeral
  };
}
