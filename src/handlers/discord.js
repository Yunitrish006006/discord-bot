import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
} from 'discord-interactions';
import { CommandNames } from '../commands.js';

/**
 * 處理 Discord 互動（Slash Commands + Message Components）
 */
export async function handleDiscordInteraction(interaction, env) {
  const { type, data } = interaction;

  // --- PING 握手 ---
  if (type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG });
  }

  // --- Slash Commands ---
  if (type === InteractionType.APPLICATION_COMMAND) {
    return handleSlashCommand(interaction, env);
  }

  // --- Message Components（按鈕、選單） ---
  if (type === InteractionType.MESSAGE_COMPONENT) {
    return handleMessageComponent(interaction, env);
  }

  return Response.json(
    { error: 'Unknown interaction type' },
    { status: 400 }
  );
}

// ===================================================
// Slash Command 處理
// ===================================================

async function handleSlashCommand(interaction, env) {
  const { data, member } = interaction;
  const commandName = data.name;

  switch (commandName) {
      case CommandNames.TEST:
          return handleTestCommand(interaction, env);
    case CommandNames.MC:
      return handleMcCommand(interaction, env);
    case CommandNames.STATUS:
      return handleStatusCommand(interaction, env);
    case CommandNames.PLAYERS:
      return handlePlayersCommand(interaction, env);
    case CommandNames.BIND:
      return handleBindCommand(interaction, env);
      case CommandNames.SETCHANNEL:
          return handleSetChannelCommand(interaction, env);
      case CommandNames.REMOVECHANNEL:
          return handleRemoveChannelCommand(interaction, env);
    default:
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '❌ 未知的指令', flags: InteractionResponseFlags.EPHEMERAL },
      });
  }
}

// /test — 測試機器人狀態
async function handleTestCommand(interaction, env) {
    const now = new Date();

    // 測試 D1 連線
    let dbStatus = '🔴 失敗';
    let dbLatency = 'N/A';
    try {
        const dbStart = Date.now();
        await env.DB.prepare('SELECT 1').first();
        dbLatency = `${Date.now() - dbStart}ms`;
        dbStatus = '🟢 正常';
    } catch (err) {
        console.error('DB test failed:', err);
    }

    return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            embeds: [
                {
                    title: '🤖 Bot 狀態測試',
                    color: 0x00ff00,
                    fields: [
                        { name: '狀態', value: '🟢 線上', inline: true },
                        { name: '延遲', value: `${Date.now() - now.getTime()}ms`, inline: true },
                        { name: 'D1 資料庫', value: `${dbStatus} (${dbLatency})`, inline: true },
                        { name: '運行環境', value: 'Cloudflare Workers', inline: true },
                        { name: '時間', value: now.toISOString(), inline: false },
                    ],
                },
            ],
            flags: InteractionResponseFlags.EPHEMERAL,
        },
    });
}

// /mc <message> — 傳送訊息到 Minecraft
async function handleMcCommand(interaction, env) {
  const message = getOptionValue(interaction.data.options, 'message');
  const username =
    interaction.member?.user?.global_name ||
    interaction.member?.user?.username ||
    interaction.user?.username ||
    'Unknown';

  try {
    await env.DB.prepare(
      'INSERT INTO messages (source, username, content) VALUES (?, ?, ?)'
    )
      .bind('discord', username, message)
      .run();

    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `📨 **${username}**: ${message}\n*（已傳送至 Minecraft）*`,
      },
    });
  } catch (err) {
    console.error('Failed to save message:', err);
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ 傳送失敗，請稍後再試',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }
}

// /status — 查詢 MC 伺服器狀態
async function handleStatusCommand(interaction, env) {
  try {
    const settings = await env.DB.prepare(
      "SELECT key, value FROM server_settings WHERE key IN ('server_status', 'server_tps', 'server_players_online', 'server_players_max', 'server_version')"
    ).all();

    const config = {};
    for (const row of settings.results) {
      config[row.key] = row.value;
    }

    const status = config.server_status || '未知';
    const tps = config.server_tps || 'N/A';
    const online = config.server_players_online || '0';
    const max = config.server_players_max || '0';
    const version = config.server_version || '未知';

    const isOnline = status === 'online';

    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [
          {
            title: '🖥️ Minecraft 伺服器狀態',
            color: isOnline ? 0x00ff00 : 0xff0000,
            fields: [
              { name: '狀態', value: isOnline ? '🟢 線上' : '🔴 離線', inline: true },
              { name: '版本', value: version, inline: true },
              { name: '玩家', value: `${online} / ${max}`, inline: true },
              { name: 'TPS', value: tps, inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
        components: [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 2, // Secondary
                label: '🔄 重新整理',
                custom_id: 'status_refresh',
              },
            ],
          },
        ],
      },
    });
  } catch (err) {
    console.error('Failed to fetch status:', err);
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ 無法取得伺服器狀態',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }
}

