# Estrutura FASE 4 — Mapa de Arquivos

```
SISTEMA PET/
├── components/
│   ├── Dashboard/                          ✅ NOVO (FASE 4.3)
│   │   ├── KPICard.tsx
│   │   ├── AlertBar.tsx
│   │   ├── QuickActionButtons.tsx
│   │   └── RevenueChart.tsx
│   ├── PainelGeral.tsx                     ✏️ MODIFICADO (FASE 4.3)
│   └── Dashboard.tsx                       (painel por unidade, com insights Gemini — não tocado)
│
├── hooks/
│   ├── useSyncRefresh.ts                   (existente)
│   └── useDashboardData.ts                 ✅ NOVO (FASE 4.3)
│
├── services/
│   ├── supabaseClient.ts                   (existente)
│   ├── appointmentTotals.ts                (existente — formatCurrencyBR, toCurrencyNumber)
│   └── realtimeSync.ts                     (existente — subscribeSyncRefresh)
│
├── supabase/migrations/
│   ├── 0001 … 0026                         (existentes)
│   └── 0030_dashboard_cache_and_sync_logs.sql   ✅ NOVO (FASE 4.3)
│
├── DASHBOARD_COMPONENTS_GUIDE.md           ✅ NOVO
├── FASE_4_3_IMPLEMENTATION.md              ✅ NOVO
├── FASE_4_3_QUICKSTART.md                  ✅ NOVO
├── FASE_4_PROGRESS.md                      ✅ NOVO
└── ESTRUTURA_FASE_4.md                     ✅ NOVO (este arquivo)
```

## Tabelas envolvidas (migration 0030)

| Tabela | Tipo | Campos principais |
|---|---|---|
| `sync_logs` | nova | `unidade_id`, `tipo`, `status`, `registros_afetados`, `mensagem`, `detalhes`, `criado_em` |
| `dashboard_cache` | nova | `unidade_id`, `data_cache`, `total_entrada_dia`, `total_saida_dia`, `saldo_liquido_dia`, `total_recebido`, `total_pendente`, `agendamentos_dia`, `agendamentos_concluidos`, `pacotes_vencendo` |

Funções/triggers criados: `fn_refresh_dashboard_cache`, `fn_sync_dashboard_cache_on_agendamento`,
`fn_sync_dashboard_cache_on_despesa` (mantêm `dashboard_cache` em dia automaticamente).
