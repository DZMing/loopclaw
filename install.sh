#!/usr/bin/env bash
# 龙虾永动引擎 — 一键安装脚本
#
# 用法（推荐）:
#   curl -fsSL https://raw.githubusercontent.com/zhimingdeng/lobster-perpetual-engine/main/install.sh | bash
#
# 或 clone 后本地运行:
#   bash install.sh [--dir <安装目录>] [--plugin-dir <插件目录>] [--no-link] [--no-openclaw]
#
set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[ERR]${NC}   $*" >&2; exit 1; }
step()  { echo -e "\n${BOLD}$*${NC}"; }

REPO_URL="https://github.com/DZMing/loopclaw.git"
REPO_NAME="loopclaw"
DEFAULT_INSTALL_DIR="${HOME}/.local/share/loopclaw"
DEFAULT_PLUGIN_DIR="${HOME}/.openclaw/workspace/plugins"

# ── 参数解析 ──────────────────────────────────────────────────────────────────
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
PLUGIN_DIR="$DEFAULT_PLUGIN_DIR"
USE_SYMLINK=true
SKIP_OPENCLAW=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)         INSTALL_DIR="$2"; shift 2 ;;
    --plugin-dir)  PLUGIN_DIR="$2";  shift 2 ;;
    --no-link)     USE_SYMLINK=false; shift ;;
    --no-openclaw) SKIP_OPENCLAW=true; shift ;;
    -h|--help)
      echo "用法: bash install.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --dir <路径>         项目安装目录（默认: ~/.local/share/lobster-perpetual-engine）"
      echo "  --plugin-dir <路径>  OpenClaw 插件目录（默认: ~/.openclaw/workspace/plugins）"
      echo "  --no-link            复制文件而非符号链接注册插件"
      echo "  --no-openclaw        跳过 OpenClaw 插件注册步骤"
      echo ""
      echo "一键安装（无需提前 clone）:"
      echo "  curl -fsSL https://raw.githubusercontent.com/zhimingdeng/lobster-perpetual-engine/main/install.sh | bash"
      exit 0 ;;
    *) die "未知参数: $1（使用 --help 查看帮助）" ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
echo "  🦞 LoopClaw"
echo "  Zero-latency perpetual AI Agent engine — OpenClaw plugin"
echo -e "${NC}"
echo "────────────────────────────────────────────────────"

# ── 1. 检查依赖 ───────────────────────────────────────────────────────────────
step "▶ 步骤 1/5  检查运行环境"

command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js >= 20\n       下载地址: https://nodejs.org"
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR="${NODE_VER%%.*}"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node.js 版本过低: v${NODE_VER}，需要 >= 20"
ok "Node.js v${NODE_VER}"

command -v npm >/dev/null 2>&1 || die "未找到 npm，请重新安装 Node.js"
ok "npm $(npm --version)"

command -v git >/dev/null 2>&1 || die "未找到 git，请先安装 git"
ok "git $(git --version | awk '{print $3}')"

if ! command -v openclaw >/dev/null 2>&1; then
  warn "未找到 openclaw CLI — 将跳过插件注册步骤"
  SKIP_OPENCLAW=true
fi

# ── 2. 下载 / 更新代码 ────────────────────────────────────────────────────────
step "▶ 步骤 2/5  下载代码"

# 判断是否已在项目目录内（本地 clone 后直接运行的场景）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-./install.sh}")" 2>/dev/null && pwd || echo "")"
if [[ -f "${SCRIPT_DIR}/package.json" ]] && grep -q "lobster-perpetual-engine" "${SCRIPT_DIR}/package.json" 2>/dev/null; then
  # 已在项目目录，直接使用
  PROJECT_DIR="$SCRIPT_DIR"
  ok "检测到本地项目目录: ${PROJECT_DIR}"
elif [[ -d "${INSTALL_DIR}/.git" ]]; then
  # 已安装过，执行更新
  PROJECT_DIR="$INSTALL_DIR"
  info "检测到已有安装，更新到最新版本..."
  git -C "$PROJECT_DIR" pull --rebase --autostash origin main
  ok "更新完成"
