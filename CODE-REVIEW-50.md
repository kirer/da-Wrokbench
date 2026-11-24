# 研发工作台 50 轮代码审查报告

> 范围：`index.js`（宿主 BFF）、`client.js`（右栏/页面）、`server/src/*`（Rust 服务端）、`deploy/dsh-uat/*`（UAT 脚本）。
> 方法：分 5 个视角共 50 轮逐函数阅读，每条结论都对源码行复核过；标注 CONFIRMED 的均可由代码路径直接推出，PLAUSIBLE 的依赖宿主行为或数据顺序。
> 本文只做审查，**未修改任何代码**。

## 总览

| 级别 | 条数 | 说明 |
| --- | --- | --- |
| P0 安全 / 数据完整性 | 15 | 越权读写本机文件、身份混淆、可被强制通过的评审 |
| P1 正确性 | 35 | 功能失效、状态机漏洞、静默截断、部署脚本直接报错 |
| P2 性能 | 7 | 全量快照读写、轮询放大、无退避 |
| P3 体验 / 可维护性 | 17 | 口径不一致、重复实现、约 700 行死代码 |

合计 74 条；其中 CONFIRMED 61 条、PLAUSIBLE 13 条。

---

## P0 安全与数据完整性

1. **`add_artifact` 对 prototype / test-report 完全没有权限校验**（`server/src/domain.rs:3057-3090`）。任何登录用户都能以 `kind=prototype` 上传；而宿主 `mirrorPrototypesForUser` 会把 prototype 附件写进**每个人的本机**原型目录（`index.js:2168-2208`）→ 任意账号可覆盖他人的原型文件。test-report 同理可伪造测试证据。修：prototype 限产品/负责人，test-report 限测试/负责人。

2. **`mirrorPrototypesForUser` 会跟随最后一级符号链接**（`index.js:2183-2204`）。目录段做了 `assertNoSymlinkBetween`，但 `target` 本身若是指向 `~/.zshrc` 的链接，`fs.writeFileSync` 会跟随写入。修：写入前 `lstatSync(target)`，是链接就跳过。

3. **`/requirement-file` 不套 `CODE_BROWSER_SKIP`**（`index.js:1208-1219`，跳过表在 `1945`）。开发右栏能列出并**明文读取**仓库里的 `.env`、`.git/config`、`*.pem`、`.git-credentials`（200 KB 内全文返回）。修：目录列表与单文件读取两侧共用同一拒绝规则（dotfile + 密钥类扩展名）。

4. **预览票据不随登出/换账号清理**（`client.js:2698-2712`、`9235`；宿主 `index.js:1102-1132`）。A 登出、B 在 120 秒内登录同一台机器，`designPreviewUrl` 仍拼 A 的票据，宿主按 `previewTicket.userId` 解析 **A 的 baseDir** → B 看到 A 本机需求目录里的文件。修：`resetDataCaches` 清 `previewTickets`；客户端记录 `ticketUserId` 并校验。

5. **远端可访问的 `/auth/config` 会带出 mock 用户名单**（`index.js:1022-1025`、`withoutLocalPaths` 在 `537-551`）。反代/容器场景下远端能枚举全部账号 id、姓名、角色。修：`withoutLocalPaths` 里删掉 `mock`。

6. **`/sessions/claim` 接受任意未被认领的会话 ID**（`index.js:1250-1262`）。知道别人的 DSH sessionId 就能把会话认到自己名下，后续该会话的工具调用以自己身份执行。修：要求会话在 DSH 里真实存在且带工作台记录。

7. **顶层 catch 原样返回内部错误信息**（`index.js:1619-1622`）。`fs`/`path` 抛出的错误带本机绝对路径，直接回给浏览器。修：非 `httpError` 统一 500 + 通用文案，细节只进日志。

8. **`isLoopbackRequest` 在 `remoteAddress` 缺失时 fail-open**（`index.js:838-845`）。正常 Node 一定有该字段，但 Unix socket / 某些代理场景下会把远端当本机，直接放开全部本机路径接口。修：缺失按非回环处理。

