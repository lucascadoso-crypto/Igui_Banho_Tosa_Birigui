# Checklist Operacional V2

Data: 2026-06-08

Objetivo: garantir que a V2 esteja 100% operacional com dados de teste antes de migrar dados reais.

## 1. Seguranca e ambiente

- [ ] Confirmar Supabase novo: `Igui_Banho_Tosa_Birigui`.
- [ ] Usar `VITE_SUPABASE_URL=https://ihhylytyompvdhkphgud.supabase.co`.
- [ ] Colocar `VITE_SUPABASE_ANON_KEY` somente em `.env.local` e na Vercel.
- [ ] Remover qualquer chave real versionada.
- [ ] Remover fallbacks reais de Supabase no frontend.
- [ ] Remover fallback real de ImgBB no frontend.
- [ ] Criar `.env.example` sem valores reais.
- [ ] Configurar secrets da Edge Function no Supabase novo.
- [ ] Garantir que service role nunca va para o frontend.

## 2. Banco

- [ ] Adicionar arquivos reais em `docs/supabase-antigo`.
- [ ] Revisar schema antigo antes das migrations finais.
- [ ] Criar migrations em `supabase/migrations`.
- [ ] Criar tabelas com `unidade_id` nas principais.
- [ ] Criar chaves estrangeiras.
- [ ] Criar indices.
- [ ] Criar RLS.
- [ ] Criar seeds de teste.
- [ ] Testar reset/reaplicacao das migrations em ambiente limpo.

## 3. Autenticacao e permissoes

- [ ] Login com Supabase Auth.
- [ ] Usuario pendente bloqueado.
- [ ] Usuario ativo acessa apenas sua unidade.
- [ ] Master acessa todas as unidades.
- [ ] Financeiro acessa telas financeiras autorizadas.
- [ ] Atendente acessa agenda/clientes/pacotes autorizados.
- [ ] Tosador acessa agenda e detalhes permitidos.
- [ ] RLS bloqueia dados de outra unidade mesmo com chamada direta.

## 4. Unidades

- [ ] Criar unidade Birigui de teste.
- [ ] Editar dados da unidade.
- [ ] Ativar/desativar unidade.
- [ ] Configurar servicos por unidade.
- [ ] Configurar WhatsApp por unidade sem expor token no frontend.

## 5. Funcionarios

- [ ] Criar funcionario de teste.
- [ ] Vincular funcionario ao Auth.
- [ ] Vincular funcionario a unidade.
- [ ] Alterar perfil.
- [ ] Desativar funcionario.
- [ ] Validar bloqueio de funcionario inativo.

## 6. Clientes

- [ ] Criar cliente com nome e telefone.
- [ ] Editar cliente.
- [ ] Buscar por nome.
- [ ] Buscar por telefone.
- [ ] Ver detalhes.
- [ ] Validar `unidade_id`.
- [ ] Impedir visualizacao entre unidades via RLS.

## 7. Pets

- [ ] Criar pet vinculado ao cliente.
- [ ] Editar pet.
- [ ] Registrar restricoes.
- [ ] Registrar comportamento/observacoes.
- [ ] Ver historico.
- [ ] Validar `unidade_id`.

## 8. Servicos

- [ ] Criar servico.
- [ ] Editar preco base.
- [ ] Ativar/desativar servico.
- [ ] Configurar preco por unidade.
- [ ] Usar servico em agendamento.
- [ ] Usar servico em pacote.

## 9. Pacotes

- [ ] Criar pacote para pet.
- [ ] Gerar sessoes automaticamente.
- [ ] Definir quantidade de sessoes.
- [ ] Definir intervalo semanal/quinzenal.
- [ ] Registrar pagamento total.
- [ ] Registrar pagamento dividido.
- [ ] Ver saldo de sessoes.
- [ ] Cancelar pacote.
- [ ] Renovar pacote.
- [ ] Validar impacto financeiro.

## 10. Agenda/sessoes

- [ ] Criar agendamento avulso.
- [ ] Criar agendamento de pacote.
- [ ] Editar data/horario.
- [ ] Adicionar itens de servico.
- [ ] Marcar como confirmado.
- [ ] Iniciar atendimento.
- [ ] Finalizar atendimento.
- [ ] Cancelar.
- [ ] Registrar falta.
- [ ] Registrar taxi/transporte.
- [ ] Registrar extra.
- [ ] Enviar WhatsApp manual.

## 11. Financeiro

- [ ] Receita avulsa aparece no dia correto.
- [ ] Receita de pacote aparece no dia do pagamento.
- [ ] Pagamento dividido soma corretamente.
- [ ] Extras aparecem no dia do pagamento extra.
- [ ] Transporte aparece separado.
- [ ] Despesas aparecem como saida.
- [ ] Total por Pix confere.
- [ ] Total por dinheiro confere.
- [ ] Total por cartao confere.
- [ ] Relatorio por periodo funciona.

## 12. WhatsApp

- [ ] Edge Function criada no Supabase novo.
- [ ] Funcao usa secrets do Supabase.
- [ ] Envio manual registra log.
- [ ] Envio de lembrete registra log.
- [ ] Erro registra `detalhe_erro`.
- [ ] Logs aparecem na tela.
- [ ] Token nao aparece no frontend.

## 13. Auditoria

- [ ] Criacao de cliente gera log.
- [ ] Edicao de cliente gera log.
- [ ] Criacao de pet gera log.
- [ ] Criacao de pacote gera log.
- [ ] Cancelamento de pacote gera log.
- [ ] Criacao/finalizacao de agendamento gera log.
- [ ] Pagamento gera log.
- [ ] Despesa gera log.
- [ ] Log inclui unidade, usuario, acao e registro.

## 14. Mobile-first

- [ ] Login funciona bem no celular.
- [ ] Menu mobile nao cobre conteudo indevidamente.
- [ ] Agenda diaria e usavel no celular.
- [ ] Cards nao quebram texto.
- [ ] Formularios longos sao navegaveis.
- [ ] Modais cabem no viewport.
- [ ] Botao principal e facil de tocar.
- [ ] Financeiro e legivel sem tabela larga.
- [ ] Pacotes e sessoes aparecem em cards.

## 15. Homologacao com dados de teste

- [ ] Criar base limpa.
- [ ] Rodar migrations.
- [ ] Rodar seeds de teste.
- [ ] Entrar como master.
- [ ] Entrar como usuario de unidade.
- [ ] Executar fluxo completo: cliente -> pet -> pacote -> sessoes -> pagamento -> WhatsApp -> auditoria.
- [ ] Corrigir problemas antes de qualquer migracao real.

## 16. Proibido nesta fase

- [ ] Importar clientes reais.
- [ ] Importar pets reais.
- [ ] Importar pacotes reais.
- [ ] Importar agendamentos reais.
- [ ] Conectar scripts ao Supabase antigo para escrita.
- [ ] Versionar chaves reais.
