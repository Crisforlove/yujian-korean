#!/bin/bash

# 语见 (Yujian) 一键部署脚本
# 使用方法: ./scripts/deploy.sh

set -e

echo "🚀 开始部署语见项目..."

# 确保在项目根目录
cd "$(dirname "$0")/.."

echo "📦 添加所有改动..."
git add -A

# 如果有改动就提交
if ! git diff-index --quiet HEAD --; then
  echo "💾 提交本地改动..."
  git commit -m "chore: prepare deployment $(date '+%Y-%m-%d %H:%M')"
else
  echo "✅ 没有新的本地改动"
fi

echo "⬆️  推送到 GitHub..."
git push origin main

echo ""
echo "✅ 代码已推送到 GitHub"
echo ""
echo "Vercel 应该会自动开始部署（如果已连接 GitHub）。"
echo "你也可以去 Vercel Dashboard 手动触发最新部署。"
echo ""
echo "部署完成后访问你的 Vercel 域名即可看到最新版本。"