9. **`assertSameOrigin` 对 `Origin: null` 放行**（`index.js:735-755`）。桌面端兼容路径同时放行任何不发 `Sec-Fetch-Site` 的非浏览器客户端。修：`Origin` 为 `null` 时额外要求桌面特征（无 Referer + 无 `Sec-Fetch-*`）。

10. **JWT 没有 `jti`、没有吊销表**（`api.rs:268-289`、`index.js:1048-1053`）。退出登录只清 Cookie/localStorage，token 在 TTL 内（默认 7 天、上限 30 天）仍然可用；被复制的 token 无法作废。修：加 `jti` + 吊销集合，或把 TTL 降到小时级并引入 refresh。

11. **服务端没有任何速率限制**（`api.rs` 全文件）。`/auth/mock`、`/auth/dingtalk/exchange`、`/webhooks/gitlab` 都可无限次打；钉钉授权码可重放、mock 可枚举。修：按 IP + 路由的令牌桶，登录类单独更严。

12. **`get_artifact` 只要求登录，不校验需求可见性**（`api.rs:931-939`）。artifact id 一旦出现在截图/日志里，任何账号都能读正文（设计稿、测试报告可能含内部数据）。修：按需求参与人过滤，至少记审计。

13. **`update_requirement_document` 缺 owner 校验**（`domain.rs:2911-2922`）。只校验 `can_product() || can_plan()`，任意产品可以改别人负责的需求文档。修：`owner_id == actor.id || can_plan()`。

14. **`set_reviewers` 允许移除已驳回的会签人**（`domain.rs:1130-1206`）。负责人在评审中途把投了 reject 的人移出列表，`clean.iter().all(approved)` 随即把需求翻成已通过，驳回意见被静默丢弃。修：本版本已产生 rejected 时禁止缩减会签人。

15. **`deploy/dsh-uat/bootstrap-fresh.mjs:33-35` 把 8 个账号的 JWT 明文写进 `/tmp/wb-uat-tokens.json`**，未设 0600。同机其他用户可读。修：写到 `UAT_ROOT` 并 chmod 600。

---

## P1 正确性

### 数据与状态机

16. **`Number("d2") === NaN`，最新设计版本过滤形同虚设**（`client.js:6809-6815`）。服务端下发 `designVersion: "d2"`（`domain.rs:1492`），`currentDesignArtifacts` 恒为空 → 设计卡回落成「所有版本的前 3 个文件」，可能展示过期旧版本，`designPreviewable` 计数也含旧版本。修：去掉 `d` 前缀再转数字。

17. **GitLab 同步在请求路径内，超过全局 30s 超时**（`api.rs:971-1186`）。`dev_start`/`dev_finish` 先提交状态再同步调 GitLab（connect 5s + 总 20s，失败还会再查一次 MR），慢时客户端拿 504，但需求已经是 `dev_done` 且没有 MR 链接；重试会因「已完成」被拒。修：GitLab 调用改后台任务 + `pending/failed` 状态。

18. **SQLite 后端 Webhook 去重永远失效**（`db.rs:348`、`api.rs:2016-2034`）。`load_snapshot` 返回 `events: Vec::new()`，而去重正是查 `snapshot.events`；GitLab 重投会重复写事件。修：delivery id 落到独立表并加 UNIQUE。

19. **`refreshLocal` 原地替换所有键，跨 await 的 `localState` 引用失效**（`index.js:187-196`，使用点 `1372-1385`、`1501-1546`）。另一个 DSH 进程改了 local.json 后，本进程里 await 之前取到的 `localState` 指向被摘掉的旧对象，会话绑定写入丢失。修：await 之后重新取 `localUser(local, userId)`，或按用户浅合并。

20. **`normalizeLocal` 不校验 `topLevelFolder` 类型**（`index.js:137-160`、`213-220`）。local.json 里写成对象/数组时 `path.resolve` 抛 TypeError，之后每个请求都 500。修：非字符串一律置 null。

21. **`syncOwnPrototypes` 不跳过 frozen/released**（`index.js:2063-2087`，对照 `syncOwnTestReports` 已跳过）。已冻结需求每次 `/state` 都重试注定 409 的上传。修：同样跳过终态。

