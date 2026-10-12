#!/usr/bin/env python3
"""扫描本地 media/ 目录，生成 Apple CMS V10 兼容的 manifest.json。

用法:
    python3 tools/build-manifest.py --base-url https://media.mutse.top/videos

约定:
  - media/ 下放视频文件（.mp4 / .m3u8 / .mov / .mkv），文件名可含中文（自动做 URL 编码）。
  - media/meta.json（可选）：按"不带扩展名的文件名"给每个视频补元数据，例如:
    {
      "taohuayuan": {
        "vod_name": "桃花源记漫剧",
        "vod_pic": "https://media.mutse.top/posters/taohuayuan.jpg",
        "vod_content": "简介……",
        "type_name": "漫剧",
        "vod_year": "2026",
        "vod_play_from": "R2直连",
        "episodes": [
          {"name": "第1集", "file": "taohuayuan-ep1.mp4"},
          {"name": "第2集", "file": "taohuayuan-ep2.mp4"}
        ]
      }
    }
    不写 episodes 时默认单集："正片$<base>/<文件名>"。
    也可以直接写 "vod_play_url" 原始串（多线路用 $$$ 分隔，线路名写 vod_play_from 同样用 $$$ 分隔）。
"""

import argparse
import json
import os
from urllib.parse import quote

VIDEO_EXTS = {".mp4", ".m3u8", ".mov", ".mkv", ".webm"}


def build(media_dir, base_url, meta_path, out_path):
    meta = {}
    if os.path.isfile(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)

    base = base_url.rstrip("/")
    files = sorted(
        f for f in os.listdir(media_dir)
        if os.path.splitext(f)[1].lower() in VIDEO_EXTS
        and os.path.isfile(os.path.join(media_dir, f))
    )

    videos = []
    for i, filename in enumerate(files, start=1):
        stem = os.path.splitext(filename)[0]
        m = meta.get(stem, {}) or {}

        vod_id = m.get("vod_id", i)
        vod_name = m.get("vod_name", stem)
        if "vod_play_url" in m:
            play_url = m["vod_play_url"]
        elif "episodes" in m:
            parts = []
            for ep in m["episodes"]:
                parts.append(f"{ep['name']}${base}/{quote(ep['file'])}")
            play_url = "#".join(parts)
        else:
            play_url = f"正片${base}/{quote(filename)}"

        videos.append({
            "vod_id": vod_id,
            "vod_name": vod_name,
            "vod_pic": m.get("vod_pic", ""),
            "type_name": m.get("type_name", "自制短片"),
            "vod_year": m.get("vod_year", ""),
            "vod_area": m.get("vod_area", "中国"),
            "vod_lang": m.get("vod_lang", "国语"),
            "vod_actor": m.get("vod_actor", ""),
            "vod_director": m.get("vod_director", ""),
            "vod_remarks": m.get("vod_remarks", "正片"),
            "vod_content": m.get("vod_content", ""),
            "vod_play_from": m.get("vod_play_from", "R2直连"),
            "vod_play_url": play_url,
        })

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"videos": videos}, f, ensure_ascii=False, indent=2)
    print(f"已生成 {out_path}，共 {len(videos)} 个视频")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--media-dir", default="media", help="本地视频目录")
    ap.add_argument("--base-url", required=True, help="R2 公开访问域名，如 https://media.mutse.top/videos")
    ap.add_argument("--meta", default="media/meta.json", help="元数据文件")
    ap.add_argument("--out", default="manifest.json", help="输出文件")
    args = ap.parse_args()
    build(args.media_dir, args.base_url, args.meta, args.out)


if __name__ == "__main__":
    main()
