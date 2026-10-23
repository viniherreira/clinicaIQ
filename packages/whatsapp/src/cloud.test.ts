import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CloudApi, CloudApiError, countTemplateVariables, describeGraphError, exchangeSignupCode, renderTemplateBody } from './cloud-api';
import { cloudContent, parseCloudWebhook, verifyMetaSignature } from './cloud-webhook';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number, code: number, message = 'x') => new Response(JSON.stringify({ error: { code, message } }), { status });

describe('CloudApi', () => {
  it('manda texto pelo número da clínica, com o token dela', async () => {
    const f = vi.fn(async () => ok({ messages: [{ id: 'wamid.1' }], contacts: [{ wa_id: '551187654321' }] }));
    const api = new CloudApi({ token: 'tk', phoneNumberId: '111', fetchImpl: f as unknown as typeof fetch });
    expect(await api.sendText('5511987654321', 'Oi')).toEqual({ id: 'wamid.1', waId: '551187654321' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/111/messages');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tk');
    expect(JSON.parse(String(init.body))).toMatchObject({ messaging_product: 'whatsapp', to: '5511987654321', type: 'text', text: { body: 'Oi' } });
  });

  it('botões: no máximo 3, títulos cortados em 20', async () => {
    const f = vi.fn(async () => ok({ messages: [{ id: 'w' }] }));
    const api = new CloudApi({ token: 't', phoneNumberId: '1', fetchImpl: f as unknown as typeof fetch });
    await api.sendButtons('55', 'Escolha', [1, 2, 3, 4].map((i) => ({ id: `o${i}`, title: `Opção número ${i} bem comprida` })));
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.interactive.action.buttons).toHaveLength(3);
    expect(body.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });

  it('modelo com variáveis', async () => {
    const f = vi.fn(async () => ok({ messages: [{ id: 'w' }] }));
    const api = new CloudApi({ token: 't', phoneNumberId: '1', fetchImpl: f as unknown as typeof fetch });
    await api.sendTemplate('55', 'lembrete', 'pt_BR', ['Ana', 'amanhã']);
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.template).toEqual({
      name: 'lembrete',
      language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: 'amanhã' }] }],
    });
  });

  it('modelo com botões: cria com resposta rápida e manda o payload de cada botão', async () => {
    const f = vi.fn(async () => ok({ id: 'T1', status: 'PENDING', messages: [{ id: 'w' }] }));
    const api = new CloudApi({ token: 't', phoneNumberId: '1', wabaId: '9', fetchImpl: f as unknown as typeof fetch });
    await api.createTemplate({ name: 'dc_lembrete_1', category: 'UTILITY', language: 'pt_BR', body: 'Oi {{1}}.', examples: ['Ana'], quickReplies: ['Confirmar', 'Reagendar'] });
    const criado = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(criado.components[1]).toEqual({
      type: 'BUTTONS',
      buttons: [
        { type: 'QUICK_REPLY', text: 'Confirmar' },
        { type: 'QUICK_REPLY', text: 'Reagendar' },
      ],
    });

    await api.sendTemplate('55', 'dc_lembrete_1', 'pt_BR', ['Ana'], ['confirm', 'reschedule']);
    const enviado = JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(enviado.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }] },
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'confirm' }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'reschedule' }] },
    ]);
  });

  it('arquivo: sobe para a Meta e manda pelo id, com legenda e nome do documento', async () => {
    const f = vi.fn(async (url: string) => (url.endsWith('/media') ? ok({ id: 'MID' }) : ok({ messages: [{ id: 'w' }] })));
    const api = new CloudApi({ token: 't', phoneNumberId: '1', fetchImpl: f as unknown as typeof fetch });
    const id = await api.uploadMedia(new TextEncoder().encode('%PDF').buffer as ArrayBuffer, 'application/pdf', 'orcamento.pdf');
    expect(id).toBe('MID');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/1/media');
    const form = init.body as FormData;
    expect(form.get('messaging_product')).toBe('whatsapp');
    expect(form.get('type')).toBe('application/pdf');
    expect((form.get('file') as File).name).toBe('orcamento.pdf');

    await api.sendMedia('55', 'document', 'MID', 'Segue o orçamento', 'orcamento.pdf');
    await api.sendMedia('55', 'audio', 'MID2', 'legenda que não vai');
    const doc = JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    const audio = JSON.parse(String((f.mock.calls[2] as unknown as [string, RequestInit])[1].body));
    expect(doc).toMatchObject({ type: 'document', document: { id: 'MID', caption: 'Segue o orçamento', filename: 'orcamento.pdf' } });
    expect(audio).toMatchObject({ type: 'audio', audio: { id: 'MID2' } });
    expect(audio.audio.caption).toBeUndefined();
  });

  it('janela de 24 h fechada vira erro próprio; limite pode tentar de novo', async () => {
    const api = (r: Response) => new CloudApi({ token: 't', phoneNumberId: '1', fetchImpl: (async () => r) as unknown as typeof fetch });
    const e1 = await api(fail(400, 131047)).sendText('55', 'oi').catch((e) => e);
    expect(e1).toBeInstanceOf(CloudApiError);
    expect(e1).toMatchObject({ windowClosed: true, retryable: false });
    const e2 = await api(fail(400, 131056)).sendText('55', 'oi').catch((e) => e);
    expect(e2).toMatchObject({ retryable: true, windowClosed: false });
  });

  it('sem rede: pode tentar de novo', async () => {
    const api = new CloudApi({ token: 't', phoneNumberId: '1', fetchImpl: (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch });
    expect(await api.sendText('55', 'oi').catch((e) => e)).toMatchObject({ retryable: true });
  });

  it('lista os modelos seguindo a paginação', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok({ data: [{ id: '1', name: 'a' }], paging: { next: 'https://graph.facebook.com/v23.0/waba/message_templates?after=X' } }))
      .mockResolvedValueOnce(ok({ data: [{ id: '2', name: 'b' }] }));
    const api = new CloudApi({ token: 't', phoneNumberId: '1', wabaId: 'waba', fetchImpl: f as unknown as typeof fetch });
    expect((await api.listTemplates()).map((t) => t.name)).toEqual(['a', 'b']);
    expect(f.mock.calls[1][0]).toBe('https://graph.facebook.com/v23.0/waba/message_templates?after=X');
  });

  it('troca o código do cadastro pelo token', async () => {
    const f = vi.fn(async () => ok({ access_token: 'TOKEN' }));
    expect(await exchangeSignupCode({ appId: 'a', appSecret: 's', code: 'c', fetchImpl: f as unknown as typeof fetch })).toBe('TOKEN');
    expect(String((f.mock.calls[0] as unknown as [URL])[0])).toContain('client_id=a');
  });
});

