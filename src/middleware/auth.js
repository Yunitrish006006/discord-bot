/**
 * Minecraft API Key 認證中介層
 * 檢查 X-API-Key header 是否有效
 */
export function authenticateMinecraft(request, env) {
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey || apiKey !== env.MINECRAFT_API_KEY) {
    return Response.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 認證通過，回傳 null
  return null;
}
