# 理科计算器 · 验证器 — 发布与部署说明

本目录是单文件应用的**发布快照**：`index.html` 即完整应用（离线可用、无外部依赖、无构建步骤）。

- 线上地址：https://xhrm.neocities.org
- 本地源文件：`F:\F\index.html`（改这个，不要直接改快照）
- 快照文件：`F:\F\gitee-pages\index.html`（部署用，必须与源文件一致）

---

## 一、日常发布（推荐，一条命令）

我（助手）每次修改后会依次执行：

```powershell
# 1. 语法检查 + 浏览器实测（略）
# 2. 同步快照
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\sync-snapshot.ps1'
# 3. 发布到 Neocities 并自动验证
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\deploy-neocities.ps1'
```

`deploy-neocities.ps1` 会：

1. 从 **Windows 凭据管理器**读取 API Key（不落盘、不写在脚本里）
2. 调用 `POST https://neocities.org/api/upload` 上传 `index.html`
3. 下载线上文件，比对 **SHA256** 与大小
4. 输出 `uploaded / online / hash match` 三项结果

预期输出：

```
uploaded: 826940 bytes
online: 826940 bytes
hash match: True
```

> 若显示 `no changes, files already up to date` 说明线上已是最新，属正常。

---

## 二、首次配置（换电脑或重置后需要）

### 1. 获取 Neocities API Key

登录 https://neocities.org/dashboard →「设置 / Settings」→ **API Key** → 复制。

### 2. 存入 Windows 凭据管理器（加密保存）

```powershell
cmdkey /generic:neocities-api /user:xhrm /pass:你的API_KEY
```

撤销/更换：

```powershell
cmdkey /delete:neocities-api
```

### 3. 确认脚本可用

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\deploy-neocities.ps1'
```

---

## 三、手动发布（没有脚本时）

1. 打开 https://neocities.org/dashboard
2. 点「上传」
3. 选择 `F:\F\gitee-pages\index.html`，确认覆盖同名文件
4. 打开站点 `Ctrl+F5` 强制刷新验证

---

## 四、发布前检查清单

- [ ] `node --check` 通过（应用脚本分多个 `<script>` 块，需逐块检查）
- [ ] 无头浏览器实测：页面标题、计算、公式库、新工具入口
- [ ] `sync-snapshot.ps1` 执行过（快照 = 源文件，SHA256 一致）
- [ ] 部署脚本输出 `hash match: True`

---

## 五、关于数据与安全

- 所有数据（计算记录、TOTP 账号、设置、自定义公式）保存在**访问者浏览器的 localStorage**，按站点域名隔离，不会上传到服务器
- 云同步功能使用用户自己的 Gitee 私有仓库，数据在本地加密后上传，服务端只见密文
- TOTP / 加密文件依赖 WebCrypto，需通过 **https** 或本地文件打开（局域网 http 不可用）
- API Key 仅存于本机凭据管理器，脚本文件与仓库中均无明文密钥

---

## 六、备选托管

Gitee Pages 曾尝试但账号无实名入口（Pages 页 404），Cloudflare Workers 部署成功但 `workers.dev` 在当前网络被 DNS 污染无法访问。Neocities 为当前可用方案。

Gitee 仓库（`ztyh-wyx1109/20101109` → `calc/index.html`）保留作为代码备份，待账号可实名后可再启用 Pages。

---

## 七、PWA（可安装 / 离线）

发布目录新增：

| 文件 | 作用 |
|---|---|
| `manifest.json` | 应用名称、图标、启动方式（standalone） |
| `sw.js` | Service Worker：导航**网络优先**（部署后立即生效），断网时回退缓存 |
| `icon-192.png` / `icon-512.png` | 安装图标 |

安装条件：通过 **https** 访问，浏览器地址栏出现「安装」图标即可添加到桌面；首次访问后断网也能打开（缓存 `sci-calc-v1`）。

> 修改 `index.html` 后无需手动清缓存：导航请求走网络优先，用户刷新即拿到新版本；离线时用上次缓存。

## 八、冒烟测试

改完代码先跑：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\smoke-test.ps1'
```

覆盖：启动、2+3 计算、数学工具组、高级绘图、公式助手、矩阵行列式、绘图画布、公式列表。全部 PASS 时退出码 0。

---

## 九、安全与隐私说明