describe('erros da Meta', () => {
  it.each([
    [190, 'expirou'],
    [131026, 'não ter WhatsApp'],
    [132001, 'Modelo não encontrado'],
  ])('%s', (code, trecho) => {
    expect(describeGraphError(400, { error: { code } }).userMessage).toContain(trecho);
  });
  it('5xx pode tentar de novo', () => expect(describeGraphError(503, {}).retryable).toBe(true));
});

describe('variáveis de modelo', () => {
  it('conta e preenche', () => {
    expect(countTemplateVariables('Oi {{1}}, sua consulta é {{2}}. {{1}}')).toBe(2);
    expect(countTemplateVariables('Sem variáveis')).toBe(0);
    expect(renderTemplateBody('Oi {{1}}, até {{2}}', ['Ana', 'amanhã'])).toBe('Oi Ana, até amanhã');
  });
});

const envelope = (field: string, value: object) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'PN1' }, ...value } }] }],
});

describe('parseCloudWebhook', () => {
  it('situação de modelo vem pela conta (WABA), sem número', () => {
    const corpo = (event: string, reason: string) => ({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA1',
          changes: [
            {
              field: 'message_template_status_update',
              value: { event, message_template_id: 777, message_template_name: 'dc_lembrete_1', message_template_language: 'pt_BR', reason },
            },
          ],
        },
      ],
    });
    expect(parseCloudWebhook(corpo('APPROVED', 'NONE'))).toEqual([
      { kind: 'template', wabaId: 'WABA1', templateId: '777', name: 'dc_lembrete_1', event: 'APPROVED', reason: null },
    ]);
    expect(parseCloudWebhook(corpo('REJECTED', 'INVALID_FORMAT'))[0]).toMatchObject({ event: 'REJECTED', reason: 'INVALID_FORMAT' });
  });

  it('mensagem de texto com o nome do contato', () => {
    const ev = parseCloudWebhook(
      envelope('messages', {
        contacts: [{ wa_id: '551187654321', profile: { name: 'Ana' } }],
        messages: [{ from: '551187654321', id: 'wamid.A', timestamp: '1760000000', type: 'text', text: { body: 'Oi!' } }],
      }),
    );
    expect(ev).toEqual([
      {
        kind: 'message',
        phoneNumberId: 'PN1',
        from: '551187654321',
        contactName: 'Ana',
        id: 'wamid.A',
        at: new Date(1_760_000_000_000),
        content: { kind: 'TEXT', text: 'Oi!' },
      },
    ]);
  });

  it('status com erro', () => {
    const ev = parseCloudWebhook(
      envelope('messages', {
        statuses: [{ id: 'wamid.B', status: 'failed', recipient_id: '55', errors: [{ code: 131047, title: 'Re-engagement message' }] }],
      }),
    );
    expect(ev).toEqual([
      {
        kind: 'status',
        phoneNumberId: 'PN1',
        id: 'wamid.B',
        status: 'FAILED',
        recipient: '55',
        error: 'Passaram 24 horas desde a última mensagem da pessoa. Use um modelo aprovado.',
      },
    ]);
  });

  it.each([
    [{ code: 131042, title: 'Business eligibility payment issue' }, 'forma de pagamento'],
    [{ code: 131049, title: 'This message was not delivered to maintain healthy ecosystem engagement.' }, 'não cansar'],
    [{ code: 999, title: 'Algo novo', error_data: { details: 'detalhe da Meta' } }, 'A Meta recusou: detalhe da Meta'],
    [{ code: 999 }, 'erro 999'],
  ])('falha de entrega traduzida (%o)', (erro, trecho) => {
    const ev = parseCloudWebhook(envelope('messages', { statuses: [{ id: 'wamid.X', status: 'failed', recipient_id: '55', errors: [erro] }] }));
    expect(ev[0]).toMatchObject({ kind: 'status', status: 'FAILED' });
    expect((ev[0] as { error: string }).error).toContain(trecho);
  });

  it('eco da coexistência (escrito no celular da clínica)', () => {
    const ev = parseCloudWebhook(
      envelope('smb_message_echoes', {
        message_echoes: [{ from: 'BIZ', to: '551187654321', id: 'wamid.C', timestamp: '1760000000', type: 'text', text: { body: 'Até amanhã' } }],
      }),
    );
    expect(ev[0]).toMatchObject({ kind: 'echo', to: '551187654321', content: { text: 'Até amanhã' } });
  });

  it('ignora o que não é do WhatsApp e o que não é conversa', () => {
    expect(parseCloudWebhook({ object: 'page', entry: [] })).toEqual([]);
    expect(parseCloudWebhook(envelope('messages', { messages: [{ from: '1', id: 'x', type: 'reaction', reaction: { emoji: '👍' } }] }))).toEqual([]);
  });
});