// /players — 查詢線上玩家列表（含分頁按鈕）
async function handlePlayersCommand(interaction, env) {
  return buildPlayersResponse(env, 0);
}

// /bind <mc_username> — 綁定帳號
async function handleBindCommand(interaction, env) {
  const mcUsername = getOptionValue(interaction.data.options, 'mc_username');
  const discordId = interaction.member?.user?.id || interaction.user?.id;
  const discordName =
    interaction.member?.user?.global_name ||
    interaction.member?.user?.username ||
    interaction.user?.username;

  try {
    // 檢查是否已綁定
    const existing = await env.DB.prepare(
      'SELECT * FROM player_bindings WHERE discord_id = ?'
    )
      .bind(discordId)
      .first();

    if (existing && existing.mc_uuid) {
      return Response.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `⚠️ 你已經綁定了 Minecraft 帳號 **${existing.mc_name}**\n若要重新綁定，請先解除綁定。`,
          flags: InteractionResponseFlags.EPHEMERAL,
        },
      });
    }

    // 產生 6 位數驗證碼
    const bindCode = generateBindCode();

    // Upsert bind record
    await env.DB.prepare(
      `INSERT INTO player_bindings (discord_id, discord_name, mc_name, bind_code, bind_code_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (discord_id) DO UPDATE SET
         discord_name = excluded.discord_name,
         mc_name = excluded.mc_name,
         bind_code = excluded.bind_code,
         bind_code_at = excluded.bind_code_at`
    )
      .bind(discordId, discordName, mcUsername, bindCode)
      .run();

    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `🔗 綁定流程已啟動！\n\n請在 Minecraft 中執行以下指令完成驗證：\n\`\`\`\n/verify ${bindCode}\n\`\`\`\n⏰ 驗證碼將在 10 分鐘後失效。`,
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  } catch (err) {
    console.error('Failed to create bind:', err);
    return Response.json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ 綁定失敗，請稍後再試',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }
}

// ===================================================
// Message Component 處理（按鈕、選單）
// ===================================================

async function handleMessageComponent(interaction, env) {
  const customId = interaction.data.custom_id;

  // 分頁按鈕：players_page_{offset}
  if (customId.startsWith('players_page_')) {
    const offset = parseInt(customId.replace('players_page_', ''), 10) || 0;
    return buildPlayersResponse(env, offset, true);
  }

  // 重新整理狀態按鈕
  if (customId === 'status_refresh') {
    // 重新取得狀態，用 UPDATE_MESSAGE 更新原始訊息
    const statusResponse = await handleStatusCommand(interaction, env);
    const body = await statusResponse.json();

    return Response.json({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: body.data,
    });
  }

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '❌ 未知的互動',
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  });
}

// ===================================================
// 工具函數
// ===================================================

function getOptionValue(options, name) {
  if (!options) return null;
  const option = options.find((o) => o.name === name);
  return option ? option.value : null;
}

function generateBindCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PAGE_SIZE = 10;

async function buildPlayersResponse(env, offset, isUpdate = false) {
  try {
    const total = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM player_bindings WHERE mc_uuid IS NOT NULL'
    ).first();

    const players = await env.DB.prepare(
      'SELECT discord_name, mc_name, bound_at FROM player_bindings WHERE mc_uuid IS NOT NULL ORDER BY bound_at DESC LIMIT ? OFFSET ?'
    )
      .bind(PAGE_SIZE, offset)
      .all();

    const totalCount = total?.count || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

    let description = '';
    if (players.results.length === 0) {
      description = '目前沒有已綁定的玩家';
    } else {
      description = players.results
        .map(
          (p, i) =>
            `**${offset + i + 1}.** ${p.mc_name} ↔ ${p.discord_name}`
        )
        .join('\n');
    }

    const components = [];
    const buttons = [];

    if (offset > 0) {
      buttons.push({
        type: 2,
        style: 1,
        label: '◀ 上一頁',
        custom_id: `players_page_${Math.max(0, offset - PAGE_SIZE)}`,
      });
    }

    if (offset + PAGE_SIZE < totalCount) {
      buttons.push({
        type: 2,
        style: 1,
        label: '下一頁 ▶',
        custom_id: `players_page_${offset + PAGE_SIZE}`,
      });
    }

    if (buttons.length > 0) {
      components.push({ type: 1, components: buttons });
    }

    const responseType = isUpdate
      ? InteractionResponseType.UPDATE_MESSAGE
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;

    return Response.json({
      type: responseType,
      data: {
        embeds: [
          {
            title: '👥 已綁定玩家列表',
            description,
            color: 0x5865f2,
            footer: { text: `第 ${currentPage} / ${totalPages} 頁 · 共 ${totalCount} 位玩家` },
          },
        ],
        components,
      },
    });
  } catch (err) {
    console.error('Failed to fetch players:', err);
    const responseType = isUpdate
      ? InteractionResponseType.UPDATE_MESSAGE
      : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;

    return Response.json({
      type: responseType,
      data: {
        content: '❌ 無法取得玩家列表',
        flags: InteractionResponseFlags.EPHEMERAL,
      },
    });
  }
}