本站是**纯静态单文件应用**，可自行核验以下事实（对 `index.html` 直接检索即可）：

| 项目 | 实测值 |
|---|---|
| 外部 `<script src>` | 0 |
| 外链图片 / 样式 | 0 |
| `<form>` 表单 | 0 |
| `document.cookie` 使用 | 0 |
| 联网请求目标 | 仅 3 个：`text.pollinations.ai`（AI 解题）、`open.er-api.com`（在线汇率）、`gitee.com`（可选云同步） |
| 数据存储 | 全部在浏览器 localStorage，不上传 |
| CSP | `default-src 'none'`，脚本/样式仅允许自身与内联，禁止 object/frame/base，事件属性禁用 |
| 加密 | PBKDF2-310000 + AES-256-GCM |

需要说明的边界：

- 本仓库**没有第三方安全审计报告**，也不代表"已通过安全认证"；以上是代码层面的可核验事实。
- 免费静态托管（neocities.org）本身是公共平台，历史上存在被滥用于钓鱼的情况，**平台级**信誉记录可能影响子域名印象；这与其上某个具体静态页面的行为无关。
- 如需与平台信誉彻底隔离，唯一可靠做法是绑定**自有域名**（自定义域名后信誉按新域名独立评估）。

### 完整性校验

发布时可记录首页哈希，便于比对是否被篡改：

```powershell
(Get-FileHash 'F:\F\gitee-pages\index.html' -Algorithm SHA256).Hash
```

---

## 十、安全审计整改记录（2026-10-21）

依据 `F:\F\xhrm\文件安全审计报告.md`，已完成的整改：

| 报告项 | 等级 | 处理 |
|---|---|---|
| 密码无上限、弱口令 | P0 | 上限由 16 位放宽到 **128 位**（下限仍 6 位），界面文案同步为「6–128 位」 |
| 解锁后不自动上锁、密码常驻内存 | P0 | 新增**空闲 5 分钟自动锁定**：清除内存密码、隐藏验证码；加密文件会话恢复为「已加密」状态需重新输入密码；访客场景显示「点击显示」；登录成功自动解除 |
| 加密容器元数据未认证 | P1 | 新容器 `v:2`，把 `username/salt/iv/iterations/savedAt` 作为 **AAD** 参与 GCM 认证；篡改任一字段解密即失败；旧 `v:1` 文件仍可正常解密 |
| 「备份账号」一键明文导出 TOTP | P1 | **已修复**：改为密码加密导出（AES-GCM），导入时自动识别并提示输入备份密码 |
| 普通保存克隆残留账号按钮提示 | P1 | 克隆时移除 `#accountBtn` 的 title/aria-label |
| 同名账号静默覆盖 | P1 | 检测到同名不同密码时弹窗确认 |
| 宣传语与实际边界不符 | P0 | 「关于」面板补充：加密只保护**导出文件**，本机存储不加密；README 同步说明 |

未处理（需平台或额外条件）：

- **文件签名/完整性校验**：需要签名基础设施，暂以 SHA-256 发布哈希替代。
- **Gitee token 出现在 URL 查询串**：Gitee API 仅接受 `access_token` 查询参数；改请求头会触发 CORS 预检且其 `Access-Control-Allow-Headers` 为空，实测不可用。
- **托管层 CSP 限制**：Neocities 响应头下发 `connect-src 'self' data: blob:`、`worker-src blob:`，与页面 meta CSP 取交集后：**线上禁止外部联网（AI 解题、在线汇率、云同步）且禁止 Service Worker**。应用已改为在失败时提示"当前托管环境禁止联网"。彻底解决需迁移到可自定义响应头的托管。

### 验证

- 语法检查：9 个脚本块全部通过
- 冒烟测试：8 项全 PASS（`F:\F\smoke-test.ps1`）
- 加密实测：v2 往返成功、篡改 `username`/`savedAt` 均被拒绝
- 锁定实测：`__lockNow()` 后密码清空、验证码区显示"已自动锁定"、解锁后恢复

### 复核整改（依据《整改验证报告》D1–D11）

