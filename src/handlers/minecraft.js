/**
 * Minecraft REST API 端點處理
 * 所有端點都需要通過 API Key 認證（在 server.js 中介層處理）
 *
 * 回應格式統一：
 *   成功：{ success: true, data: ... }
 *   失敗：{ success: false, error: "..." }
 */

// ===================================================
// 聊天訊息
// ===================================================

/**
 * POST /api/mc/chat
 * MC → Discord：發送聊天訊息
 * Body: { username: string, message: string }
 */
export async function postChat(request, env) {
  try {
    const { username, message } = await request.json();

    if (!username || !message) {
      return Response.json(
        { success: false, error: 'Missing username or message' },
        { status: 400 }
      );
    }

    // 存入 D1（source=minecraft，直接標記 delivered，因為會即時轉發）
    await env.DB.prepare(
      'INSERT INTO messages (source, username, content, delivered) VALUES (?, ?, ?, 1)'
    )
      .bind('minecraft', username, message)
      .run();

    // 轉發到 Discord 頻道
    const discordResponse = await fetch(
      `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
        },
        body: JSON.stringify({
          content: `**[MC] ${username}:** ${message}`,
        }),
      }
    );

    if (!discordResponse.ok) {
      const err = await discordResponse.text();
      console.error('Discord API error:', err);
      return Response.json(
        { success: false, error: 'Failed to send to Discord' },
        { status: 502 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('postChat error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mc/messages?since=<timestamp>&limit=50
 * Discord → MC：MC mod 主動拉取待送達的 Discord 訊息
 */
export async function getMessages(request, env) {
  try {
    const url = new URL(request.url);
    const since = url.searchParams.get('since') || '1970-01-01T00:00:00';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

    const messages = await env.DB.prepare(
      `SELECT id, username, content, created_at
       FROM messages
       WHERE source = 'discord' AND delivered = 0 AND created_at > ?
       ORDER BY created_at ASC
       LIMIT ?`
    )
      .bind(since, limit)
      .all();

    return Response.json({
      success: true,
      data: messages.results,
    });
  } catch (err) {
    console.error('getMessages error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mc/messages/ack
 * MC mod 確認已收到的訊息 ID 列表
 * Body: { ids: number[] }
 */
export async function ackMessages(request, env) {
  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json(
        { success: false, error: 'Missing or empty ids array' },
        { status: 400 }
      );
    }

    // 批量標記已送達
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE messages SET delivered = 1 WHERE id IN (${placeholders})`
    )
      .bind(...ids)
      .run();

    return Response.json({ success: true, data: { acknowledged: ids.length } });
  } catch (err) {
    console.error('ackMessages error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===================================================
// 玩家綁定
// ===================================================

/**
 * GET /api/mc/players
 * 取得所有已綁定的玩家
 */
export async function getPlayers(request, env) {
  try {
    const players = await env.DB.prepare(
      'SELECT discord_id, discord_name, mc_uuid, mc_name, bound_at FROM player_bindings WHERE mc_uuid IS NOT NULL ORDER BY bound_at DESC'
    ).all();

    return Response.json({ success: true, data: players.results });
  } catch (err) {
    console.error('getPlayers error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mc/players/:mc_uuid
 * 取得單一玩家的綁定資料
 */
export async function getPlayer(request, env) {
  try {
    const mcUuid = request.params.mc_uuid;

    const player = await env.DB.prepare(
      'SELECT discord_id, discord_name, mc_uuid, mc_name, bound_at FROM player_bindings WHERE mc_uuid = ?'
    )
      .bind(mcUuid)
      .first();

    if (!player) {
      return Response.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    return Response.json({ success: true, data: player });
  } catch (err) {
    console.error('getPlayer error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mc/players/bind
 * MC 端觸發帳號綁定（驗證 bind code）
 * Body: { mc_uuid: string, mc_name: string, bind_code: string }
 */
export async function bindPlayer(request, env) {
  try {
    const { mc_uuid, mc_name, bind_code } = await request.json();

    if (!mc_uuid || !mc_name || !bind_code) {
      return Response.json(
        { success: false, error: 'Missing mc_uuid, mc_name, or bind_code' },
        { status: 400 }
      );
    }

    // 查找持有此 bind_code 的記錄
    const binding = await env.DB.prepare(
      'SELECT * FROM player_bindings WHERE bind_code = ?'
    )
      .bind(bind_code)
      .first();

    if (!binding) {
      return Response.json(
        { success: false, error: 'Invalid bind code' },
        { status: 404 }
      );
    }

    // 檢查是否過期（10 分鐘）
    const codeTime = new Date(binding.bind_code_at + 'Z').getTime();
    const now = Date.now();
    if (now - codeTime > 10 * 60 * 1000) {
      // 清除過期的 code
      await env.DB.prepare(
        'UPDATE player_bindings SET bind_code = NULL, bind_code_at = NULL WHERE id = ?'
      )
        .bind(binding.id)
        .run();

      return Response.json(
        { success: false, error: 'Bind code has expired' },
        { status: 410 }
      );
    }

    // 完成綁定
    await env.DB.prepare(
      `UPDATE player_bindings
       SET mc_uuid = ?, mc_name = ?, bind_code = NULL, bind_code_at = NULL, bound_at = datetime('now')
       WHERE id = ?`
    )
      .bind(mc_uuid, mc_name, binding.id)
      .run();

    return Response.json({
      success: true,
      data: {
        discord_id: binding.discord_id,
        discord_name: binding.discord_name,
        mc_uuid,
        mc_name,
      },
    });
  } catch (err) {
    console.error('bindPlayer error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===================================================
// 玩家背包
// ===================================================

/**
 * GET /api/mc/inventory/:mc_uuid
 * 取得玩家背包物品
 */
export async function getInventory(request, env) {
  try {
    const mcUuid = request.params.mc_uuid;

    const items = await env.DB.prepare(
      'SELECT item_id, item_name, quantity, metadata, updated_at FROM player_inventory WHERE mc_uuid = ? ORDER BY item_name ASC'
    )
      .bind(mcUuid)
      .all();

    return Response.json({ success: true, data: items.results });
  } catch (err) {
    console.error('getInventory error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mc/inventory/:mc_uuid
 * 覆蓋/更新玩家背包（批量）
 * Body: { items: [{ item_id, item_name, quantity, metadata? }] }
 */
export async function putInventory(request, env) {
  try {
    const mcUuid = request.params.mc_uuid;
    const { items } = await request.json();

    if (!Array.isArray(items)) {
      return Response.json(
        { success: false, error: 'items must be an array' },
        { status: 400 }
      );
    }

    // 在一個 batch 中執行：先刪除舊資料，再插入新資料
    const statements = [
      env.DB.prepare('DELETE FROM player_inventory WHERE mc_uuid = ?').bind(mcUuid),
    ];

    for (const item of items) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO player_inventory (mc_uuid, item_id, item_name, quantity, metadata, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          mcUuid,
          item.item_id,
          item.item_name,
          item.quantity || 1,
          item.metadata ? JSON.stringify(item.metadata) : null
        )
      );
    }

    await env.DB.batch(statements);

    return Response.json({ success: true, data: { count: items.length } });
  } catch (err) {
    console.error('putInventory error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/mc/inventory/:mc_uuid/:item_id
 * 更新單一物品數量
 * Body: { quantity: number, metadata?: object }
 */
export async function patchInventoryItem(request, env) {
  try {
    const { mc_uuid, item_id } = request.params;
    const { quantity, item_name, metadata } = await request.json();

    if (quantity === undefined) {
      return Response.json(
        { success: false, error: 'Missing quantity' },
        { status: 400 }
      );
    }

    // 若數量為 0，刪除該物品
    if (quantity <= 0) {
      await env.DB.prepare(
        'DELETE FROM player_inventory WHERE mc_uuid = ? AND item_id = ?'
      )
        .bind(mc_uuid, item_id)
        .run();

      return Response.json({ success: true, data: { deleted: true } });
    }

    // Upsert
    await env.DB.prepare(
      `INSERT INTO player_inventory (mc_uuid, item_id, item_name, quantity, metadata, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (mc_uuid, item_id) DO UPDATE SET
         quantity = excluded.quantity,
         item_name = COALESCE(excluded.item_name, item_name),
         metadata = COALESCE(excluded.metadata, metadata),
         updated_at = excluded.updated_at`
    )
      .bind(
        mc_uuid,
        item_id,
        item_name || item_id,
        quantity,
        metadata ? JSON.stringify(metadata) : null
      )
      .run();

    return Response.json({ success: true });
  } catch (err) {
    console.error('patchInventoryItem error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ===================================================
// 伺服器設定
// ===================================================

/**
 * GET /api/mc/settings
 * 取得所有伺服器設定
 */
export async function getSettings(request, env) {
  try {
    const settings = await env.DB.prepare(
      'SELECT key, value, updated_at FROM server_settings ORDER BY key ASC'
    ).all();

    return Response.json({ success: true, data: settings.results });
  } catch (err) {
    console.error('getSettings error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mc/settings/:key
 * 取得單一設定
 */
export async function getSetting(request, env) {
  try {
    const key = request.params.key;

    const setting = await env.DB.prepare(
      'SELECT key, value, updated_at FROM server_settings WHERE key = ?'
    )
      .bind(key)
      .first();

    if (!setting) {
      return Response.json(
        { success: false, error: 'Setting not found' },
        { status: 404 }
      );
    }

    return Response.json({ success: true, data: setting });
  } catch (err) {
    console.error('getSetting error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mc/settings/:key
 * 更新設定（Upsert）
 * Body: { value: string }
 */
export async function putSetting(request, env) {
  try {
    const key = request.params.key;
    const { value } = await request.json();

    if (value === undefined) {
      return Response.json(
        { success: false, error: 'Missing value' },
        { status: 400 }
      );
    }

    await env.DB.prepare(
      `INSERT INTO server_settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT (key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
      .bind(key, String(value))
      .run();

    return Response.json({ success: true });
  } catch (err) {
    console.error('putSetting error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mc/server/status
 * MC mod 回報伺服器狀態（批量更新多個 settings）
 * Body: { status, tps, players_online, players_max, version, ... }
 */
export async function postServerStatus(request, env) {
  try {
    const body = await request.json();

    const keyMap = {
      status: 'server_status',
      tps: 'server_tps',
      players_online: 'server_players_online',
      players_max: 'server_players_max',
      version: 'server_version',
    };

    const statements = [];
    for (const [bodyKey, settingKey] of Object.entries(keyMap)) {
      if (body[bodyKey] !== undefined) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO server_settings (key, value, updated_at)
             VALUES (?, ?, datetime('now'))
             ON CONFLICT (key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at`
          ).bind(settingKey, String(body[bodyKey]))
        );
      }
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('postServerStatus error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
