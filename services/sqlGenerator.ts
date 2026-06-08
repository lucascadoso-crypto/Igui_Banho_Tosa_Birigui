export const generateSupabaseSQL = () => {
  return `-- Schema V2 mantido por migrations versionadas.
-- Consulte a pasta supabase/migrations.
-- Schema atual: 0013_bigint_business_ids.sql.
`;
};

export const generateLegacySupabaseSQL = () => {
  return `-- SQL legado inline desativado.
-- A V2 agora usa IDs de negocio em bigint identity.
-- Supabase Auth continua usando uuid em auth.users.id.
-- funcionarios.user_id continua uuid para vinculo com auth.users.
`;
};