22. **超大/失败的原型文件永不写水位**（`index.js:2074-2077`）。3 秒轮询下反复读盘 + 反复失败上传。修：失败也写水位（带失败次数上限）。

23. **`archive_session` 的主会话回落到非需求会话**（`domain.rs:830-871`）。归档主会话后 `primary_session_id` 取「第一个未归档会话」，可能是 dev/design/test，客户端按它打开右栏会落到错误类型。修：优先 `kind == "requirement"`。

24. **设计会话里需求面板仍挂可写画布**（`client.js:9137-9155`）。`hasPrototype` 分支排在 `isDesignSession` 之前，「同一会话只能有一个画布目标」的保护只在没有原型时生效 → 两个 `DesignStudioCanvas` 抢同一个 target，互相顶掉。修：把 `isDesignSession` 判断提前。

25. **`designerCanEdit` 与服务端 `can_design()` 口径不一致**（`client.js:9472-9474`）。服务端 = 设计角色或 `can_plan()`；客户端要求 `currentUser.id === designerId`。负责人/管理员被挡成只读；设计会话已建但尚未 `/design-claim` 时，真设计师也只能看只读且没有认领入口。

26. **`resetDataCaches` 后 `poll:false` 的订阅永久 loading**（`client.js:2788-2808`）。换账号后 store 被清空，但非轮询分支只在挂载时取数，`RequirementGreeting` 等组件一直拿不到需求。

27. **自动开右栏的 key 在定时器触发前就写入**（`client.js:3181-3189`）。任何一次 effect 重跑（含 StrictMode 双调用）都会 `clearTimeout` 但保留 key → 该会话永远不再自动带出开发/测试面板。

28. **`explicitlyOpenedTabs` 被导航类调用写入**（`client.js:3112-3118`）。从首页/列表进开发会话也会写，之后该会话的开发面板永久不再自动弹出。

29. **`loadDir` / `openEntry` 无请求序号**（`client.js:8752-8791`）。快速切换目录时后发先至的旧响应会覆盖新目录；文件与目录请求还会互相清场，出现「新目录里显示旧文件」。

30. **`openUrlInDshBrowser` 三个问题**（`client.js:8722-8735`）：轮询 20 次耗尽后静默放弃，而调用方已 `preventDefault` → 死链接；连点 N 次起 N 条轮询链，最后开出 N 个相同 tab；定时器不随页面离开清理，几秒后凭空弹 tab。

31. **验收勾选按下标持久化**（`client.js:8941-8949`）。产品在验收标准顶部插入一条后，已勾状态整体下移一位，勾打在错误条目上；删除条目后越界旧值仍留在 localStorage。

32. **只读标记与预览票据跨账号残留**（`client.js:2698-2712`）。`readonlyPreviewKeys` 是模块级 Set，`resetDataCaches` 不清；B 登录后打开同一会话的需求 tab 仍是只读，看到「改为可编辑」。

### 页面口径

33. **`requirementsProgress` 分母含 `inScope === false`**（`client.js:6129-6133`）。10 条里 5 条已发布、5 条暂缓 → 进度 50%，永远到不了 100%。

34. **「我参与 N 个」漏算 `devTasks.assigneeId`**（`client.js:6266-6271` 对照筛选 `6244-6248`）。纯开发身份页头显示「我参与 0 个」，点进去却有多条。

35. **「本月封板」按 `endDate` 判月份**（`client.js:6200-6203`、`6273-6275`）。提前/延后封板都会算错月份。修：服务端补 `closedAt`。

36. **设计屏数与测试证据数不去重**（`client.js:6760`、`7140`、`8534-8546`）。同一屏每次同步追加一条同名附件 → 1 屏显示成 3 屏。`RequirementBrief` 已用 Set 去重，别处没复用。

37. **`iterationRisk.count` 是各分类相加**（`client.js:6154-6166`）。一条需求测试失败 + 设计未交付 + 设计更新 → 风险 +3；新建未排期需求让每个迭代都「有风险」。

38. **需求页「打开」在只有设计会话时把需求 tab 开进设计会话**（`client.js:6740-6752`）。`RequirementTab` 落到只读/占位分支，用户以为原型丢了。

