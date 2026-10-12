/**
 * Apple CMS V10 兼容 API —— Cloudflare Worker 版
 *
 * 数据来源: 仓库根目录的 manifest.json（GitHub 管理，Actions 自动部署）。
 * 对外暴露与苹果 CMS 官方采集接口相同的路径与参数：
 *   GET /api.php/provide/vod/?ac=videolist&wd=关键词&pg=1   搜索 / 列表（分页）
 *   GET /api.php/provide/vod/?ac=videolist&ids=1,2          按 id 取列表（fallback）
 *   GET /api.php/provide/vod/?ac=detail&ids=1               详情（含播放地址）
 *
 * 返回字段与 LibrePlay 的 CMSResponse / CMSVideo 解析器一一对应，
 * 任意遵循苹果 CMS V10 协议的播放器（LibrePlay、各类 TVBox）都能直接用。
 */
import MANIFEST from './manifest.json';

const DEFAULT_PAGE_SIZE = 20;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=60',
    },
  });
}

function allVideos() {
  return Array.isArray(MANIFEST.videos) ? MANIFEST.videos : [];
}

/** 只保留协议字段，防止手写 manifest 时多出奇怪的 key 污染响应 */
function normalize(v) {
  return {
    vod_id: v.vod_id ?? '',
    vod_name: v.vod_name ?? '',
    vod_pic: v.vod_pic ?? '',
    type_name: v.type_name ?? '',
    vod_year: v.vod_year ?? '',
    vod_area: v.vod_area ?? '',
    vod_lang: v.vod_lang ?? '',
    vod_actor: v.vod_actor ?? '',
    vod_director: v.vod_director ?? '',
    vod_remarks: v.vod_remarks ?? '',
    vod_content: v.vod_content ?? '',
    vod_play_from: v.vod_play_from ?? '',
    vod_play_url: v.vod_play_url ?? '',
  };
}

function findByIds(idsParam) {
  const want = new Set(
    String(idsParam || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return allVideos()
    .filter((v) => want.has(String(v.vod_id)))
    .map(normalize);
}

function paginate(items, page, limit) {
  const total = items.length;
  const pagecount = Math.max(1, Math.ceil(total / limit));
  const p = Math.min(Math.max(1, page), pagecount);
  const list = items.slice((p - 1) * limit, p * limit).map(normalize);
  return { code: 1, msg: '数据列表', page: p, pagecount, limit, total, list };
}

function docPage() {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>Apple CMS 采集接口</title></head><body style="font-family:system-ui;padding:2em;max-width:720px">
<h2>🍎 Apple CMS V10 兼容采集接口</h2>
<p>把下面地址填进播放器的「Apple CMS 源」即可：</p>
<p><code>${'${host}'}/api.php/provide/vod/</code></p>
<ul>
<li><code>?ac=videolist&amp;wd=关键词&amp;pg=1</code> —— 搜索 / 列表</li>
<li><code>?ac=videolist&amp;ids=1,2</code> —— 按 id 取</li>
<li><code>?ac=detail&amp;ids=1</code> —— 详情（含播放地址）</li>
</ul>
<p>视频清单由 GitHub 仓库的 <code>manifest.json</code> 维护，push 后自动部署生效。</p>
</body></html>`;
  return new Response(html.replace('${host}', ''), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': '*',
        },
      });
    }

    const path = url.pathname;
    if (path === '/' || path === '/index.html') {
      return docPage();
    }
    if (!path.startsWith('/api.php/provide/vod')) {
      return json(
        { code: 0, msg: '接口不存在', page: 1, pagecount: 0, limit: 0, total: 0, list: [] },
        404
      );
    }

    const q = url.searchParams;
    const ac = (q.get('ac') || 'videolist').toLowerCase();

    // 详情：ac=detail&ids=1（LibrePlay 优先走这个）
    if (ac === 'detail') {
      const list = findByIds(q.get('ids'));
      return json({
        code: 1,
        msg: '数据详情',
        page: 1,
        pagecount: 1,
        limit: list.length,
        total: list.length,
        list,
      });
    }

    // 列表：ac=videolist / ac=list
    // 1) ids=1,2 —— 按 id 取（LibrePlay 的 detail fallback 走这个）
    const ids = q.get('ids');
    if (ids) {
      const list = findByIds(ids);
      return json({
        code: 1,
        msg: '数据列表',
        page: 1,
        pagecount: 1,
        limit: list.length,
        total: list.length,
        list,
      });
    }
    // 2) wd=关键词 —— 搜索；无参数 —— 最新列表（分页）
    const wd = (q.get('wd') || '').trim().toLowerCase();
    const pg = parseInt(q.get('pg') || '1', 10) || 1;
    const limit = parseInt(q.get('limit') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
    let items = allVideos();
    if (wd) {
      items = items.filter((v) =>
        String(v.vod_name || '').toLowerCase().includes(wd)
      );
    }
    return json(paginate(items, pg, limit));
  },
};
