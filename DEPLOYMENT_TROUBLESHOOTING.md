# 部署故障排查指南

## 问题：API返回500错误

你的应用已部署到Vercel，但API端点返回500错误：
- `GET /api/records/today` → 500
- `GET /api/records` → 500

错误信息：
```
Error fetching today record: Error: Failed to fetch today's record
Error fetching records: Error: Failed to fetch records
```

## 原因分析

这些错误来自 `lib/db.ts` 中的数据库查询失败。最可能的原因是：

### 1. 数据库表未创建 ❌

Vercel Postgres数据库中还没有 `daily_records` 表。

### 2. 环境变量未配置 ❌

Vercel项目中没有设置Postgres连接环境变量。

## 解决方案

### 步骤1：检查Vercel Postgres是否已添加

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 进入你的项目 `life-okr`
3. 点击 **Storage** 标签
4. 确认是否已添加 **Postgres** 数据库

**如果没有：**
- 点击 **Create Database**
- 选择 **Postgres**
- 选择区域（建议选择离你最近的）
- 点击 **Create**

### 步骤2：连接数据库到项目

1. 在 Storage 页面，找到你的 Postgres 数据库
2. 点击数据库名称
3. 点击 **Connect Project** 按钮
4. 选择 `life-okr` 项目
5. 点击 **Connect**

这会自动将所有必需的环境变量添加到你的项目中：
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`
- `POSTGRES_HOST`
- `POSTGRES_PASSWORD`
- `POSTGRES_DATABASE`

### 步骤3：初始化数据库表

有两种方法：

#### 方法A：使用Vercel CLI（推荐）

```bash
# 1. 安装Vercel CLI（如果还没有）
npm i -g vercel

# 2. 登录
vercel login

# 3. 链接项目
vercel link

# 4. 拉取环境变量到本地
vercel env pull .env.local

# 5. 运行数据库初始化脚本
npm run setup-db
```

#### 方法B：使用Vercel Postgres Dashboard

1. 在Vercel Dashboard中，进入你的Postgres数据库
2. 点击 **Query** 标签
3. 复制并执行以下SQL：

```sql
CREATE TABLE IF NOT EXISTS daily_records (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  cigarettes INT NOT NULL DEFAULT 0,
  exercises INT NOT NULL DEFAULT 0,
  pushup_balance INT NOT NULL DEFAULT 0,
  focus_minutes INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date DESC);
```

4. 点击 **Run Query**

### 步骤4：重新部署

环境变量和数据库表都设置好后：

1. 在Vercel Dashboard中，进入你的项目
2. 点击 **Deployments** 标签
3. 点击最新部署右侧的 **...** 菜单
4. 选择 **Redeploy**
5. 确认重新部署

或者，推送一个新的commit来触发部署：

```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push
```

### 步骤5：验证修复

1. 等待部署完成（约1-2分钟）
2. 访问你的应用：`https://life-okr.vercel.app`
3. 检查是否能正常加载数据

如果仍然看到"加载中..."，打开浏览器开发者工具（F12）查看Console和Network标签，确认API请求是否成功。

## 验证清单

- [ ] Vercel Postgres数据库已创建
- [ ] 数据库已连接到项目
- [ ] 环境变量已自动添加
- [ ] `daily_records` 表已创建
- [ ] 索引已创建
- [ ] 应用已重新部署
- [ ] API端点返回200状态码
- [ ] 页面正常显示数据

## 常见问题

### Q: 如何查看详细的错误日志？

A: 在Vercel Dashboard中：
1. 进入项目
2. 点击 **Logs** 标签
3. 选择 **Functions** 查看API路由的日志
4. 查找包含 "Error" 的日志条目

### Q: 数据库连接超时怎么办？

A:
1. 确认数据库和项目在同一区域
2. 检查 `POSTGRES_URL` 是否正确
3. 尝试使用 `POSTGRES_URL_NON_POOLING` 进行连接

### Q: 如何测试数据库连接？

A: 创建一个测试API路由：

```typescript
// app/api/test-db/route.ts
import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { rows } = await sql`SELECT NOW()`;
    return NextResponse.json({ success: true, time: rows[0] });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
```

访问 `/api/test-db` 查看连接是否成功。

## 需要帮助？

如果按照以上步骤仍然无法解决问题，请提供：
1. Vercel部署日志截图
2. 浏览器Console错误信息
3. 数据库Query执行结果

我会帮你进一步诊断问题。