39. **两套「打开设计」入口策略不一致**（`client.js:6433`、`6729-6752`）。迭代卡片走 `openSessionFor`（可写画布），需求页设计卡走 `openPanel`（只读预览），且选会话时只有后者优先 `own`。

40. **选会话未排除已归档会话**（`client.js:6730`、`7487`）。归档旧设计会话后点「打开」仍进入归档会话。

41. **设计交付静默截断到 30 个文件**（`index.js:1975`）。服务端记录的是全量列表 → 服务端 40 屏、本机 30 屏，且没有任何提示。

42. **测试证据每轮追加同名附件**（`index.js:2157-2160`、`client.js:8961-8971`）。右栏并列 N 个「TEST-REPORT.html · 1.7 MB」，无法分辨哪个最新。

### 校验与审计

43. **迭代名/阶段、平台名/简称、发布版本号都没有长度与控制字符校验**（`domain.rs:322-475`、`2330-2400`、`2184-2249`）。需求标题限 200 字，这里可塞满 8 MB 请求体。

44. **平台组/平台的 create/update/archive 不写审计事件**（`domain.rs:2250-2488`）。只有 group create 有事件，平台配置变更无痕迹。

45. **`admin_update_user` 不校验 `platforms` 里的 id 是否存在**（`api.rs:1669-1738`）。写错平台 id 静默存进用户档案。

46. **`archive_iteration` 的 busy 检查不含 creating/create_failed**（`domain.rs:493-550`）。归档后这些需求连同本机会话变成孤儿。

47. **`dev_reopen` 不清 `test_runs`**（`domain.rs:1880-1929`）。从 test_passed 重开后测试右栏「最新一轮」仍显示旧的通过记录。

48. **评审通知里的「还有 N 位会签人待确认」会偏少**（`domain.rs:975-1129`）。`approved_count` 统计了不在会签人列表里的管理员票。

### 部署脚本

49. **`deploy/dsh-uat/setup-sessions.mjs` 用了 `fs` 但没 import**（`1-2` 行只导入了 `path`/`fileURLToPath`）。已实测：ESM 下 `fs` 不是全局，脚本跑到最后必然 `ReferenceError: fs is not defined`，且是在建完全部会话之后才炸，留下半套映射。修：补 `import fs from 'node:fs'`。

50. **`deploy/dsh-uat/bootstrap-fresh.mjs` 断言非幂等**（`36-38`）。硬要求 `iterations.length === 0`，重跑或已有迭代时永远失败。

---

## P2 性能

51. **一次 `/state` = 5–6 次全量快照反序列化**（`api.rs:82-96`、`189-256`、`564-600`）。内部令牌请求先 `find_user` 读一次，handler 再读一次，`get_state` 另外 4 次（notifications_for / unread / notification_groups×2）。当前库 5 MB，3 秒轮询。

52. **每次 `mutate` 重写全部 `artifact_contents`**（`db.rs:314-400`）。附件上限 50 MB/需求后，改一个字段要 UPSERT 全部附件正文。

53. **SQLite 后端全局 `Mutex` + 读全量 + 事务写**（`db.rs:299-400`、`api.rs:97-116`）。10 人团队 × 3s `/state` + 每个右栏 2.5s 轮询 ≈ 20 req/s 全量快照，并发下容易撞 30s 超时。

54. **`requirementStores` 只增不减**（`client.js:2731-2741`）。长期运行后 Map 里保留所有需求的大对象和 interval。

55. **需求轮询无退避无抖动**（`client.js:2761-2772`）。服务端 500/断网时每个 store 每 2.5 秒重试。

56. **迭代列表每次 3 秒轮询全量重算**（`client.js:6238-6271`）。`iterationRequirements` 每迭代一次 filter，Kpis 再七次 reduce，无 memo。

57. **`/state` 串行跑三个同步任务**（`index.js:1372-1385`）。`syncOwnPrototypes` → `mirrorPrototypesForUser` → `syncOwnTestReports` 每个都可能发多次服务端请求，3 秒一次同步放大。

---

## P3 体验与可维护性