else
  # 全新安装，克隆仓库
  info "克隆仓库到: ${INSTALL_DIR}"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  PROJECT_DIR="$INSTALL_DIR"
  ok "克隆完成"
fi

cd "$PROJECT_DIR"

# ── 3. 安装依赖 & 构建 ────────────────────────────────────────────────────────
step "▶ 步骤 3/5  安装依赖并构建"

info "npm install..."
npm install --silent
ok "依赖安装完成"

info "编译 TypeScript..."
npm run build --silent
ok "构建完成 → ${PROJECT_DIR}/dist"

# ── 4. 初始化配置 ─────────────────────────────────────────────────────────────
step "▶ 步骤 4/5  初始化配置"

ENV_FILE="${PROJECT_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "${PROJECT_DIR}/.env.example" "$ENV_FILE"
  ok ".env 已从模板创建"
  echo ""
  echo -e "  ${YELLOW}⚠️  请编辑以下配置文件，填写你的实际参数:${NC}"
  echo -e "  ${BOLD}${ENV_FILE}${NC}"
  echo ""
  echo "  关键配置项:"
  echo "    OPENCLAW_AUTH_TOKEN  — HTTP/RPC 接口鉴权 Token（强烈建议设置）"
  echo "    OPENCLAW_GATEWAY_URL — OpenClaw Gateway 地址（默认 http://localhost:3000）"
  echo ""
else
  ok ".env 已存在，跳过"
fi

# ── 5. 注册 OpenClaw 插件 ──────────────────────────────────────────────────────
step "▶ 步骤 5/5  注册 OpenClaw 插件"

if [[ "$SKIP_OPENCLAW" == true ]]; then
  warn "跳过插件注册（openclaw CLI 不可用）"
  warn "手动注册方法:"
  warn "  ln -s ${PROJECT_DIR} ${PLUGIN_DIR}/loopclaw"
  warn "  openclaw restart gateway"
else
  PLUGIN_TARGET="${PLUGIN_DIR}/loopclaw"
  mkdir -p "$PLUGIN_DIR"

  # 移除旧版本
  if [[ -e "$PLUGIN_TARGET" || -L "$PLUGIN_TARGET" ]]; then
    rm -rf "$PLUGIN_TARGET"
    info "已移除旧版本"
  fi

  if [[ "$USE_SYMLINK" == true ]]; then
    ln -s "$PROJECT_DIR" "$PLUGIN_TARGET"
    ok "插件符号链接已创建"
  else
    cp -r "$PROJECT_DIR" "$PLUGIN_TARGET"
    ok "插件文件已复制"
  fi

  info "重启 OpenClaw Gateway..."
  if openclaw restart gateway 2>/dev/null; then
    ok "Gateway 重启完成"
  else
    warn "Gateway 重启失败，请手动执行: openclaw restart gateway"
  fi
fi

# ── 完成 ──────────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo -e "${GREEN}${BOLD}✅ 安装成功！${NC}"
echo "────────────────────────────────────────────────────"
echo ""
echo -e "  ${BOLD}项目目录:${NC}  ${PROJECT_DIR}"
echo -e "  ${BOLD}配置文件:${NC}  ${ENV_FILE}"
echo ""
echo -e "  ${BOLD}Bot 命令（在 Telegram / Discord 中使用）:${NC}"
echo "    /start_partner     启动永动引擎"
echo "    /stop_partner      停止永动引擎"
echo "    /partner_status    查看引擎状态"
echo "    /partner_mission   设置/查看任务目标"
echo ""
echo -e "  ${BOLD}开发命令:${NC}"
echo "    cd ${PROJECT_DIR}"
echo "    npm test           运行全套测试（355 个用例）"
echo "    npm run coverage   查看覆盖率报告"
echo "    npm run dev        TypeScript 监听模式"
echo ""
if [[ ! -s "$ENV_FILE" ]] || grep -q "your_auth_token_here" "$ENV_FILE" 2>/dev/null; then
  echo -e "  ${YELLOW}下一步: 编辑 ${ENV_FILE} 填写你的配置${NC}"
  echo ""
fi
