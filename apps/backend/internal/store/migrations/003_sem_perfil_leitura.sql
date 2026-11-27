-- A POC prevê só os perfis de professor e de administrador.
-- Contas "leitura" viram professor desativado: o admin decide se reativa.
DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE perfil = 'leitura');
UPDATE usuarios SET perfil = 'professor', ativo = 0 WHERE perfil = 'leitura';
