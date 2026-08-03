# Entrega no WhatsApp pelo QR code

Como aumentar a chance de a mensagem chegar quando a clínica usa a própria linha
pareada por QR (Baileys), sem API oficial.

**O que este documento não promete.** O canal não oficial não tem garantia de
entrega. A Meta não publica as regras, elas mudam sem aviso, e o mesmo número
pode entregar hoje e parar amanhã. O que está aqui são os fatores que o
comportamento observado e a documentação pública indicam que pesam — cada um
melhora a probabilidade, nenhum a assegura.

Medição real desta instalação em 03/08/2026:
**8 entregas em 68 envios (12%)**, todas para contatos pessoais do dono da
clínica. Dos 17 pacientes reais, **nenhum recebeu**.

O que já foi descartado com medição, para ninguém repetir o caminho:

| hipótese | como foi testada | resultado |
|---|---|---|
| keys store não persiste sessões | `keys.get` num processo separado | 100% íntegras, round-trip byte-idêntico |
| sessão Signal não é criada | `keys.set` instrumentado durante o envio | criada e persistida |
| mapeamento de LID vencido | apagado e refeito do zero | LID correto, sem efeito |
| número inválido | `onWhatsApp` 6× seguidas | existe, determinístico |
| IP de datacenter / fora do Brasil | gateway rodado em IP residencial no Brasil | **sem efeito** |

---

## Os fatores, em ordem de impacto

### 1. Quem falou primeiro — o fator dominante

Mensagem automática para quem **nunca contatou o número** é recusada. Não é
demora nem filtro silencioso: o WhatsApp devolve `ack 0` em segundos, com número
válido, sessão Signal criada e persistida, e LID correto.

Quem entrega, nesta instalação, é exatamente quem já tinha conversa com a linha.
Um contato que só passou a receber depois de o dono mandar um "oi" manual é a
demonstração mais direta: nada mudou no código entre uma tentativa e outra.

Contorno — fazer o paciente iniciar. Depois da primeira mensagem dele, a entrega
passa a funcionar:

- QR code impresso na recepção (a tela do WhatsApp gera um pronto)
- Link `wa.me` no site, no rodapé do e-mail e na confirmação de agendamento
- Primeiro contato manual da recepção com paciente novo — uma vez só

### 2. De onde o dispositivo conecta — **testado, não era a causa**

A hipótese era boa: o anti-abuso pontua o IP da sessão, e rodar no Railway
(US West) somava dois sinais ruins — país diferente do celular e faixa de
datacenter. O próprio WhatsApp avisa na tela de pareamento ("risco de golpe…
San Jose").

**Medido em 03/08/2026 e descartado.** O gateway foi rodado na máquina do dono,
em IP residencial brasileiro, na mesma cidade do celular. A sessão reconectou
sem precisar de novo pareamento e o mesmo destinatário continuou recebendo
`ack 0` — igual ao datacenter americano.

Conclusão: a restrição é **por destinatário**, sobre o relacionamento, não sobre
o lugar de onde se conecta. Não vale pagar hospedagem no Brasil esperando que
isso resolva a entrega.

O `fly.toml` na raiz (região `gru`) fica no repositório porque latência e
estabilidade continuam sendo bons motivos para hospedar no Brasil quando houver
várias clínicas — só não é solução para este problema.

### 3. Proporção de resposta

Muitas mensagens enviadas e poucas respondidas é sinal de disparo em massa.
Manter um caminho fácil de resposta ajuda — é um argumento a favor do
"responda 1 ou 2" e contra mandar só um link que ninguém responde.

### 4. Ritmo e volume

Já implementado em `apps/whatsapp-gateway/src/campaigns.ts`: intervalo
aleatório de 12 a 28 segundos, lotes de 20, pausa de 2 minutos entre lotes.
Para número recém-pareado, comece bem abaixo do limite e suba ao longo de dias.

### 5. Legitimidade da conta

- Usar **WhatsApp Business** no celular, não o WhatsApp comum
- Perfil completo: nome da clínica, foto, endereço, categoria, horário
- Número com uso humano real antes de automatizar

---

## Aquecimento, se o número for novo ou tiver ficado parado

Não é o caso aqui (a linha da clínica já é usada), mas vale registrar: subir o
volume aos poucos ao longo de duas a três semanas, priorizando conversas em que
a outra ponta responde, antes de ligar qualquer automação.

---

## O risco que fica

Automatizar uma conta pessoal via biblioteca não oficial contraria os termos do
WhatsApp. O banimento, quando vem, costuma ser **permanente e sem aviso**, e o
número é perdido — inclusive para uso manual da clínica. Não existe recurso
confiável.

Quem não pode correr esse risco usa a API oficial (Cloud API), que é feita para
mensagem transacional de primeiro contato e não é filtrada. O provider abstrato
em `packages/whatsapp` já existe justamente para permitir essa troca sem
reescrever o sistema.

---

## Fontes

- [Riscos do WhatsApp não oficial — SocialHub](https://www.socialhub.pro/blog/baileys-wwebjs-venom-bibliotecas-whatsapp-nao-oficial-risco/)
- [Cloud API vs bibliotecas não oficiais](https://whatsapp.checkleaked.cc/blog/whatsapp-cloud-api-vs-unofficial)
- [Baileys — guia da biblioteca](https://whatsapp.checkleaked.cc/blog/what-is-baileys)
- [Guia de aquecimento de chip](https://notificacoesinteligentes.com/blog/guia-completo-para-aquecer-seu-chip-no-whatsapp)
