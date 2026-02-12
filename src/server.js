import { AutoRouter } from 'itty-router';
import { verifyDiscordRequest } from './middleware/verify.js';
import { authenticateMinecraft } from './middleware/auth.js';
import { handleDiscordInteraction } from './handlers/discord.js';
import {
  postChat,
  getMessages,
  ackMessages,
  getPlayers,
  getPlayer,
  bindPlayer,
  getInventory,
  putInventory,
  patchInventoryItem,
  getSettings,
  getSetting,
  putSetting,
  postServerStatus,
} from './handlers/minecraft.js';

const router = AutoRouter();

// ===================================================
// Discord 互動端點（Ed25519 簽名驗證）
// ===================================================

router.post('/', async (request, env) => {
  const { isValid, interaction } = await verifyDiscordRequest(request, env);

  if (!isValid || !interaction) {
    return new Response('Bad request signature', { status: 401 });
  }

  return handleDiscordInteraction(interaction, env);
});

// ===================================================
// Minecraft REST API（API Key 認證）
// ===================================================

// API Key 驗證中介層：攔截所有 /api/mc/* 路由
router.all('/api/mc/*', (request, env) => {
  return authenticateMinecraft(request, env);
});

// --- 聊天訊息 ---
router.post('/api/mc/chat', postChat);
router.get('/api/mc/messages', getMessages);
router.post('/api/mc/messages/ack', ackMessages);

// --- 玩家綁定 ---
router.get('/api/mc/players', getPlayers);
router.post('/api/mc/players/bind', bindPlayer);
router.get('/api/mc/players/:mc_uuid', getPlayer);

// --- 玩家背包 ---
router.get('/api/mc/inventory/:mc_uuid', getInventory);
router.put('/api/mc/inventory/:mc_uuid', putInventory);
router.patch('/api/mc/inventory/:mc_uuid/:item_id', patchInventoryItem);

// --- 伺服器設定 ---
router.get('/api/mc/settings', getSettings);
router.get('/api/mc/settings/:key', getSetting);
router.put('/api/mc/settings/:key', putSetting);
router.post('/api/mc/server/status', postServerStatus);

// ===================================================
// 健康檢查
// ===================================================

router.get('/health', () => {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===================================================
// 404 — 其餘所有路由
// ===================================================

router.all('*', () => {
  return new Response('Not Found', { status: 404 });
});

// Worker 入口
export default { ...router };
