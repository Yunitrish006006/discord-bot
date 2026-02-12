import { verifyKey } from 'discord-interactions';

/**
 * Discord Ed25519 簽名驗證中介層
 * 驗證來自 Discord 的請求是否合法
 */
export async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();

  const isValid =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));

  if (!isValid) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}