| 编号 | 问题 | 处理 |
|---|---|---|
| D1 | 锁定后 `loginUser` 不能解锁 | 登录成功分支（两条路径）清 `__pwLocked` 并重渲染 |
| D2 | 加密文件不会真正重锁 | 解锁时保存密文 `__encryptedBlob`，锁定恢复 `pendingEncryptedData`、`isUnlocked=false`、清空账号数组 |
| D3 | 访客不触发锁定 | 以"是否有敏感数据"为条件；访客锁定显示「点击显示」按钮 |
| D4 | 同名检测误报"密码不同" | 改为中性提示"本机已有同名账号，是否覆盖登录密码" |
| D5 | 界面仍写 6-16 位 | 三处改为「6–128 位」 |
| D6 | P1-6 仅确认框 | 状态改为"已缓解"，不再称"已修复" |
| D7 | 发布哈希未真正发布 | 部署时自动生成并上传 `integrity.txt`，「关于」面板添加链接 |
| D8 | 冒烟测试不含安全项 | 新增 `security-test.ps1`（CDP 驱动，AAD 4 项 + 锁定 9 项） |
| D9 | README 描述失真 | 已按实际行为改写自动锁定说明 |
| D10 | API Key 出现在命令行 | 改为 `curl -K -` 从标准输入读取配置 |
| D11 | 摘要数量不一致 | 报告已统一为"11 项"口径 |

| 本机数据清除 | 「关于」面板新增「清除本机数据」按钮：二次确认后清空本站点全部 localStorage 并刷新 |
| 密码边界 | 导出/导入加密备份均要求 ≥6 位密码；弱口令直接拒绝 |

### 稳定性与安全性增强（第三轮：按需密码 + 全局错误可见）

| 项目 | 改动 | 验证 |
|---|---|---|
| 按需密码 | 设置新增「每次加密保存后清除内存密码」：开启后保存结束后立即清空内存密码，下次保存时弹窗验证；默认关闭，不影响原有体验 | ASK-1/2 PASS |
| 全局拒绝可见 | `unhandledrejection` 捕获后台 Promise 失败，写入顶部错误横幅，避免"静默失败" | STAB-1 PASS |
| 设置持久化 | 开关状态写入本机存储，重启后保持 | STAB-2/3 PASS |

> 说明：无服务端时，"记住设备"只能把等价于密码的凭据存到本机，安全性不优于现有方案，故未实现；改为"按需密码"这一可验证的替代。

---

## 十一、发布签名与完整性自校验（Ed25519）

**机制**

1. 部署时 `sign-integrity.js` 用私钥对 `index.html` 字节签名，生成 `integrity.txt`（含 SHA-256、签名、公钥、时间）。
2. 页面内置公钥，启动时（仅 http/https）拉取自身源码与 `integrity.txt`，用 WebCrypto 验证 Ed25519 签名。
3. 「关于」面板显示校验状态，另有「校验完整性」按钮可手动复验。

**密钥位置**

- 私钥：`F:\.keys\ed25519-private.pem`（**不要上传、不要外传**；丢失将无法再签名，需更换公钥并重新发布）
- 公钥：`F:\.keys\ed25519-public.pem`，对应页面内置值 `RLGPRC6Pa9F/3ljPi3PuY0OustbrtQGrq64wgs4XDgY=`

**验证结果**

| 用例 | 结果 |
|---|---|
| 未修改页面（本地 CDP） | `ok:true` |
| 篡改一个字节后 | `ok:false`，提示"签名不匹配（文件可能被修改）" |
| 线上文件 + 线上 integrity.txt（Node 独立验签） | `signature_ok=true`、`sha_matches=true` |

**局限**：签名只能证明"文件与此私钥签发的版本一致"，无法阻止攻击者连同页面内置公钥一起替换；彻底防御需从可信渠道核对公钥指纹。

---

## 十二、会话密钥（v3 文件格式）

**目标**：登录后内存中不再保留明文密码，改用**不可导出的 CryptoKey**。

**机制**

1. 登录/注册/解锁时：`PBKDF2(password, 账号盐, 310000)` → 派生 32 字节 → 导入为**不可导出 HKDF 密钥**（`sessionKey`），随后清空 `currentPassword`。
2. 保存/同步：用 `HKDF(sessionKey, 文件随机盐, info="sci-file-v3")` 派生**一次性文件密钥**（AES-256-GCM），加密后丢弃。
3. 文件容器 `v:3` 额外保存 `accountSalt`，因此**只凭密码 + 文件**即可在别的设备解密：
   `PBKDF2(密码, accountSalt) → HKDF(文件盐) → AES-GCM`。
