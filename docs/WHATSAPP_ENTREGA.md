# Entrega no WhatsApp pelo QR code

Como aumentar a chance de a mensagem chegar quando a clínica usa a própria linha
pareada por QR (Baileys), sem API oficial.

**O que este documento não promete.** O canal não oficial não tem garantia de
entrega. A Meta não publica as regras, elas mudam sem aviso, e o mesmo número
pode entregar hoje e parar amanhã. O que está aqui são os fatores que o
comportamento observado e a documentação pública indicam que pesam — cada um
melhora a probabilidade, nenhum a assegura.

Medição real desta instalação em 03/08/2026, antes das mudanças abaixo:
**8 entregas em 68 envios (12%)**, todas para contatos pessoais do dono da
clínica. Dos 17 pacientes reais, **nenhum recebeu**.

---

## Os fatores, em ordem de impacto

### 1. De onde o dispositivo conecta

O sistema anti-abuso pontua o IP de onde a sessão do WhatsApp Web se conecta.
Dois sinais ruins somam aqui: **país diferente do celular** e **faixa de IP de
datacenter**. Uma clínica em São Paulo cuja sessão aparece na Califórnia é o
caso didático — e o próprio WhatsApp avisa disso na tela de pareamento
("risco de golpe… San Jose").

O país dá para consertar. Datacenter não, a menos que se use IP residencial.

- ✅ Hospedar em região brasileira. `fly.toml` na raiz já aponta para `gru`
  (São Paulo).
- ❌ Railway não tem região no Brasil — foi onde este gateway rodou até agora.
- Alternativas com São Paulo: Fly.io `gru`, AWS `sa-east-1`, Oracle Cloud
  São Paulo, VPS nacional (Magalu, Locaweb, Hostinger).

**Depois de migrar, é preciso parear de novo pelo QR.** A sessão antiga fica
presa ao IP anterior.

### 2. Distância no grafo de contatos

O maior peso isolado, e o que explica o padrão observado aqui: mensagem
automática para quem **nunca falou com o número** é tratada como abordagem a
estranho. Foi exatamente o que os dados mostraram — só entregou para contatos
com conversa prévia.

Contorno: fazer o paciente iniciar. Depois da primeira mensagem dele, a janela
abre e a entrega passa a funcionar.

- Link `wa.me` no site, no rodapé do e-mail e na confirmação de agendamento
- QR code impresso na recepção: "aponte para receber lembretes"
- Pedir na ficha de cadastro que o paciente salve o número da clínica

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