// ===================================================
// 頻道同步管理
// ===================================================

// /setchannel — 將目前頻道設為 MC 聊天同步頻道
async function handleSetChannelCommand(interaction, env) {
    const channelId = interaction.channel_id || interaction.channel?.id;
    const guildId = interaction.guild_id;
    const guildName = interaction.guild?.name || guildId;
    const userId = interaction.member?.user?.id || interaction.user?.id;

    if (!channelId || !guildId) {
        return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ 此指令只能在伺服器頻道中使用',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }

    try {
        // 查詢頻道名稱（透過 Discord API）
        let channelName = channelId;
        try {
            const chRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
                headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
            });
            if (chRes.ok) {
                const chData = await chRes.json();
                channelName = chData.name || channelId;
            }
        } catch (_) { }

        await env.DB.prepare(
            `INSERT INTO sync_channels (guild_id, guild_name, channel_id, channel_name, added_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (channel_id) DO UPDATE SET
         guild_name = excluded.guild_name,
         channel_name = excluded.channel_name,
         added_by = excluded.added_by,
         added_at = datetime('now')`
        )
            .bind(guildId, guildName, channelId, channelName, userId)
            .run();

        // 查詢目前所有同步頻道
        const allChannels = await env.DB.prepare(
            'SELECT guild_name, channel_name, channel_id FROM sync_channels ORDER BY added_at ASC'
        ).all();

        const channelList = allChannels.results
            .map((c) => `• **${c.guild_name}** #${c.channel_name}`)
            .join('\n');

        return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [
                    {
                        title: '✅ 同步頻道已設定',
                        description: `已將 <#${channelId}> 加入 Minecraft 聊天同步。\n\n**目前同步頻道：**\n${channelList}`,
                        color: 0x00ff00,
                    },
                ],
            },
        });
    } catch (err) {
        console.error('Failed to set channel:', err);
        return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ 設定失敗，請稍後再試',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }
}

// /removechannel — 移除目前頻道的 MC 聊天同步
async function handleRemoveChannelCommand(interaction, env) {
    const channelId = interaction.channel_id || interaction.channel?.id;

    if (!channelId) {
        return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ 此指令只能在伺服器頻道中使用',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }

    try {
        const existing = await env.DB.prepare(
            'SELECT * FROM sync_channels WHERE channel_id = ?'
        )
            .bind(channelId)
            .first();

        if (!existing) {
            return Response.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '⚠️ 此頻道尚未設定為同步頻道',
                    flags: InteractionResponseFlags.EPHEMERAL,
                },
            });
        }

        await env.DB.prepare('DELETE FROM sync_channels WHERE channel_id = ?')
            .bind(channelId)
            .run();

        // 查詢剩餘同步頻道
        const remaining = await env.DB.prepare(
            'SELECT guild_name, channel_name FROM sync_channels ORDER BY added_at ASC'
        ).all();

        const channelList =
            remaining.results.length > 0
                ? remaining.results.map((c) => `• **${c.guild_name}** #${c.channel_name}`).join('\n')
                : '*(無)*';

        return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [
                    {
                        title: '🗑️ 同步頻道已移除',
                        description: `已將 <#${channelId}> 從 Minecraft 聊天同步中移除。\n\n**剩餘同步頻道：**\n${channelList}`,
                        color: 0xffa500,
                    },
                ],
            },
        });
    } catch (err) {
        console.error('Failed to remove channel:', err);
        return Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ 移除失敗，請稍後再試',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }
}
