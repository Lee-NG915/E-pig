#!/usr/bin/env bash
# 部署 E-pig 到 Cloudflare Workers（@opennextjs/cloudflare）。
#
# 背景：src/proxy.ts 是 Next 16 Node runtime proxy，@opennextjs/cloudflare
# 暂不支持 Node middleware（官方文档明确 "not yet supported"）。
# 本脚本在构建期间临时把 proxy 移出、结束后无条件恢复。
# CF 版因此缺失的能力只有"裸路径 308 → /{market} 前缀"规范化；
# `/` 与 `/{market}/...` 直连路由不受影响（详见 docs/codex/research/07）。
#
# 用法：bash scripts/deploy-cf.sh
set -euo pipefail

PROXY_FILE="src/proxy.ts"
STASH_FILE="/tmp/e-pig-proxy-stash-$$.ts"

restore() {
  if [[ -f "$STASH_FILE" ]]; then
    mv "$STASH_FILE" "$PROXY_FILE"
    echo "[deploy-cf] proxy.ts 已恢复"
  fi
}
trap restore EXIT

if [[ -f "$PROXY_FILE" ]]; then
  echo "[deploy-cf] 临时移出 $PROXY_FILE（CF 不支持 Node middleware）"
  mv "$PROXY_FILE" "$STASH_FILE"
fi

npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