58. 导航 chip 一律用当前 sid 打开目标 tab，落到错误类型会话，需要二次跳转（`client.js:8537-8547`）。修：复用 `openPanel` 的 `pick()`。
59. 设计师在非设计会话看到「只有设计师可以修改」，而看的人正是设计师（`client.js:9505`）。
60. chip 与自动打开都不清只读标记，负责人莫名进入只读态（`client.js:3116-3124`）。
61. 目录列表静默 `slice(0, 500)`，第 501 个文件在界面上不存在（`index.js:1237`）。
62. 二进制判定只看 `\u0000`，`.woff`/`.wasm` 等无 NUL 的非 UTF-8 文件显示成一片乱码（`client.js:8847`）。
63. 文件名与面包屑不剥离 Unicode 双向控制符，可伪造显示顺序和扩展名（`client.js:8873`、`8829`）。
64. 验收标准解析不跟踪 ``` 围栏和表格，`- [x]` 的已勾标记被忽略（`client.js:8905-8916`）。
65. 「测试证据」chip 只数 `.html`，测试面板证据列表不限扩展名，两处数字可能不同（`client.js:8535`）。
66. 「设计稿」chip 统计全部版本，需求详情页只统计最新版本（`client.js:8534-8546`）。
67. 只读预览 iframe 没有票据过期/401 处理，失败时静默白屏（`client.js:8648-8654`）。`DeliveredGallery` 有预检和「重新加载预览」，这里没有。
68. 勾选进度按 requirementId 存 localStorage，不随账号隔离（`client.js:8933`）。
69. **约 700 行死代码**：`RequirementDetail`（`3468-3930`，463 行）、`RequirementDetailPanel`（`7845`）、`RequirementBar`（`7813`）、`DesignStartPanel`（`7971`）、`StatCard`（`3221`）、`RequirementRow`（`3228`）全部 0 处引用。读者会误以为这些逻辑在生效。
70. 重复实现：需求卡同一状态渲染两遍（`StatusChip` + 文案「需求」的 `DesignChip`，`client.js:6450-6455`）；「设计已更新」两套图标（内联 `◷` vs `DesignUpdatedChip` 的 `↑`）；「测试中」两套色调（`testChipMeta` 绿 vs 测试卡黄）。
71. `groupedPlatforms` 不过滤 `active`，与 `excluded`/`allPlatforms` 口径不一致（`client.js:2868-2877`）。
72. `phaseRows` 的 meta 用 `total-pending`、pct 用 `reviewed`，显示「8/10 已评审」却只有 70%（`client.js:6379-6393`）。
73. `testRuns`/`devTasks` 非数组的旧数据未归一化，`.length-1` 得 NaN（`client.js:6440`、`6462`）。
74. 迭代表行用 `onClick` 且硬把首行加 `active`，键盘不可达（`client.js:6340-6344`）。

---

## 已排除的疑点

- `findMappedRecord` 的跨账号兜底（`index.js:960-972`）**不泄露路径**：路径仍按当前用户 `baseDir` 解析，`syncOwnPrototypes` 有 `ownerId === userId` 守卫。
- `sendDesignPreview` 的 CSP + iframe `sandbox`（`index.js:1929-1932`）**没有 `allow-same-origin`**，且 src 全由常量前缀 + `URLSearchParams` 构造，未发现外部 URL 注入或 `javascript:`/`data:` 绕过。
- Markdown 渲染只生成 React 节点、不拼 `innerHTML`（`client.js:1562`），需求正文不构成 XSS。
- 生产环境的默认密钥、mock provider、弱 webhook secret 都有启动期 panic 拦截（`main.rs:48-105`）。

## 建议的修复顺序

1. 先修 P0 的 1、2、3、4、5、6、13、14（越权与本机文件读写）——这些是能直接造成数据泄露或数据破坏的。
2. 再修 P1 里会导致「看起来成功其实失败」的：16（设计版本过滤）、17（GitLab 超时）、19（映射丢失）、41（静默截断）、49（脚本直接报错）。
3. 性能项 51、52 是后续扩容的前置条件；52 尤其应该跟 1（附件权限）一起改，因为两者都在 `artifact_contents` 这条路径上。
