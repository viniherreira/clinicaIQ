# Plano: CPF repetido (F-15) e versão da chave (F-16)

Auditoria de segurança de 28/10/2026. Situação em produção em 29/10/2026 (contagem só leitura):
538 pacientes, 272 com CPF (267 ativos), em 2 das 11 clínicas.

## F-15: conferir CPF repetido

**Problema.** `createPatient` e `updatePatient` (`apps/web/app/(app)/pacientes/actions.ts`) procuram
o CPF repetido comparando `cpfEncrypted` com `encrypt(cpf)`. Como o IV é aleatório, o texto cifrado
nunca é igual, e a mensagem "CPF já cadastrado nesta clínica" nunca aparece. Hoje dá para cadastrar o
mesmo CPF várias vezes.

**Correção.**
1. Coluna nova `patients.cpfHash` com o índice cego do CPF: `hashForTenant('cpf:' + dígitos)`, o mesmo
   jeito do `phoneHash` dos leads. O SQL está em `2026-10-29-cpf-hash.sql` e só acrescenta.
2. Cadastro e edição gravam o `cpfHash` junto com o CPF, e conferem o repetido por ele.
3. Pacientes antigos: o relógio do CRM preenche o `cpfHash` em lotes de 200 por minuto. Os 272 ficam
   prontos no primeiro minuto depois do deploy. Só o app tem a chave, então isso não dá para fazer em SQL.
4. Enquanto existir paciente da clínica com CPF e sem `cpfHash`, a conferência também abre esses poucos
   e compara. Assim não há janela em que o repetido passa.
5. Os CPFs repetidos que **já existem** não são mexidos. Depois do deploy, uma consulta só de leitura
   conta quantos há por clínica (sem mostrar CPF nem nome), e o dono decide.

**Teste.** Um teste de banco que cadastra o mesmo CPF duas vezes (uma com máscara, outra sem) e espera
o erro. Ele falha hoje e passa depois. Outro cobre um paciente antigo sem `cpfHash` e o preenchimento em lote.

## F-16: versão da chave de criptografia

**Problema.** Tudo o que é cifrado (CPF e telefones dos pacientes, telefones de leads e conversas,
mensagens do chat, token da API oficial) usa uma única `ENCRYPTION_MASTER_KEY`, e o texto cifrado não diz
qual chave usou. Se a chave vazar, não há como trocá-la sem deixar tudo ilegível de uma vez.

**Correção, parte 1 (este PR, sem mudar nenhum dado):**
1. Chaves numeradas: a atual continua sendo `ENCRYPTION_MASTER_KEY` (versão 1). Uma futura seria
   `ENCRYPTION_MASTER_KEY_2`, escolhida por `ENCRYPTION_KEY_VERSION=2`.
2. Formato: o que já está gravado (sem prefixo) é versão 1 e continua abrindo. Com a versão 1 ativa,
   o app grava exatamente como hoje. Só a partir da versão 2 o texto cifrado ganha o prefixo `k2.`.
3. Índices cegos (`phoneHash`, `cpfHash`): durante uma troca, a busca procura pelos códigos das duas
   chaves, para nada sumir no meio.
4. Uma tarefa de recifrar no relógio do CRM, parada enquanto só existe a versão 1. Numa troca, ela
   passa cada registro para a chave nova em lotes, refazendo os índices cegos junto.
5. Roteiro `docs/producao/rotacao-chave.md` com o passo a passo de uma troca.

**O que NÃO acontece agora.** Nenhuma chave é trocada e nenhum dado é recifrado. Com o deploy, o
comportamento fica igual ao de hoje. A troca só acontece se um dia for preciso, seguindo o roteiro e
com o "pode" do dono.

**Teste.** Testes unitários: o texto antigo abre; com a versão 2 o texto novo sai com `k2.` e abre;
o antigo continua abrindo durante a troca; sem a chave da versão pedida, o erro é claro. E um teste de
banco da tarefa de recifrar: converte os registros e a busca por telefone continua achando o lead.

## Opcional (precisa de "pode", apaga dado)

`whatsapp_auth_keys` tem 1.718 linhas de credenciais cifradas das sessões antigas de QR. O QR saiu do
ar e nenhuma sessão está conectada. Apagar essas linhas tira do banco um material que não serve mais.
O SQL seria escrito à parte e mostrado antes.

## Ordem

1. Dono aprova este plano.
2. Branch `fix/seguranca-cpf-chave`: um commit para o F-15 e outro para o F-16, cada um com teste.
   Rodar lint, build, typecheck e vitest.
3. Rodar `2026-10-29-cpf-hash.sql` em produção (só acrescenta). Depois o PR e o merge.
4. Depois do deploy: conferir que `faltam` chegou a 0 e contar os CPFs repetidos.
