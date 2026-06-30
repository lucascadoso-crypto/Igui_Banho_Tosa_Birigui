# Dashboard Components Guide (FASE 4.3)

API de referência dos componentes criados em `components/Dashboard/` e do hook `hooks/useDashboardData.ts`.

## KPICard

`components/Dashboard/KPICard.tsx`

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `label` | `string` | sim | Rótulo acima do valor |
| `value` | `string \| number` | sim | Valor principal exibido |
| `subtext` | `string` | não | Texto auxiliar abaixo do valor |
| `icon` | `string` | não | Classe do ícone Font Awesome (ex: `'fa-sack-dollar'`) |
| `color` | `'slate' \| 'amber' \| 'emerald' \| 'rose' \| 'indigo' \| 'blue' \| 'purple' \| 'orange'` | não | Paleta do ícone |
| `trend` | `{ value: number; label?: string; direction?: 'up' \| 'down' \| 'neutral' }` | não | Indicador de variação |
| `onClick` | `() => void` | não | Torna o card clicável |
| `loading` | `boolean` | não | Mostra skeleton no lugar do valor |
| `fullWidth` | `boolean` | não | Ocupa a linha inteira do grid |

```tsx
<KPICard
  label="Receita"
  value={formatCurrencyBR(kpis.receita)}
  icon="fa-sack-dollar"
  color="emerald"
  loading={isLoading}
/>
```

## AlertBar

`components/Dashboard/AlertBar.tsx`

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `type` | `'info' \| 'warning' \| 'error' \| 'success'` | não (default `info`) | Define cor e ícone padrão |
| `message` | `string` | sim | Texto do alerta |
| `action` | `{ label: string; onClick: () => void }` | não | Botão de ação |
| `onAction` | `() => void` | não | Atalho para criar uma ação com rótulo "Ver mais" |
| `onClose` | `() => void` | não | Callback ao fechar |
| `dismissible` | `boolean` | não (default `true`) | Mostra o botão de fechar quando `onClose` é informado |
| `icon` | `string` | não | Sobrescreve o ícone padrão do tipo |

```tsx
<AlertBar
  type="warning"
  message="3 pacote(s) próximos do vencimento."
  dismissible
  onClose={() => dismiss('pacotes-vencendo')}
/>
```

## QuickActionButtons

`components/Dashboard/QuickActionButtons.tsx`

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `actions` | `QuickAction[]` | sim | Lista de ações |
| `layout` | `'grid' \| 'row'` | não (default `grid`) | Disposição dos botões |
| `columns` | `1 \| 2 \| 3 \| 4` | não (default `3`) | Colunas do grid (ignorado em `row`) |

`QuickAction`: `{ id, label, icon, onClick, badge?, loading?, color? }`

```tsx
<QuickActionButtons
  columns={3}
  actions={[
    { id: 'novo-agendamento', label: 'Novo Agendamento', icon: 'fa-calendar-plus', color: 'amber', onClick: abrirAgendamento },
    { id: 'receber', label: 'Receber Pagamento', icon: 'fa-money-bill-wave', color: 'emerald', onClick: abrirRecebimento },
    { id: 'renovar', label: 'Renovar Pacote', icon: 'fa-rotate', color: 'indigo', onClick: abrirRenovacao }
  ]}
/>
```

## RevenueChart

`components/Dashboard/RevenueChart.tsx`

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data` | `RevenueChartPoint[]` | sim | `{ date, receita, despesa, liquido }[]` |
| `type` | `'line' \| 'bar'` | não (default `line`) | Tipo de gráfico (Recharts) |
| `height` | `number` | não (default `320`) | Altura em pixels |
| `title` | `string` | não | Título do card |
| `loading` | `boolean` | não | Mostra spinner |
| `showLegend` | `boolean` | não (default `true`) | Mostra legenda de cores |

Tooltip customizado formata valores com `formatCurrencyBR` de `services/appointmentTotals.ts`.

## useDashboardData

`hooks/useDashboardData.ts`

```ts
const { kpis, alerts, isLoading, error, refetch } = useDashboardData(units, supabaseClient);
```

- `kpis`: `{ receita, despesa, saldo, agendamentos, chartData }`
- `alerts`: `{ id, type, message }[]` gerados automaticamente
- Busca primeiro em `dashboard_cache`; se a tabela estiver vazia ou indisponível, calcula manualmente a partir de `agendamentos`, `pacotes` e `despesas`
- Refetch automático a cada 5 minutos e via `useSyncRefresh(['dashboard'], refetch)` (realtime)
