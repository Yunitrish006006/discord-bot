/**
 * Discord Slash Commands 註冊腳本
 * 純 Node.js 執行，不在 Worker 中運行
 *
 * 使用方式：
 *   npm run register
 *
 * 開發環境使用 Guild Commands（即時生效）
 * 正式環境移除 DISCORD_GUILD_ID 即可改用 Global Commands
 */

import dotenv from 'dotenv';
import { COMMANDS } from './src/commands.js';

dotenv.config({ path: '.dev.vars' });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // 可選，開發用

if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID) {
  console.error('❌ 缺少 DISCORD_TOKEN 或 DISCORD_APPLICATION_ID');
  console.error('   請確認 .dev.vars 檔案已正確設定');
  process.exit(1);
}

// 決定使用 Guild Commands 還是 Global Commands
const url = DISCORD_GUILD_ID
  ? `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

const scope = DISCORD_GUILD_ID ? `Guild (${DISCORD_GUILD_ID})` : 'Global';

console.log(`\n📡 正在註冊 ${scope} Slash Commands...\n`);
console.log('指令列表：');
COMMANDS.forEach((cmd) => {
  console.log(`  /${cmd.name} — ${cmd.description}`);
});
console.log('');

try {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${DISCORD_TOKEN}`,
    },
    body: JSON.stringify(COMMANDS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ 註冊失敗 (HTTP ${response.status}):`);
    console.error(errorText);
    process.exit(1);
  }

  const data = await response.json();
  console.log(`✅ 成功註冊 ${data.length} 個指令！`);

  if (!DISCORD_GUILD_ID) {
    console.log('⚠️  Global Commands 可能需要最多 1 小時才能在所有伺服器生效');
    console.log('   開發階段建議在 .dev.vars 中加入 DISCORD_GUILD_ID 使用 Guild Commands');
  }
} catch (err) {
  console.error('❌ 註冊過程發生錯誤：', err.message);
  process.exit(1);
}
