/**
 * Cliente da API oficial do WhatsApp (Cloud API da Meta) para UMA clínica.
 *
 * Diferente do `MetaWhatsAppProvider` (um número fixo nas variáveis de
 * ambiente, usado nos lembretes), aqui cada clínica tem o seu número e o seu
 * token, vindos do cadastro incorporado. Sem estado: crie um por chamada.
 */

export const DEFAULT_GRAPH_VERSION = 'v23.0';

export interface CloudConfig {
  token: string;
  phoneNumberId: string;
  wabaId?: string;
  version?: string;
  /** Para os testes. */
  fetchImpl?: typeof fetch;
}

export interface CloudButton {
  id: string;
  title: string;
}

/** Erro da Graph API traduzido para o que a clínica e o código precisam saber. */
export class CloudApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    /** Texto para a clínica, em português. */
    readonly userMessage: string,
    /** Tentar de novo depois pode dar certo (limite, instabilidade). */
    readonly retryable: boolean,
    /** Fora da janela de 24 horas: só modelo aprovado. */
    readonly windowClosed: boolean,
    raw: string,
  ) {
    super(raw);
    this.name = 'CloudApiError';
  }
}

const RATE_LIMIT = new Set([4, 80007, 130429, 131048, 131056]);

/** Códigos da Meta → mensagem e se vale tentar de novo. */
export function describeGraphError(status: number, body: unknown): CloudApiError {
  const err = (body as { error?: { code?: number; message?: string; error_data?: { details?: string } } })?.error;
  const code = err?.code;
  const raw = err?.message ?? `HTTP ${status}`;
  const make = (msg: string, retryable = false, windowClosed = false) =>
    new CloudApiError(status, code, msg, retryable, windowClosed, raw);

  if (code === 131047 || code === 470) {
    return make('Passaram 24 horas desde a última mensagem da pessoa. Use um modelo aprovado.', false, true);
  }
  if (code === 190) return make('A conexão com a Meta expirou. Conecte o WhatsApp oficial de novo.');
  if (code === 131026) return make('Não foi possível entregar: o número pode não ter WhatsApp.');
  if (code === 131051) return make('Tipo de mensagem não aceito pelo WhatsApp.');
  if (code === 132000) return make('O número de variáveis não bate com o modelo.');
  if (code === 132001) return make('Modelo não encontrado ou ainda não aprovado na Meta.');
  if (code === 132015 || code === 132016) return make('Este modelo foi pausado ou desativado pela Meta.');
  if (code === 133010) return make('O número da clínica ainda não está registrado na API oficial.');
  if (code === 131031) return make('A conta do WhatsApp da clínica está bloqueada na Meta.');
  if (code !== undefined && RATE_LIMIT.has(code)) return make('Muitas mensagens em pouco tempo. Vamos tentar de novo.', true);
  if (status >= 500) return make('A Meta está instável agora. Vamos tentar de novo.', true);
  return make(`A Meta recusou: ${raw}`);
}

