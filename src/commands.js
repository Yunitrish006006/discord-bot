/**
 * Discord Slash Commands 定義
 * 同時用於指令註冊 (register.js) 和運行時互動處理
 */

// Discord command option types
const CommandOptionType = {
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
};

// 指令名稱常數（避免 typo）
export const CommandNames = {
    TEST: 'test',
  MC: 'mc',
  STATUS: 'status',
  PLAYERS: 'players',
  BIND: 'bind',
};

// 指令定義（供 register.js 使用）
export const COMMANDS = [
  {
        name: CommandNames.TEST,
        description: '測試機器人是否正常運作',
    },
    {
    name: CommandNames.MC,
    description: '傳送訊息到 Minecraft 伺服器',
    options: [
      {
        name: 'message',
        description: '要傳送的訊息內容',
        type: CommandOptionType.STRING,
        required: true,
      },
    ],
  },
  {
    name: CommandNames.STATUS,
    description: '查詢 Minecraft 伺服器狀態',
  },
  {
    name: CommandNames.PLAYERS,
    description: '查詢線上玩家列表',
  },
  {
    name: CommandNames.BIND,
    description: '綁定 Discord 帳號與 Minecraft 帳號',
    options: [
      {
        name: 'mc_username',
        description: 'Minecraft 使用者名稱',
        type: CommandOptionType.STRING,
        required: true,
      },
    ],
  },
];
