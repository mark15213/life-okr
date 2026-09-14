# Hustle Desktop

Windows x64 / macOS Apple Silicon 桌面客户端。使用独立 Electron 主进程管理计时，界面不依赖 Next.js 开发服务器；主窗口复用网页首页、趋势与分类统计、运动/吸烟记录、历史补录、奖励金库和任务管理组件，连接同一个真实后端。

## 启动

需要 Node.js 22.12+（建议 24 LTS）。在仓库根目录运行：

```powershell
npm ci
npm --prefix desktop install
npm run desktop:dev
```

也支持在 `desktop` 中使用 pnpm，仓库提交了 `pnpm-lock.yaml` 和构建脚本许可配置。安装需要下载 Electron。

启动后出现 256 × 48 的深色胶囊浮标；同时打开完整看板。顶部“任务与番茄”或快捷键打开任务面板。创建任务 → 选择任务 → 开始专注。点击浮标的任务名称展开切换器；点击暂停图标暂停或继续；拖动胶囊两侧空白处移动。右键浮标或使用托盘菜单设置置顶、锁定位置及隐藏。

## 全局快捷键

| 操作 | Windows | macOS |
|---|---|---|
| 打开 / 收起任务切换器 | Ctrl + Alt + K | Control + Option + K |
| 切回上一任务 | Ctrl + Alt + J | Control + Option + J |
| 暂停 / 继续 | Ctrl + Alt + P | Control + Option + P |

切换器中用方向键选择、Enter 切换、Esc 收起。Mac 使用 Control（⌃），不是 Command。设置中可以改绑；注册冲突会显示原因，鼠标入口仍可使用。

## 计时规则

- 一轮全局番茄允许多个任务分时投入；切换不重置倒计时。
- A 10 分钟 + B 10 分钟 + C 10 分钟 = 一轮 30 分钟，而非三轮。
- 暂停中切换仅更改选择，明确继续后才增加目标任务用时。
- 运行时间由单调时钟计算，片段保留毫秒精度，显示到秒。今日统计按上海时区跨午夜拆分。
- 主窗口关闭或浮标隐藏仍继续；锁屏、休眠和完全退出会暂停。重启恢复为暂停，不补算离开时间。
- 完成后持久化再发送系统通知，不自动开始下一轮，也不自动完成 Task。
- 完整及提前结束的番茄都保留实际用时和各任务分配；不丢弃不足一分钟的片段。

## 连接 TickTick 任务

设置 → 输入已部署人生看板的根地址和看板解锁码 → 连接并同步。服务端须已有可用 TickTick 会话。默认地址是 `https://hustle-beta-i.vercel.app`。也可直接在完整看板输入解锁码；主窗口和任务面板共用登录会话。网页已有记录接口通过主进程白名单访问，不需要单独运行或部署后端。

远端地址必须为 HTTPS，本机调试允许 `http://localhost:3000`。解锁码只用于此次请求，不存入计时文件；HttpOnly 登录 Cookie 交给 Electron 的独立持久会话管理，不暴露给界面。网络请求有 20 秒超时，禁止重定向。每五分钟自动刷新，也可手动刷新。

首次没有缓存时可创建本地任务。同步失败保留缓存，不影响计时。新结束的远端任务番茄按任务和上海日期合并片段，累计满一分钟时同步到现有 TickTick 专注接口，再刷新看板统计。重试沿用固定记录 ID，避免重复；未同步状态随本地历史持久化。原有历史不追溯上传，本地任务与不足一分钟的云端条目只保存在本机。两台设备的计时各自独立。

## 数据与恢复

设置 → 打开数据目录。计时文件名为 `focus-state.json`，存放在 Electron 的用户数据目录。状态变化立即保存，运行中每两秒保存，使用临时文件、fsync 和原子替换。损坏文件会保留带 `.damaged-` 后缀的备份并提示。磁盘保存失败时暂停并提示，不继续悄悄丢数据。

Windows 通常位于 `%APPDATA%/Hustle`；macOS 通常位于 `~/Library/Application Support/Hustle`。以应用内打开的目录为准。没有自动裁剪历史记录。

## 验证与打包

```powershell
npm run desktop:test
npm --prefix desktop run build:web
npm --prefix desktop run test:smoke
node desktop/tests/dashboard.cjs
npm run desktop:win
```

不需要安装器时可运行 `npm --prefix desktop run dist:zip`，解压 `Hustle-0.2.0-win.zip` 后双击其中的 `Hustle.exe`；需要保留解压目录中的所有文件。

在 Apple Silicon Mac 上：

```sh
npm ci
npm --prefix desktop install
npm run desktop:mac
```

产物在 `desktop/release`。Windows 使用 NSIS 安装包，Mac 使用 ARM64 DMG。没有配置开发者证书、Apple 公证或自动更新；本地开发包不等同于已签名的公开发行版本。

`test:smoke` 使用 Playwright 启动真实 Electron，但把数据写入独立 `test-output/profile-*`，不会访问用户真实任务。它检查两窗口、共享番茄、快捷键注册、键盘切换、模拟看板 Cookie 登录、缓存、系统锁屏事件和重启恢复；截图保存在 `test-output`。

设置 `HUSTLE_EXECUTABLE` 为打包后的可执行文件路径，可用同一烟雾测试验证运行包。`HUSTLE_TEST_PROFILE` 是测试专用数据目录覆盖项，正常启动不要设置。

仍需实机人工验收：Mac ARM 通知/快捷键/签名分发，Windows 多显示器/DPI，macOS Spaces/全屏与系统勿扰行为。Windows 系统锁屏事件在自动测试中通过 Electron 事件模拟，测试不会锁定当前电脑。

## 实现边界

主进程：原生窗口、托盘、全局快捷键、计时与本地文件。渲染进程：只有窄范围 IPC API，开启 sandbox 和 contextIsolation、禁止 Node 集成、导航和新窗口，并使用本地 CSP。主进程校验 IPC 来自本地顶层窗口。

原生 API 使用依据：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[全局快捷键](https://www.electronjs.org/docs/latest/api/global-shortcut)、[系统电源事件](https://www.electronjs.org/docs/latest/api/power-monitor)。
