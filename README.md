# 🍎 自制视频苹果 CMS 采集站（GitHub + Cloudflare）

给自制无版权视频搭一个**苹果 CMS V10 协议兼容**的采集接口，
LibrePlay / TVBox 等任何支持苹果 CMS 的播放器都能直接添加为视频源。

## 架构

```
GitHub 仓库（本项目）                Cloudflare
┌─────────────────────┐             ┌──────────────────────────┐
│ manifest.json       │  push       │ Worker（src/worker.js）  │
│  视频清单（标题/海报/ │ ────────► │  /api.php/provide/vod/   │
│  简介/播放地址）     │  Actions    │  输出苹果 CMS V10 JSON   │
└─────────────────────┘  自动部署   └────────────┬─────────────┘
                                                │ 直链
                                     ┌──────────▼──────────┐
                                     │ R2 存储桶            │
                                     │  videos/*.mp4       │
                                     │  posters/*.jpg      │
                                     │  公开读、零流出费    │
                                     └─────────────────────┘
```

**核心思路**：不需要真的安装苹果 CMS（那要 PHP+MySQL 服务器）。
播放器只认**协议**（特定的 URL 路径 + JSON 字段格式），
用 Cloudflare Worker 按协议原样输出 JSON 即可，加视频 = 改 `manifest.json` 后 push。

## 一、准备工作

1. 注册 [Cloudflare](https://dash.cloudflare.com) 账号（免费）。
2. 建 R2 存储桶：控制台 → R2 对象存储 → 创建存储桶，如 `media`。
3. 开启公开访问：存储桶 → 设置 → 公开访问，允许 `r2.dev` 域名，
   或绑定自己的域名（如 `media.mutse.top`，需域名已托管在 Cloudflare）。
   记下公开访问地址，例如 `https://media.mutse.top`。

## 二、上传视频和海报

把自制视频（mp4）和海报图（jpg/png）传到 R2，可选任一方式：

- 网页：R2 存储桶 → 上传（适合少量文件）。
- 命令行：`npx wrangler r2 object put media/videos/xxx.mp4 --file xxx.mp4`
- 图形工具：rclone（适合批量）。

建议目录结构：`videos/` 放视频，`posters/` 放海报。
文件名可含中文，`tools/build-manifest.py` 会自动做 URL 编码。

## 三、写视频清单 manifest.json

每个视频一个对象，字段与苹果 CMS 官方一致：

| 字段 | 说明 |
|---|---|
| `vod_id` | 数字 id，唯一 |
| `vod_name` | 标题（搜索 `wd=` 按此匹配） |
| `vod_pic` | 海报图直链 |
| `type_name` / `vod_year` / `vod_area` / `vod_lang` | 分类/年份/地区/语言 |
| `vod_actor` / `vod_director` / `vod_content` | 演员/导演/简介 |
| `vod_remarks` | 角标，如"正片""更新至3集" |
| `vod_play_from` | 线路名，多线路用 `$$$` 分隔 |
| `vod_play_url` | 播放串，格式见下 |

**播放串格式**（苹果 CMS 约定）：

```
单集：    正片$https://media.mutse.top/videos/a.mp4
多集：    第1集$https://…/ep1.mp4#第2集$https://…/ep2.mp4     （# 分隔剧集）
多线路：  第1集$https://线路A/ep1.mp4$$$第1集$https://线路B/ep1.mp4   （$$$ 分隔线路，
          此时 vod_play_from 也要写成"线路A$$$线路B"一一对应）
```

注意只切**第一个** `$`（URL 里如有 `$` 不影响）。

### 用脚本自动生成

```bash
# media/ 里放好视频，可选写 media/meta.json 补标题/海报/简介/分集
python3 tools/build-manifest.py --base-url https://media.mutse.top/videos
# 生成 manifest.json，检查无误后 git push
```

## 四、本地预览

```bash
npx wrangler dev
# 浏览器打开 http://localhost:8787/api.php/provide/vod/?ac=videolist
```

## 五、部署

**方式 A：一键部署**
```bash
npx wrangler login
npx wrangler deploy
```

**方式 B：GitHub 自动部署（推荐）**
1. 本项目推到 GitHub。
2. Cloudflare → 我的个人资料 → API 令牌 → 创建"Workers 部署"权限的 Token。
3. GitHub 仓库 → Settings → Secrets → Actions，新建 `CLOUDFLARE_API_TOKEN`。
4. 以后改 `manifest.json` / `src/worker.js` 后 push 到 main，自动部署生效。

## 六、绑定自定义域名（可选但推荐）

Cloudflare 控制台 → Workers → apple-cms-station → 设置 → 域和路由 → 添加自定义域，
如 `api.mutse.top`。之后采集接口地址就是：

```
https://api.mutse.top/api.php/provide/vod/
```

## 七、在 LibrePlay 里添加为视频源

设置 → 视频源 → 添加 Apple CMS 源，填上面的接口地址即可。
搜索、详情、选集、换线路走的都是标准协议，已按 LibrePlay 的解析器逐字段对齐过。

## 八、费用（免费额度内）

| 项目 | 免费额度 | 说明 |
|---|---|---|
| R2 存储 | 10 GB/月 | 视频放这里 |
| R2 流出流量 | **无限、零费用** | 视频站最大头的开销，R2 全免 |
| R2 读取 | 每月 1000 万次 B 类操作 | 播视频走 B 类，个人站够用 |
| Workers | 每天 10 万次请求 | 接口调用，绰绰有余 |

## 九、常见问题

- **中文文件名播不了**：播放串里的 URL 必须百分号编码，脚本已自动处理；手写时把中文部分用编码工具转一下。
- **网页播放器跨域**：R2 存储桶 → 设置 → CORS 配一条 `AllowedOrigins: ["*"]`；LibrePlay 等原生 App 不受影响。
- **m3u8 切片**：把 `.m3u8` 和 `ts/` 整个目录传到 R2，播放串填 m3u8 地址即可；注意 ts 分片文件名保持相对引用。
- **搜不到**：搜索是标题包含匹配，检查 `vod_name`；接口返回 `code: 1` 才算正常。
- **想加分类浏览**：在 `type_name` 里写分类，播放器端一般只做搜索+详情，分类页可后续在 Worker 里按 `t=` 参数扩展。
