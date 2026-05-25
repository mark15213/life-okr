# 🎯 人生看板 (Life Dashboard)

一个个人生活追踪看板系统,通过三个核心指标来量化和激励个人成长。

## 核心功能

### 💪 俯卧撑余额系统
- 抽一支烟:+100 俯卧撑
- 运动一次:-100 俯卧撑
- 余额为负数时可兑换为等额现金奖励
- "大富翁"式财富等级系统

### ⏱️ 专注时间追踪
- 手动录入每日专注时长
- 可选：从 **TickTick 番茄钟自动同步**（见下方"后台自动同步"）
- 显示值 = 手动 + TickTick 同步
- 查看本周/本月平均专注时长

### ✅ 任务完成追踪
- 手动 +1 记录完成任务
- 可选：从 **TickTick 自动同步今日已完成任务数**（含 Inbox）
- 显示值 = 手动 + TickTick 同步
- 查看本周/本月完成任务总数

### 🤖 AI Token 使用量
- 自动统计本地 Claude Code 和 Codex CLI 的每日 token 消耗
- 通过本地后台脚本扫描 `~/.claude/projects` 和 `~/.codex/sessions`，POST 到 `/api/tokens`
- 查看本周/本月平均

### 📊 数据趋势
- 7天/30天数据趋势图表
- 可视化你的进步轨迹

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Recharts
- **数据库**: Vercel Postgres
- **部署**: Vercel

## 开始使用

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env.local` 并填入你的 Vercel Postgres 连接信息:

```bash
cp .env.example .env.local
```

### 3. 初始化数据库

```bash
npm run setup-db
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 后台自动同步（可选）

两个本地 launchd job 把外部数据自动写到 Postgres，dashboard 显示时会自动加进去。两者完全可选——不装的话所有卡片仍然能用手动模式。

| Job | 频率 | 干啥 | 写库方式 |
|---|---|---|---|
| `com.life-okr.ticktick-sync` | 每 15 min | 拉今天的 TickTick focus 分钟数 + 完成任务数 | 直连 Supabase（用 `POSTGRES_URL`） |
| `com.life-okr.token-reporter` | 每 30 min | 扫本地 Claude Code / Codex CLI 日志，统计今日 token 消耗 | HTTP POST 到 `DASHBOARD_URL/api/tokens`（用 `TOKEN_REPORT_SECRET` 鉴权） |

### TickTick 同步

**所需环境变量**（加在 `.env.local`）：

```
TICKTICK_EMAIL="your-account-email"
TICKTICK_PASSWORD="your-password"  # Google-OAuth 账号 password 不可用，见下文
```

**Google-OAuth 登录的 TickTick 账号**：API 的 password 登录会被 TickTick 拒绝（即使密码正确）。必须从已登录的 web 浏览器 DevTools 复制 `t=` cookie，手写一个 `.ticktick-session.json`：

```json
{"cookie": "t=<浏览器复制的 t cookie 值>"}
```

文件放项目根目录，已 gitignored。Cookie 过期（几个月一次）后重新复制即可。

**安装、运行、管理**：

```bash
# 先手动验证一次（看到 ✅ ticktick sync ... 就 OK）
npm run sync-ticktick

# 装 launchd job
bash scripts/install-ticktick-sync.sh

# 看 log
tail -f ~/.local/state/life-okr/ticktick-sync.log

# 立刻触发一次（不等 15 min）
launchctl kickstart -k gui/$(id -u)/com.life-okr.ticktick-sync

# 卸载
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.life-okr.ticktick-sync.plist
```

**实现细节**：写入 `daily_records` 表的 `focus_minutes_ticktick` / `tasks_completed_ticktick` 两列（手动录入仍然写原来的 `focus_minutes` / `tasks_completed`，互不干扰；显示时相加）。数据通过 TickTick 非官方 cookie API 获取——官方 Open API 不暴露 Pomodoro，也不包含 Inbox 项目。详见 `docs/superpowers/specs/2026-05-24-ticktick-sync-design.md`。

### Token 使用量上报

**所需环境变量**（`.env.local` 和 Vercel 各一份，值必须一致）：

```
DASHBOARD_URL="https://your-app.vercel.app"  # 或 http://localhost:3000 仅本地用
TOKEN_REPORT_SECRET="generate-with: openssl rand -hex 32"
```

> Vercel 上设完 `TOKEN_REPORT_SECRET` 后必须 **redeploy** 才会生效。

**安装、运行、管理**：

```bash
# 手动验证（看到 reported: ... 就 OK）
npm run report-tokens

# 装 launchd job
bash scripts/install-token-reporter.sh

# 看 log
tail -f ~/.local/state/life-okr/reporter.log

# 立刻触发
launchctl kickstart -k gui/$(id -u)/com.life-okr.token-reporter

# 卸载
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.life-okr.token-reporter.plist
```

### 同时查看两个 job 状态

```bash
launchctl list | grep life-okr
# 第二列是上次的退出码：0=成功，1=失败
```

偶发 "fetch failed" / 连接超时（Node IPv6 first-connect 的小毛病）属于正常——launchd 下一个 interval 会自动补，数据最多滞后一个周期。

## 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 导入项目
3. 添加 Vercel Postgres 数据库
4. 运行 `npm run setup-db` 初始化数据库
5. 部署完成!

> 如果生产环境已经有 `daily_records` 表，添加 TickTick 相关字段需要跑一次 migration：
> `npx tsx scripts/migrate-add-ticktick-cols.ts`

## 财富等级系统

| 余额范围 | 等级 | 主题 |
|---------|------|------|
| 0 ~ -500 | 💰 小金库 | 铜色主题 |
| -500 ~ -1000 | 💎 储蓄达人 | 银色主题 |
| -1000 ~ -2000 | 🏆 理财高手 | 金色主题 |
| -2000 ~ -5000 | 👑 财富自由 | 紫金主题 |
| -5000以上 | 🎰 大富翁 | 彩虹特效 |

## License

MIT