describe('cloudContent', () => {
  it.each([
    [{ type: 'image', image: { id: 'M1', mime_type: 'image/jpeg', caption: 'raio-x' } }, { kind: 'IMAGE', text: 'raio-x', mediaRef: 'M1', mimeType: 'image/jpeg' }],
    [{ type: 'audio', audio: { id: 'M2', mime_type: 'audio/ogg' } }, { kind: 'AUDIO', text: null, mediaRef: 'M2', mimeType: 'audio/ogg' }],
    [{ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'opt2', title: 'Valores' } } }, { kind: 'TEXT', text: 'Valores', buttonId: 'opt2' }],
    [{ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'opt5', title: 'Endereço' } } }, { kind: 'TEXT', text: 'Endereço', buttonId: 'opt5' }],
    [{ type: 'button', button: { text: 'Confirmar', payload: 'confirm' } }, { kind: 'TEXT', text: 'Confirmar', buttonId: 'confirm' }],
    [{ type: 'unsupported' }, { kind: 'OTHER', text: null }],
  ])('%#', (m, esperado) => {
    expect(cloudContent(m)).toEqual(esperado);
  });
});

describe('verifyMetaSignature', () => {
  const body = '{"a":1}';
  const sig = 'sha256=' + createHmac('sha256', 'segredo').update(body).digest('hex');
  it('aceita a assinatura certa e recusa o resto', () => {
    expect(verifyMetaSignature(body, sig, 'segredo')).toBe(true);
    expect(verifyMetaSignature(body + ' ', sig, 'segredo')).toBe(false);
    expect(verifyMetaSignature(body, sig, 'outro')).toBe(false);
    expect(verifyMetaSignature(body, null, 'segredo')).toBe(false);
    expect(verifyMetaSignature(body, sig, undefined)).toBe(false);
  });
  it('ignora espaço e quebra de linha na chave colada', () => {
    expect(verifyMetaSignature(body, sig, ' segredo\n')).toBe(true);
    expect(verifyMetaSignature(body, sig, '  ')).toBe(false);
  });
});
