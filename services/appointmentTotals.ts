export const toCurrencyNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatCurrencyBR = (value: unknown) => `R$ ${toCurrencyNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isExtraAppointmentItem = (item: any) =>
  item?.eh_extra === true || item?.tipo === 'adicional' || item?.tipo === 'extra';

const firstPositive = (values: unknown[]) => {
  for (const value of values) {
    const parsed = toCurrencyNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
};

export const getAppointmentItemValue = (item: any) => firstPositive([
  item?.valor_cobrado,
  item?.valor_extra,
  item?.valor,
  item?.servicos?.preco_base
]);

export interface AppointmentTotalsInput {
  appointment?: any;
  items?: any[];
  services?: any[];
  selectedServiceIds?: Array<number | string>;
  transportValue?: unknown;
  discountValue?: unknown;
  manualServiceValue?: unknown;
}

export const calculateAppointmentTotals = ({
  appointment,
  items,
  services = [],
  selectedServiceIds = [],
  transportValue,
  discountValue,
  manualServiceValue
}: AppointmentTotalsInput) => {
  const appointmentItems = items || appointment?.agendamento_itens || [];
  const extraItems = appointmentItems.filter(isExtraAppointmentItem);
  const mainItems = appointmentItems.filter((item: any) => !isExtraAppointmentItem(item));

  const selectedServicesTotal = selectedServiceIds.reduce((sum, serviceId) => {
    const service = services.find((srv: any) => String(srv.id) === String(serviceId));
    return sum + toCurrencyNumber(service?.preco_base);
  }, 0);

  const mainItemsTotal = mainItems.reduce((sum: number, item: any) => sum + getAppointmentItemValue(item), 0);
  const extrasFromItems = extraItems.reduce((sum: number, item: any) => sum + getAppointmentItemValue(item), 0);
  const savedExtras = toCurrencyNumber(appointment?.valor_extra_total);
  const extrasTotal = Math.max(extrasFromItems, savedExtras);
  const transportTotal = toCurrencyNumber(transportValue ?? appointment?.valor_transporte);
  const discountTotal = toCurrencyNumber(discountValue ?? appointment?.valor_desconto ?? appointment?.desconto);
  const savedAppointmentTotal = toCurrencyNumber(appointment?.valor_total);
  const savedServicesTotal = toCurrencyNumber(appointment?.valor_servicos);
  const manualServicesTotal = toCurrencyNumber(manualServiceValue);

  const packageTotal = toCurrencyNumber(appointment?.pacotes?.valor_total);
  const packageSessionTotal = savedAppointmentTotal;
  const packageSessionCount = toCurrencyNumber(appointment?.pacotes?.qtd_sessoes);

  let servicesTotal = firstPositive([
    selectedServicesTotal,
    manualServicesTotal,
    savedServicesTotal,
    mainItemsTotal
  ]);

  if (servicesTotal <= 0 && savedAppointmentTotal > 0) {
    servicesTotal = Math.max(0, savedAppointmentTotal - transportTotal - extrasTotal + discountTotal);
  }

  const generalTotal = Math.max(0, servicesTotal + extrasTotal + transportTotal - discountTotal);

  return {
    servicesTotal,
    extrasTotal,
    transportTotal,
    discountTotal,
    generalTotal,
    packageTotal,
    packageSessionTotal,
    packageSessionCount,
    mainItems,
    extraItems
  };
};