export class CloudApi {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly cfg: CloudConfig) {
    this.base = `https://graph.facebook.com/${cfg.version ?? DEFAULT_GRAPH_VERSION}`;
    this.f = cfg.fetchImpl ?? fetch;
  }

  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    let res: Response;
    try {
      res = await this.f(`${this.base}/${path}`, {
        method: init?.method ?? (init?.body ? 'POST' : 'GET'),
        headers: {
          authorization: `Bearer ${this.cfg.token}`,
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new CloudApiError(0, undefined, 'Sem resposta da Meta. Vamos tentar de novo.', true, false, String(e));
    }
    const data = (await res.json().catch(() => ({}))) as T;
    if (!res.ok) throw describeGraphError(res.status, data);
    return data;
  }

  private async send(to: string, payload: Record<string, unknown>): Promise<{ id: string; waId?: string }> {
    const r = await this.call<{ messages?: { id: string }[]; contacts?: { wa_id: string }[] }>(
      `${this.cfg.phoneNumberId}/messages`,
      { body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload } },
    );
    const id = r.messages?.[0]?.id;
    if (!id) throw new CloudApiError(200, undefined, 'A Meta não devolveu o id da mensagem.', true, false, JSON.stringify(r));
    return { id, waId: r.contacts?.[0]?.wa_id };
  }

  sendText(to: string, body: string) {
    return this.send(to, { type: 'text', text: { body, preview_url: /https?:\/\//.test(body) } });
  }

  /** Até 3 botões de resposta (título até 20 caracteres). */
  sendButtons(to: string, body: string, buttons: CloudButton[]) {
    return this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }

  /** Lista de até 10 opções (título até 24 caracteres). */
  sendList(to: string, body: string, buttonLabel: string, rows: CloudButton[]) {
    return this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: [{ title: 'Opções', rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24) })) }],
        },
      },
    });
  }

  sendTemplate(to: string, name: string, language: string, bodyParams: string[]) {
    return this.send(to, {
      type: 'template',
      template: {
        name,
        language: { code: language },
        ...(bodyParams.length
          ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }] }
          : {}),
      },
    });
  }

  async markRead(messageId: string): Promise<void> {
    await this.call(`${this.cfg.phoneNumberId}/messages`, {
      body: { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
    });
  }

  getMediaInfo(mediaId: string) {
    return this.call<{ url: string; mime_type: string; file_size?: number }>(mediaId);
  }

  /** O arquivo em si: a URL da Meta exige o mesmo token. */
  async downloadMedia(url: string): Promise<Response> {
    const res = await this.f(url, { headers: { authorization: `Bearer ${this.cfg.token}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw describeGraphError(res.status, await res.json().catch(() => ({})));
    return res;
  }

  getPhoneNumber() {
    return this.call<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      `${this.cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    );
  }

  /** Todos os modelos da conta (segue a paginação). */
  async listTemplates(): Promise<GraphTemplate[]> {
    if (!this.cfg.wabaId) throw new Error('wabaId necessário para listar modelos');
    const out: GraphTemplate[] = [];
    let path: string | null = `${this.cfg.wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components,rejected_reason`;
    for (let i = 0; path && i < 20; i++) {
      const page: { data?: GraphTemplate[]; paging?: { next?: string } } = await this.call(path);
      out.push(...(page.data ?? []));
      const next: string | undefined = page.paging?.next;
      path = next ? next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '') : null;
    }
    return out;
  }

  createTemplate(t: { name: string; category: string; language: string; body: string; examples: string[] }) {
    if (!this.cfg.wabaId) throw new Error('wabaId necessário para criar modelo');
    return this.call<{ id: string; status: string; category?: string }>(`${this.cfg.wabaId}/message_templates`, {
      body: {
        name: t.name,
        category: t.category,
        language: t.language,
        components: [
          {
            type: 'BODY',
            text: t.body,
            ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}),
          },
        ],
      },
    });
  }

  /** Inscreve o app do ClinicaIQ nos webhooks da conta da clínica. */
  async subscribeApp(): Promise<void> {
    if (!this.cfg.wabaId) throw new Error('wabaId necessário');
    await this.call(`${this.cfg.wabaId}/subscribed_apps`, { method: 'POST', body: {} });
  }

  /** Registra o número na Cloud API (não se usa na coexistência). */
  async registerPhone(pin: string): Promise<void> {
    await this.call(`${this.cfg.phoneNumberId}/register`, { body: { messaging_product: 'whatsapp', pin } });
  }
}

export interface GraphTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejected_reason?: string;
  components?: { type: string; text?: string; format?: string }[];
}

/** Troca o código do cadastro incorporado pelo token da clínica. */
export async function exchangeSignupCode(opts: {
  appId: string;
  appSecret: string;
  code: string;
  version?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const url = new URL(`https://graph.facebook.com/${opts.version ?? DEFAULT_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', opts.appId);
  url.searchParams.set('client_secret', opts.appSecret);
  url.searchParams.set('code', opts.code);
  const res = await f(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !data.access_token) throw describeGraphError(res.status, data);
  return data.access_token;
}

/** Quantas variáveis {{n}} o corpo usa (a maior). */
export function countTemplateVariables(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** O texto que a pessoa recebe: o corpo com as variáveis preenchidas. */
export function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
}
