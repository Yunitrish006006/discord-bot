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
    ROLE: 8,
};

// 指令名稱常數（避免 typo）
export const CommandNames = {
    TEST: 'test',
  MC: 'mc',
  STATUS: 'status',
  PLAYERS: 'players',
  BIND: 'bind',
    SETCHANNEL: 'setchannel',
    REMOVECHANNEL: 'removechannel',
    TAG: 'tag',
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
    {
        name: CommandNames.TAG,
        description: '建立身分組選擇按鈕，使用者點擊即可獲得/移除身分組',
        default_member_permissions: '268435456', // MANAGE_ROLES
        options: [
            {
                name: 'role1',
                description: '身分組 1',
                type: CommandOptionType.ROLE,
                required: true,
            },
            {
                name: 'role2',
                description: '身分組 2',
                type: CommandOptionType.ROLE,
                required: false,
            },
            {
                name: 'role3',
                description: '身分組 3',
                type: CommandOptionType.ROLE,
                required: false,
            },
            {
                name: 'role4',
                description: '身分組 4',
                type: CommandOptionType.ROLE,
                required: false,
            },
            {
                name: 'role5',
                description: '身分組 5',
                type: CommandOptionType.ROLE,
                required: false,
            },
            {
                name: 'title',
                description: '自訂標題（預設：選擇你的身分組）',
                type: CommandOptionType.STRING,
                required: false,
            },
        ],
    },
    {
        name: CommandNames.SETCHANNEL,
        description: '將目前頻道設為 Minecraft 聊天同步頻道',
        default_member_permissions: '32', // MANAGE_SERVER
    },
    {
        name: CommandNames.REMOVECHANNEL,
        description: '移除目前頻道的 Minecraft 聊天同步',
        default_member_permissions: '32', // MANAGE_SERVER
    },
];