4. 元数据 `{v, username, accountSalt, salt, iv, iterations, savedAt}` 作为 **AAD** 参与认证，任一字段被改即解密失败。
5. 旧 `v:2` / `v:1` 文件仍可解密（兼容路径），但新保存一律为 `v:3`。

**已知取舍**：`deriveBits` 会短暂产生 32 字节原始密钥，导入为 CryptoKey 后立即 `fill(0)` 清零；密码本身不再驻留内存。

**验证**

| 用例 | 结果 |
|---|---|
| 注册后 `sessionKey` 已建立 | PASS |
| 注册后内存中无明文密码 | PASS |
| 新容器为 v3 且含 accountSalt | PASS |
| 仅凭密码可解密 v3 文件 | PASS |
| 篡改 accountSalt 被拒绝 | PASS |
| v2 旧格式仍可加解密 | PASS |

### 第四轮：可配置自动锁定

- 设置新增「自动锁定」：5 / 15 / 30 / 60 分钟 / 不自动锁定，写入 `sci-lock-min-v1`
- 锁定时长在 `idleMs()` 中读取；设为「不自动锁定」时不再创建计时器
- 同时修复：未处理 Promise 拒绝横幅此前仅在横幅为空时写入，现改为总是显示最新错误

---

## 十三、Netlify 主站（2026-10-21 迁移）

**新地址**：https://xhrm-calc.netlify.app
**旧地址**：https://xhrm.neocities.org（已改为自动跳转页）

**为什么迁移**：Neocities 响应头强制 `connect-src 'self'` 与 `worker-src blob:`，导致线上 AI 解题、在线汇率、云同步与 Service Worker 全部被浏览器拦截。Netlify 不发送 CSP 响应头，页面 meta 策略单独生效。

**部署**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\deploy-netlify.ps1'
```

流程：读取凭据管理器中的 `netlify-token` → 查找/创建站点 `xhrm-calc` → 关闭站点保护（否则 401）→ 打包上传 → 轮询到 `ready` → 下载比对 SHA-256。

**实测结果**

| 项目 | 结果 |
|---|---|
| 线上大小 / 哈希 | 844,879 字节，与本地一致 |
| 响应头 CSP | 无（meta 单独生效） |
| Service Worker | 注册成功（1 个） |
| 外部联网（汇率 API） | HTTP 200 |
| 签名校验 | `ok:true` |

**旧站跳转**：`deploy-neocities.ps1` 现在上传 `redirect.html`（meta refresh + 手动链接），验证哈希 1,030 字节一致。

**回滚**：若需恢复 Neocities 旧版，把 `deploy-neocities.ps1` 的 `$idx` 改回 `index.html` 并重新运行即可。

---

## 十四、唯一通路（2026-10-21 收敛）

**现行唯一部署路径：Netlify**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\deploy-netlify.ps1'
```

| 项目 | 状态 |
|---|---|
| 部署脚本 | 仅保留 `deploy-netlify.ps1` |
| 凭据 | 仅保留 `netlify-token`（Windows 凭据管理器） |
| 站点 | https://xhrm-calc.netlify.app |
| 二维码 | 已指向 Netlify |
| Neocities | 已移除部署脚本与 API 凭据；其余资源（manifest/sw/图标/integrity）已删除，仅剩 1,030 字节跳转页 |

> Neocities API 不允许删除 `index.html`（站点至少需要一个首页），也无法通过 API 删除整个站点。若要彻底注销该站，需在 Dashboard → Settings → 危险区 手动删除，或把 `index.html` 换成任意占位页。

**迁移后不再维护的项**

- `F:\F\deploy-neocities.ps1`（已删除）
- 凭据 `neocities-api`（已删除）

**旧站最终状态**：`https://xhrm.neocities.org/` 已替换为 514 字节的停用页（无跳转、无应用、无资源），仅保留"本站已停用。"一行。

### 第五轮：默认简易版（性能优先）

- `<html data-mode="lite">` 成为静态默认值，首屏即简易版，不启动背景流星动画
- 模式存储键升级为 `sci-calc-mode-v2`，旧版 `full` 偏好不再沿用（旧键仍保留在用户设备上，不影响数据）
- 简易版下：背景动画隐藏、`backdrop-filter` 关闭、卡片阴影/动画取消
- 顶部 ✨ 按钮可随时切回完整版，选择会持久化

