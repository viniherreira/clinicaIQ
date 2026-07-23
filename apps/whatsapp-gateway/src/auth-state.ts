import { prisma, encrypt, decrypt } from './db.js';
import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import { env } from './env.js';

type SignalKeyType = keyof SignalDataTypeMap;

/** Baileys key ids can contain characters we'd rather not treat as separators. */
const rowKey = (type: string, id: string) => `${type}::${id}`;

async function readValue(tenantId: string, key: string): Promise<unknown> {
  const row = await prisma.whatsAppAuthKey.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { value: true },
  });
  if (!row) return null;
  try {
    const json = decrypt(row.value, env.ENCRYPTION_MASTER_KEY, tenantId);
    return JSON.parse(json, BufferJSON.reviver);
  } catch {
    // A credential we cannot decrypt is unusable — treat it as absent so the
    // clinic is asked to pair again rather than getting a broken socket.
    return null;
  }
}

async function writeValue(tenantId: string, key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value, BufferJSON.replacer);
  const ciphertext = encrypt(json, env.ENCRYPTION_MASTER_KEY, tenantId);
  await prisma.whatsAppAuthKey.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value: ciphertext },
    update: { value: ciphertext },
  });
}

async function removeValue(tenantId: string, key: string): Promise<void> {
  await prisma.whatsAppAuthKey
    .delete({ where: { tenantId_key: { tenantId, key } } })
    .catch(() => undefined);
}

/**
 * Baileys auth store backed by Postgres instead of the filesystem, so the
 * gateway can be redeployed or scaled without every clinic having to pair again.
 * Values are encrypted per tenant with the same master key the app uses for PII.
 */
export async function usePostgresAuthState(tenantId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}> {
  const stored = (await readValue(tenantId, 'creds')) as AuthenticationCreds | null;
  const creds: AuthenticationCreds = stored ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends SignalKeyType>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readValue(tenantId, rowKey(type, id));
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
              }
              if (value) data[id] = value as SignalDataTypeMap[T];
            }),
          );
          return data;
        },
        set: async (data) => {
          const jobs: Promise<void>[] = [];
          for (const type of Object.keys(data) as SignalKeyType[]) {
            const entries = data[type];
            if (!entries) continue;
            for (const [id, value] of Object.entries(entries)) {
              const key = rowKey(type, id);
              jobs.push(value ? writeValue(tenantId, key, value) : removeValue(tenantId, key));
            }
          }
          await Promise.all(jobs);
        },
      },
    },
    saveCreds: () => writeValue(tenantId, 'creds', creds),
    clear: async () => {
      await prisma.whatsAppAuthKey.deleteMany({ where: { tenantId } });
    },
  };
}