实测（无头浏览器，390×844）：

| 场景 | 结果 |
|---|---|
| 首次进入 | `lite`，背景画布 `display:none` |
| 点 ✨ 切换 | `full`，写入 `sci-calc-mode-v2=full` |
| 刷新 | 保持 `full` |
| 清空存储后刷新 | 回到 `lite` |

---

## 十五、Netlify 核查整改（2026-10-21 第二轮）

| 编号 | 问题 | 处理 | 验证 |
|---|---|---|---|
| N1 | 线上 `integrity.txt` 过期，页面显示校验失败 | 部署脚本改为**先签名再打包**，并加门禁：`integrity.txt` 的 SHA256 必须等于 `index.html`，否则拒绝部署 | 线上 `signature_ok=true`、`sha_matches=true`；门禁已实际拦截过一次不一致 |
| N3 | 登录后云同步不可用（只认 `currentPassword`） | 前置检查改为 `__hasSecret()`；新增 `decryptAny()`：v3 用会话密钥解密，旧格式回退密码 | `V3-9 decryptAny(session) PASS` |
| N4 | `__fileSession`/`__encryptedBlob` 残留导致切号后被“锁回旧文件” | 登录、注册、登出均清除这两个标记 | 代码审查 |
| N5 | 缺少防点击劫持等响应头 | 新增 `_headers`：`frame-ancestors 'none'`、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy`、`Permissions-Policy` | 线上响应头已生效 |
| N7 | TOTP 备份密码没有弱口令校验 | 套用 25 个常见口令黑名单 | 代码审查 |
| N9 | 私钥未加密且 ACL 允许 Everyone | 私钥移到 `C:\Users\28944\.keys\`（NTFS），ACL 收紧为仅当前用户可读；F: 上的副本已删除 | `icacls` 已确认 |
| N10 | README 与线上不符 | 更正签名、弱口令、Neocities 描述；版本号升到 **v3.1.0** | 线上含 `版本 v3.1.0` |

**仍未处理**

- **N2（高）**：`verifier` 仍是 PBKDF2 原始输出，可当 v3 文件密钥的种子使用。需引入 `verifier = SHA-256("sci-verify-v1"||ikm)` + `sessionKey = HKDF(ikm, "sci-session-v1")`，并迁移到 v4 容器（旧 v3 保留密码解密路径）。改动涉及登录、注册、改密、文件格式，需单独一轮并配迁移测试。
- **N6（低中）**：同名账号检测仍用新盐比较，同密码也会弹确认。需改为用旧盐派生后比较。
- **N8（中低）**：签名只覆盖 `index.html`，未覆盖 `sw.js`/`manifest.json`。
- **N11**：AI/汇率需在可访问对应域的网络复测。

---

## 十六、N2 修复：验证值与密钥分离（v3.2.0）

**问题**：`verifier` 曾是 `PBKDF2(密码, 账号盐)` 的原始输出，而会话密钥直接由它派生；拿到 localStorage 的人可用它解开 v3/v4 文件。

**修复**：验证值改用**加标签的 KDF**，与会话密钥的派生输入不同：

```
verifier   = PBKDF2(password + "\u0001sci-verify", 账号盐, 310000)   // 只存这个
sessionKey = HKDF(PBKDF2(password, 账号盐))                          // 只在内存
fileKey    = HKDF(sessionKey, 文件盐, "sci-file-v4")                 // 每次新盐
```

- 新注册、改密、文件解锁生成的账号一律写新格式；
- 登录时先按新格式校验，失败再用旧格式校验一次，成功后**自动升级**存储的 `verifier`；
- 文件格式升级为 **v4**（`accountSalt` + AAD），v1/v2/v3 旧文件仍可用密码解密；旧版云端 v3 备份会提示输入密码。

**验证**

| 用例 | 结果 |
|---|---|
| 新容器为 v4 且带 accountSalt | PASS |
| 仅凭密码解密 v4 | PASS |
| 篡改 accountSalt 被拒绝 | PASS |
| 会话密钥解密（decryptAny） | PASS |
| 存储的 verifier ≠ 原始 IKM | PASS |
| 旧格式 verifier 登录并自动升级 | PASS |
| v2 旧格式仍可加解密 | PASS |

---

## 十七、N6 / N8 修复（v3.3.0）

**N6 同名误报**：`loginWithFile` 不再用“新盐派生的 verifier”比较，而是用**旧账号的盐**重新派生后比较（新格式优先，旧格式回退）。只有密码真的不同才弹确认。

| 用例 | 结果 |
|---|---|
| 同密码解锁同名文件 | **不弹**确认 |
| 不同密码解锁同名文件 | 弹确认 |

**N8 签名覆盖 Service Worker**：`integrity.txt` 新增 `SW256` 与 `MANIFEST256`；注册 Service Worker 前先取 `sw.js` 计算 SHA-256 并与 `SW256` 比对，不一致则**跳过注册**，避免被替换的 SW 接管缓存。

| 用例 | 结果 |
|---|---|
| 线上 SW256 与实际 sw.js | 一致 |
| 注册前哈希校验 | 通过后注册（`sw:1`） |

---

## 十八、跨设备云同步与 SW 的可信锚点（v3.3.1）

**问题**

1. 云同步改用会话密钥后，**另一台设备**（账号盐不同）用会话密钥解不开备份——跨设备恢复会失败。
2. Service Worker 只靠同源的 `integrity.txt` 做哈希比对；托管被攻破时可同时替换 `sw.js` 与 `integrity.txt`，锚点跟被保护对象同源。
3. 云端备份可被**回滚**到旧版本（旧密文仍能正常解密），没有本地单调性检查。

**改动**

| 项目 | 改动 |
|---|---|
| 跨设备解密 | `decryptAny()` 判断 `blob.accountSalt === 当前账号盐`：相同走会话密钥（免密码），不同自动回退到密码路径（必要时提示输入） |
| 防回滚 | 拉取时比较云端 `updatedAt` 与本机 `sci-sync-last-v1`，更旧则弹确认 |
| SW TOFU 锚点 | 首次校验通过的 `sw.js` 哈希写入 `sci-sw-pin-v1`；之后哈希变化则**拒绝注册** |
| 公钥 TOFU 锚点 | 首次校验通过的发布公钥写入 `sci-pk-pin-v1`；之后公钥变化则完整性检查判为失败（"公钥与首次校验记录不一致"） |

**验证**

| 用例 | 结果 |
|---|---|
| 设备 A 的 v4 备份在设备 B（不同盐）解密 | PASS |
| 公钥首次校验后写入 `sci-pk-pin-v1` | PASS |
| 篡改 pin 后校验判为失败 | PASS |
| 首次加载后写入 `sci-sw-pin-v1` | PASS |
| 线上签名 | `signature_ok=true`、`sha_matches=true` |

**边界**：TOFU 锚点只能防"之后被替换"，**首次访问**仍依赖分发渠道（本次对话给出的哈希/指纹）。要彻底消除首次信任问题，需要公钥从独立渠道（如纸质记录、独立仓库）核对。

---

## 十九、SW 锚点补全 + 云同步设备列表（v3.3.2）

### SW 锚点原来只完成一半

之前 `integrity.txt` 里的 `SW256` 只是**明文一行**，签名只覆盖 `index.html`。攻击者控制托管时可以：改 `sw.js` → 把 `integrity.txt` 的 `SW256` 改成新哈希 → 页面签名仍然验证通过。锚点等于没锁。

**补全**：签名对象改为整个发布包：

```
sci-pkg-v1
<SHA256(index.html)>
<SHA256(sw.js)>
<SHA256(manifest.json)>
```

`integrity.txt` 新增 `SIGFORMAT = pkg-v1`；页面校验时同时取 `index.html`、`sw.js`、`manifest.json` 计算哈希，拼成同样字符串再验签。旧格式（无 `SIGFORMAT`）仍按签名 `index.html` 字节验证。

**实测**：只修改 `sw.js`（不动其他文件）→ 校验立即失败：

```json
{"ok":false,"reason":"签名不匹配（文件可能被修改）"}
```

### 云同步设备列表

- 每台设备生成稳定 ID（`sci-device-id-v1`）与平台名（Android / iOS / Windows / macOS / Linux）
- 上传时把设备列表写入加密负载的 `devices` 字段；下载时合并双方记录
- 「账号 → ☁ 云同步」面板显示：

```
设备与最近同步
本机 · Android      2026/10/22 12:34
Windows             2026/10/21 22:10
```

- 空状态显示「还没有同步记录」

**实测**：空状态与有数据状态均正确渲染。

### 设备列表：移除按钮（v3.3.3）

每行设备右侧新增「×」按钮，点击后二次确认「只从本机列表删除，不会删除云端数据」，确认后从 `sci-sync-devices-v1` 移除并立即刷新列表。

实测：预置 2 台设备 → 点 Windows 行的「×」→ 列表变为 1 行，Windows 消失。

---

## 二十、N12 / N14 修复（v3.3.4）

### N12 跨设备云同步仍失败

**根因（两层）**

1. `registerUser` / `loginUser` 把会话密钥派生当作"后台任务"发出去就返回，调用方（同步）可能在 `sessionKey` 就绪前执行前置检查。
2. `decryptAny()` 只处理了「`blob.accountSalt === 本机盐`」的 v4 分支；跨设备时两者必然不同，于是落到旧分支并抛「请先登录账号」——**这正是跨设备恢复失败的直接原因**。

**修复**

- 登录/注册返回前等待 `__sessionReady`（会话密钥派生完成）。
- `decryptAny()` 重写：
  - v4 且盐相同 → 会话密钥解密（失败再回退密码）
  - v4 且盐不同 → 直接走密码路径（弹窗输入）
  - v3 → 提示输入密码
  - v1/v2 → 密码路径

**端到端验证**（真实 Gitee 私有仓库，非 mock）

```
设备 A：注册 → 写入 TOTP 账号 MARKER-DEV-A → 上传
设备 B：全新 profile → 同账号注册 → 从云端恢复
结果：已恢复 2026/10/22 13:02:25 ｜ accounts = ["MARKER-DEV-A"]
```

测试文件 `sci-sync/__devtest.json` 已从仓库删除。

### N14 SW 注册 fail-open

**根因**：注册流程在「缺少 SW256 / 无 crypto.subtle / 读 pin 异常」时都会 `reg()`，等于校验不过也注册；且 `SW256` 行本身不受签名保护。

**修复**

1. 签名覆盖整个发布包（`SIGFORMAT=pkg-v1`），`SW256`/`MANIFEST256` 由签名保护。
2. 注册前置条件改为**先通过发布包签名校验**（`__verifyIntegrity`），失败即不注册；缺失/异常同样不注册（fail-closed）。

**验证**

| 场景 | 结果 |
|---|---|
| 正常站点 | 注册 1 个 SW，写入 pin |
| 篡改 `sw.js` 的副本 | **注册 0 个**（拒绝） |
| 签名锚点 SIG-1~4 | 全 PASS |

---

## 二十一、迁移到 GitHub Pages（2026-10-22）

**新地址**：https://xhrm-wyx.github.io/xhrm-calc/  
**仓库**：https://github.com/xhrm-wyx/xhrm-calc（公开）

**原因**：Netlify 免费额度触发 `new deploys are blocked until credits are added`，且需绑定支付方式；GitHub Pages 无 CSP 响应头，SW 与外部联网均可用，且无部署额度限制。

**部署方式（git push）**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'F:\F\deploy-github.ps1'
```

流程：签名 + 门禁 → 复制到工作仓库 `F:\F\_gh_push` → `git push`（token 通过 `GIT_CONFIG_*` 环境变量注入，不进命令行）→ 等待 Pages 构建 → 下载比对 SHA-256（`curl --compressed` 解压后比对）。

**实测**

| 项目 | 结果 |
|---|---|
| 线上大小 / 哈希 | 859,661 字节，与本地一致 |
| 响应头 CSP | 无（仅 `Cache-Control: max-age=600`） |
| Service Worker | 注册成功，scope `https://xhrm-wyx.github.io/xhrm-calc/` |
| 签名校验 | `ok:true` |
| 外部联网（汇率 API） | HTTP 200 |
| 启动错误 | 无 |

**旧站**：`xhrm.neocities.org` 已改为 678 字节跳转页，指向新地址；二维码已重新生成（`F:\F\qrcode.png` + 桌面 + 图片文件夹）。

**注意**：GitHub Pages 对 `api.github.com` 的 Contents 上传在本网络会被重置（`Recv failure: Connection was reset`），因此改用 git push；这是网络环境限制，不是代码问题。
