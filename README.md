# 三国战棋 (zhanqi)

一款基于 HTML5 Canvas 的回合制战棋游戏，支持 DIY 武将/小兵/技能、拓展管理和工程化导入导出。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [游戏玩法](#游戏玩法)
- [小兵卡牌系统](#小兵卡牌系统)
- [DIY 编辑器](#diy-编辑器)
- [拓展管理系统](#拓展管理系统)
- [工程导入导出](#工程导入导出)
- [技能开发指南](#技能开发指南)
- [Effect API 参考](#effect-api-参考)
- [事件系统（进阶）](#事件系统进阶)
- [视觉特效 fx](#视觉特效-fx)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [API 接口](#api-接口)
- [FAQ](#faq)

---

## 功能特性

### 🎮 游戏核心
- **回合制战棋**：经典战棋玩法，移动 → 攻击/技能 → 结束回合
- **武将系统**：多个内置武将（赵云、吕布、诸葛亮、张飞、貂蝉、周瑜等），各有独特技能
- **小兵卡牌系统**：部署点机制 + 手牌抽卡，可自定义卡组数量，双方独立卡池
- **地形系统**：平原、林地（+10防御）、营地（+5防御）、河流（半阻断，可达但不可穿过）、城池（+15防御）、山地（半阻断，可进入但不可穿出，弓兵站上去攻击范围+1）
- **AI 对战**：内置 AI，支持人机对战，自动选择技能目标和走位
- **斗蛐蛐模式**：玩家为双方挑选武将后，观看两个 AI 自动对战，支持暂停/继续/重开
- **战斗动画**：伤害飘字、命中特效、闪避/护盾提示、棋子抖动/脉动

### 🛠️ DIY 系统
- **全屏可视化编辑器**：支持多 Tab 切换（属性/技能/代码），手机端自适应
- **三类对象编辑**：武将、小兵、独立技能，统一编辑器
- **立绘 & 语音**：支持上传武将/小兵立绘和技能音效（cast/hit/voice），拓展导入导出自动携带
- **动态技能编译**：技能代码实时生效，无需重启服务器
- **代码高亮**：基于 highlight.js 的代码编辑器
- **API 侧栏**：编辑器内置 API 速查面板，分类展示所有可用函数，点击即插入
- **密码保护**：提交/删除需要密码验证（默认 `diy123`）

### 📦 拓展与工程
- **拓展（Extension）**：武将、小兵和技能按拓展分组，可启用/禁用
- **工程导出**：将整个拓展打包为 ZIP 文件分享（含立绘/语音）
- **工程导入**：导入他人分享的 ZIP 工程，一键加载
- **多拓展管理**：支持创建多个拓展，自由组合启用

### ⚡ 丰富的 Effect API
- 80+ 内置效果函数：伤害、治疗、位移、眩晕、魅惑、中毒、护盾、召唤、陷阱……
- 标记系统（Mark System）：自定义状态效果
- 事件系统：`triggerPassive` / `Effect.on` / `Effect.trigger` 双轨事件机制
- 视觉特效 `Effect.fx`：高亮格子、棋子抖动、指示线、光束、光环、粒子、屏幕震动
- 小兵系统：抽卡、部署、召唤、部署点管理
- 范围形状：`+`（十字）、`x`（斜角）、`r`（圆形）、`square`（方形）

---

## 快速开始

### 环境要求
- Node.js >= 14.x
- npm 或 yarn

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 启动服务器
npm start
# 或指定端口
PORT=3000 node server.js
```

服务器默认运行在 `http://localhost:5000`（可通过 `PORT` 环境变量修改）。

### 访问页面
- **游戏首页**：http://localhost:5000/
- **DIY 编辑器**：http://localhost:5000/diy.html

---

## 游戏玩法

### 基本操作
1. **选择武将**：点击己方武将（红方）选中
2. **移动**：点击蓝色高亮格子移动
3. **攻击**：移动后点击红色高亮的敌方武将进行普通攻击
4. **技能**：点击底部技能按钮，选择目标释放技能
5. **部署小兵**：使用部署点从手牌部署小兵到己方半场
6. **结束回合**：点击「结束回合」按钮，轮到敌方行动

### 胜利条件
- 消灭所有敌方武将即为胜利

### 斗蛐蛐模式
1. 主页点击「斗蛐蛐」按钮进入
2. **选将阶段**：玩家为红蓝双方轮流挑选武将（每方 3 人）
3. **布阵 + 战斗**：选将完成后，AI 自动为双方布阵并开始对战
4. **观战控制**：顶部观战条提供「暂停/继续」和「重开」按钮
   - 暂停后 AI 停止行动，点击继续恢复
   - 重开直接重新开始一局斗蛐蛐

### 地形加成
| 地形 | 代码 | 防御加成 | 特殊效果 |
|------|------|----------|----------|
| 平原 | `plain` | 0 | — |
| 林地 | `m` | +10 | — |
| 营地 | `f` | +5 | — |
| 河流 | `r` | 0 | **半阻断**：可以走到河里，但不能穿过（过河后必须停下），视线半阻断（能打到河上，打不到对岸远处）|
| 城池 | `w` | +15 | 占领后额外+8防御 |
| 山地 | `mt` | +15 | **半阻断**：可进入但不可穿出（进了山就停在山上），视线半阻断（能打到山上本人，打不到山后面）；弓兵站上去攻击范围+1 |

### 范围形状
| 形状 | 代码 | 说明 |
|------|------|------|
| 十字 | `+` | 上下左右四方向 |
| 斜角 | `x` | 四个对角线方向 |
| 圆形 | `r` | 切比雪夫距离圆形 |
| 方形 | `square` | 正方形区域 |

### 范围阻断（Block Mode）
范围拓展时遇到「棋子 / 阻断地形（山地、河流）」会按阻断模式处理。共三种基础模式 + 一种条件模式：

| 模式 | 代码 | 行为 |
|------|------|------|
| 全阻断 | `'full'` | 拓展到这一格结束，**不包含**这一格（此格不可达，也不可穿过） |
| 半阻断 | `'half'` | 拓展到这一格结束，**包含**这一格（此格可达，但不可继续穿过） |
| 不阻断 | `'none'` | 正常拓展全部路径（路径穿过此格，此格本身可达） |
| 条件阻断 | `blockFilter` | 一个过滤器回调，按条件返回上述任一模式 |

**默认规则（不写 blockFilter 时自动生效）：**

| 对象 | 默认阻断模式 | 说明 |
|------|:---:|------|
| 山地 `mt` | `half` 半阻断 | 能站上去/能打到本人，但不能继续穿过去打后面 |
| 河流 `r` | `half` 半阻断 | 能走到河里/能打到河上，但不能穿到对岸 |
| 敌方棋子 | `full` 全阻断 | 占位，不可进入、不可穿过、阻挡视线 |
| 友方棋子 | `full` 全阻断 | 占位，不可进入、不可穿过、阻挡视线 |
| 其他地形（平原/林/营/城）| `none` 不阻断 | 正常通过 |

> 不再使用「河流消耗 2 步 / 山地消耗 2 步」的行动力机制，统一改为阻断模式处理。

**条件阻断示例**：覆盖默认——让友方棋子不阻断（能看到/打到友军身后）、河流改为不阻断（能游过去）：

```javascript
const cells = Range.cellsInRangeWithBlock('+', 4, actor.x, actor.y, {
  pieceAt: (x, y) => Game.pieceAt(x, y),
  blockFilter: (x, y, piece, terrain) => {
    if (terrain === 'r') return 'none';                 // 河流不再阻断
    if (terrain === 'mt') return 'none';                // 山也能穿越
    if (piece && piece.side === actor.side) return 'none'; // 友方不阻断
    // 返回 undefined → 回退默认（山/河 half / 敌方 full / 其他 none）
  }
});
```

**`blockFilter` 返回值约定**：
- 返回 `'full'` / `'half'` / `'none'` → 覆盖默认，使用该模式
- 返回 `false` → 显式不阻断
- 返回 `undefined` / `null` → 回退到上表的默认规则

> 旧版 `passThrough: true` 仍兼容，等价于 `blockMode: 'none'`（完全不阻断）。

---

## 小兵卡牌系统

### 卡组机制
- **部署点**：每回合自动获得部署点，用于部署小兵
- **手牌**：从卡池中抽取小兵卡到手牌，部署时消耗对应部署点
- **双方独立卡池**：红蓝双方各自一套卡池，互不影响
- **卡组数量**：每个小兵可设置 `cardCount`（卡池中该小兵的数量，0-50）
- **用尽不刷**：卡池中小兵用完后不再刷新

### 小兵属性
| 属性 | 说明 |
|------|------|
| id | 唯一标识，自动加前缀 `diyminion_` |
| name | 显示名称 |
| hp/atk/def | 生命/攻击/防御 |
| rarity | 品质：common/rare/epic（影响死亡被动） |
| tag | 兵种：infantry(步兵)/scout(侦察)/siege(攻城)/archer(弓兵)/cavalry(骑兵) |
| cost | 部署消耗 |
| cardCount | 卡池中的数量（双方各一份） |
| inDeck | 是否加入卡组 |
| moveRange/attackRange | 移动/攻击范围 |
| portrait | 立绘图片 |
| sound | 音效（cast/hit/voice） |

### 兵种类型
| 兵种 | 代码 | 部署规则 | 特殊效果 |
|------|------|---------|----------|
| 步兵 | `infantry` | 己方前线三行 | — |
| 侦察 | `scout` | 己方半场任意空格 | — |
| 攻城 | `siege` | 己方占领城池相邻格 | — |
| 弓兵 | `archer` | 己方半场任意空格 | 站在山地(mt)上攻击范围+1 |
| 骑兵 | `cavalry` | 己方前线三行 | 攻击方向与上次移动方向相同时，本次攻击+20% |

---

## DIY 编辑器

### 编辑器入口
打开 [diy.html](http://localhost:5000/diy.html)，点击武将/小兵/技能卡片上的「编辑」按钮，进入全屏编辑器。

### 编辑器功能
- **多 Tab 切换**：属性、技能、代码（init/filter/content）独立编辑，切换时自动保存
- **属性面板**：ID、名称、HP/ATK/DEF、移动/攻击范围（形状+半径）、立绘上传、语音设置
- **技能管理**：添加/删除技能，支持主动/被动/触发技，技能可独立设置音效
- **代码编辑器**：全屏代码编辑，支持 API 侧栏速查、代码片段插入
- **范围预览**：技能可设置 `preview`（预览范围形状）和 `passThrough`（**默认 `true`** 不阻断，显式 `false` 才启用棋子/地形阻断）
- **手机适配**：编辑器 UI 自适应手机屏幕

### 立绘与语音
- **立绘**：在属性面板上传图片，保存时自动上传到服务器
- **语音**：技能属性中可设置 cast（释放音效）、hit（命中音效）、voice（语音台词）
- **拓展导入**：ZIP 工程自动携带立绘和语音文件

---

## 拓展管理系统

### 什么是拓展？
拓展（Extension）是武将、小兵和技能的集合。你可以：
- 创建多个独立的拓展（如「三国武将包」「幻想角色包」）
- 一键启用/禁用整个拓展
- 将拓展导出为 ZIP 工程文件分享

### 管理拓展
- **创建拓展**：在 DIY 页面提交武将时指定 `extName`（拓展名称）
- **启用/禁用**：通过 `/api/ext/toggle` 接口控制
- **删除拓展**：通过 `/api/ext/delete` 接口删除整个拓展

---

## 工程导入导出

### 导出工程
1. 打开 DIY 页面
2. 点击「📤 导出」按钮
3. 输入工程名称和密码
4. 浏览器自动下载 `.zip` 文件（含立绘/语音）

### 导入工程
1. 打开 DIY 页面
2. 点击「📥 导入」按钮
3. 选择 ZIP 文件
4. 输入密码
5. 工程内的所有武将、小兵和技能自动加载

### 工程 ZIP 结构
```
my-project.zip
├── project.json     # 工程元信息（名称、版本、描述）
├── generals.json    # 武将数组
├── minions.json     # 小兵数组
├── skills.json      # 独立技能数组
└── assets/          # 立绘和语音文件
    ├── portraits/
    └── sounds/
```

---

## 技能开发指南

### 技能结构
每个技能包含以下字段：

```javascript
{
  id: 'skillId',          // 唯一ID
  name: '技能名',          // 显示名称
  type: '主动',            // '主动' / '被动' / '触发'
  cooldown: 2,            // 冷却回合数（主动技能）
  trigger: 'onKill',      // 被动触发时机（被动技能）
  limited: false,         // 是否限定技（每局一次）
  desc: '技能描述',        // 说明文字
  aiHint: { ... },        // AI 提示（指导 AI 使用技能）
  preview: {              // 技能范围预览（可选）
    shape: '+',           // 形状：+, x, r, square
    n: 4,                 // 半径
    passThrough: true     // 是否穿墙预览（默认 true：不阻断；显式 false 才启用棋子/山地阻断）
  },
  sound: {                // 音效（可选）
    cast: 'skill_cast.mp3',
    hit: 'skill_hit.mp3',
    voice: 'skill_voice.mp3'
  },
  // 初始化方法（可选）
  init(actor) {
    // 游戏开始时（武将）或部署后（小兵）立即执行
  },
  // 是否满足释放条件
  filter(actor) {
    return actor && actor.alive && !actor.skilled;
  },
  // 技能主逻辑（主动技能为 async）
  async content(actor, context) {
    // 技能代码...
  }
}
```

### 被动技能触发时机
| 触发时机 | 说明 | context 参数 |
|----------|------|--------------|
| `turnStart` | 回合开始时触发（己方回合） | `{ turn }` |
| `turnEnd` | 回合结束时触发（己方回合） | `{ turn }` |
| `onKill` | 击杀敌人时触发 | `{ target, victim }` |
| `onKilled` | 自身被击杀时触发 | `{ killer, damage }` |
| `onAttack` | 发起攻击时触发 | `{ target, damage }` |
| `onAttacked` | 被攻击后触发 | `{ attacker, damage }` |
| `onMove` | 移动结束后触发 | `{ from, to }` |
| `onHeal` | 被治疗时触发 | `{ healer, amount }` |
| `onSkillCast` | 任意技能发动后触发 | `{ caster, skill }` |

### 主动技能示例

```javascript
// filter：判断是否可施放
return actor && actor.alive && !actor.skilled;
```

```javascript
// content：在十字3格范围内选择一名敌人，造成2倍攻击伤害
const target = await Effect.chooseEnemy(actor, {
  range: { shape: '+', n: 3 },
  passThrough: true,
  hintText: '请选择敌人'
});
if (!target) return false;

actor.skilled = true;
Effect.damage(actor, target, Effect.getEffectiveAttack(actor), { mul: 2 });
Game.log(actor.name + ' 发动了强力一击！');
return true;
```

### 被动技能示例

```javascript
// filter：满足条件才触发
return actor && actor.alive;
```

```javascript
// content：回合开始时恢复20生命并获得护盾
Effect.heal(actor, 20);
Effect.shield(actor, 30);
```

### init 方法（可选）
```javascript
// 武将：游戏开始时立即执行
// 小兵：部署后立即执行
init(actor) {
  Effect.mark(actor, 'ready', { display: '蓄' });
}
```

### 可用全局对象
在技能代码中可以直接使用：
- `Effect` — 效果 API（见下文）
- `Range` — 范围计算
- `Game` — 游戏实例（注意：是 `Game`，不是 `global.Game`）
- `Math` — 数学函数
- `actor` — 当前棋子对象（参数）
- `context` — 触发上下文（被动技能参数）

---

## Effect API 参考

### 战斗数值
| 函数 | 说明 |
|------|------|
| `Effect.getEffectiveAttack(actor)` | 获取有效攻击力（含buff和标记） |
| `Effect.getEffectiveDefense(target)` | 获取有效防御力（含buff、地形、标记） |
| `Effect.getEffectiveAttackRange(actor)` | 获取有效攻击范围，返回 `{shape, n}` |
| `Effect.getEffectiveMoveRange(actor)` | 获取有效移动范围，返回 `{shape, n}` |

### 伤害与治疗
| 函数 | 说明 |
|------|------|
| `Effect.damage(actor, target, amount, opts)` | 造成伤害，opts: `{ mul, ignoreDef, ignoreShield }` |
| `Effect.basicAttack(actor, target)` | 普通攻击 |
| `Effect.heal(actor, amount)` | 治疗 |
| `Effect.leech(actor, target, amount, opts)` | 吸血伤害 |
| `Effect.explode(actor, x, y, n, amount, opts)` | 范围爆炸伤害 |
| `Effect.chain(actor, target, amount, count, opts)` | 链式弹射 |
| `Effect.healArea(actor, shape, n, amount)` | 范围治疗 |
| `Effect.stealStat(actor, target, stat, amount)` | 永久偷取属性（atk/def） |

### 护盾与状态
| 函数 | 说明 |
|------|------|
| `Effect.shield(target, amount)` | 添加护盾 |
| `Effect.stun(target, turns)` | 眩晕（跳过行动） |
| `Effect.charm(actor, target, turns)` | 魅惑（临时换边） |
| `Effect.freeze(target, turns)` | 冻结（无法移动） |
| `Effect.poison(target, dmgPerTurn, turns)` | 中毒（每回合掉血） |
| `Effect.regen(target, healPerTurn, turns)` | 再生（每回合回血） |
| `Effect.thorns(target, amount, turns)` | 荆棘（反伤） |
| `Effect.dodge(target, chance)` | 闪避 |
| `Effect.taunt(actor, turns)` | 嘲讽 |
| `Effect.undying(target, stacks)` | 不屈（致命伤锁1血） |
| `Effect.revive(target, turns, ratio)` | 复活 |
| `Effect.stealth(target, turns)` | 隐身 |
| `Effect.linkDamage(allyA, allyB, turns, ratio)` | 伤害分摊 |

### 属性增减益
| 函数 | 说明 |
|------|------|
| `Effect.modifyAttack(target, delta, turns)` | 攻击力增减 |
| `Effect.modifyDef(target, delta, turns)` | 防御力增减 |
| `Effect.modifyMoveRange(target, delta, turns)` | 移动力增减 |
| `Effect.modifyAttackRange(target, delta, turns)` | 攻击范围增减 |
| `Effect.modifyMaxHp(target, delta, opts)` | 永久修改生命上限 |
| `Effect.modifyAllStats(target, changes)` | 批量修改多种属性 |

### 位移与位置
| 函数 | 说明 |
|------|------|
| `Effect.teleport(actor, x, y)` | 传送到指定位置 |
| `Effect.randomTeleport(actor, range)` | 随机传送 |
| `Effect.push(actor, target, dir, n)` | 击退 |
| `Effect.pull(actor, target, n)` | 拉拽 |
| `Effect.swap(actor, target)` | 换位 |
| `Effect.summonUnit(actor, x, y, opts)` | 召唤自定义单位 |
| `Effect.placeTrap(x, y, opts)` | 布置陷阱 |
| `Effect.clearTraps(opts)` | 清除陷阱 |

### 目标选择（异步，需 await）
| 函数 | 说明 |
|------|------|
| `await Effect.chooseEnemy(actor, opts)` | 选择敌人 |
| `await Effect.chooseAlly(actor, opts)` | 选择友方 |
| `await Effect.chooseCell(actor, opts)` | 选择格子 |
| `await Effect.chooseOption(actor, opts)` | 选项模态框（AI自动选） |

所有选择函数支持 `opts.filter: (cell, piece) => bool` 自定义过滤。

#### AI 偏好（chooseEnemy / chooseAlly / chooseCell）
AI 模式下自动按偏好选择；玩家模式下不影响交互（玩家仍可自由点选）。调用时可传以下字段（优先级高于技能 `aiHint`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `opts.aiPrefer` | string | AI 偏好策略，见下表 |
| `opts.aiTarget` | string | 强制目标类型：`'enemy'`/`'ally'`/`'cell'`（覆盖自动推断） |
| `opts.aiAvoidSelf` | bool | 排除 actor 自身 |
| `opts.aiScore` | function | 自定义评分：`(x, y, piece, actor) => number`，分数最高者选中（最高优先级，覆盖 aiPrefer） |
| `opts.aoeRange` | `{shape,n}` | 配合格子类偏好的统计范围，默认 `{shape:'r', n:1}` |

**aiPrefer 可选值：**

| 偏好 | 适用 | 说明 |
|------|------|------|
| `low_hp` | 敌/友 | 血量百分比最低 |
| `high_hp` | 敌 | 血量百分比最高（适合削血/百分比伤害） |
| `high_threat` | 敌/友 | 威胁度最高（敌人优先击杀 / 友军增益给主力） |
| `nearest` | 敌/友 | 离 actor 最近 |
| `farthest` | 敌 | 离 actor 最远（拉扯/远程） |
| `caster` | 敌 | 低防高攻的法师型单位 |
| `tank` | 敌 | 高防高血的肉盾 |
| `minion` | 敌 | 优先小兵（清理杂兵） |
| `general` | 敌 | 优先武将（直取主将） |
| `low_def` | 敌 | 防御最低（确保伤害） |
| `injured_ally` | 友 | 残血友军（治疗优先） |
| `buffer` | 友 | 威胁度最高的友军（增益给主力） |
| `most_enemies_around` | 格 | 周围敌人最多（AOE 落点） |
| `most_allies_around` | 格 | 周围友军最多（集合点/群体增益） |
| `most_enemies_avoid_allies` | 格 | 周围敌人最多且避开友军（避免误伤） |
| `safest` | 格 | 位置威胁最低（撤退/避险） |
| `aggressive` | 格 | 能攻击到的敌人威胁总和最高（进攻走位） |
| `nearest_to_enemy` | 格 | 离最近敌人最近（推进） |
| `farthest_from_enemy` | 格 | 离最近敌人最远（撤退） |

### 单位获取
| 函数 | 说明 |
|------|------|
| `Effect.getAllies(actor)` | 获取所有友方存活棋子 |
| `Effect.getEnemies(actor)` | 获取所有敌方存活棋子 |
| `Effect.getEnemiesInRange(actor, rangeDef)` | 获取范围内敌人 |
| `Effect.getAlliesInRange(actor, rangeDef)` | 获取范围内友军 |
| `Effect.searchPiece(range, filter, opts)` | 强力搜索棋子 |
| `Effect.searchCell(range, filter)` | 强力搜索格子 |
| `Effect.getJson(id)` | 获取武将/小兵定义深拷贝 |
| `Game.pieceAt(x, y)` | 查询格子上的棋子 |

### 行动恢复
| 函数 | 说明 |
|------|------|
| `Effect.resetAction(actor)` | 恢复全部行动 |
| `Effect.resetMove(actor)` | 仅恢复移动 |
| `Effect.resetAttack(actor)` | 仅恢复攻击 |
| `Effect.resetSkill(actor, skillId)` | 仅恢复技能（可清冷却） |

### 技能操作
| 函数 | 说明 |
|------|------|
| `Effect.gainSkill(actor, skillDef)` | 添加技能 |
| `Effect.loseSkill(actor, skillId)` | 移除技能 |
| `Effect.hasSkill(actor, skillId)` | 检查是否有技能 |
| `Effect.getSkill(actor, skillId)` | 获取技能对象 |
| `Effect.setSkillCooldown(actor, skillId, cd)` | 设置冷却 |
| `Effect.resetSkillCooldown(actor, skillId)` | 重置冷却 |
| `Effect.modifySkill(actor, skillId, changes)` | 修改技能属性 |
| `Effect.reduceAllCooldowns(actor, amount)` | 减少所有冷却 |
| `Effect.gainTmpSkill(actor, skillDef, opts)` | 临时技能 |
| `Effect.loseTmpSkill(actor, tmpId)` | 移除临时技能 |
| `Effect.loseAllTmpSkills(actor)` | 移除所有临时技能 |

### 标记系统
| 函数 | 说明 |
|------|------|
| `Effect.mark(actor, name, opts)` | 添加标记 |
| `Effect.addMark(actor, name, turns, opts)` | 添加带回合的标记（到时自动移除） |
| `Effect.unmark(actor, name)` | 移除标记 |
| `Effect.removeMark(actor, name)` | 移除标记（`unmark` 别名） |
| `Effect.unmarkAll(actor)` | 移除所有标记 |
| `Effect.hasMark(actor, name)` | 是否有某标记 |
| `Effect.getMarkData(actor, name)` | 获取标记数据 |
| `Effect.getMarksOn(actor)` | 获取所有标记 |
| `Effect.detonate(target, markName, callback)` | 引爆标记 |
| `Effect.addBuff(actor, target, buff)` | 添加 buff 对象到目标 |
| `Effect.consumeBuff(actor, buffName)` | 消耗指定 buff（返回是否成功） |
| `Effect.isUntargetable(piece)` | 检查是否隐身不可被选为目标 |

### 小兵系统
| 函数 | 说明 |
|------|------|
| `Effect.drawCard(side, count)` | 抽小兵卡到手牌 |
| `Effect.drawSpecificCard(cardId, side)` | 从卡池抽指定 id 的小兵卡到手牌 |
| `Effect.removeCard(side, target)` | 弃置手牌 |
| `Effect.addDeployPoint(side, amount)` | 增减部署点（上限 15，下限 0） |
| `Effect.getDeployPoint(side)` | 获取某方当前部署点数 |
| `Effect.setDeployPoint(side, amount)` | 设置某方部署点为指定值（上限 15，下限 0） |
| `Effect.deployMinion(card, x, y, opts)` | 部署小兵 |
| `Effect.summonMinion(actor, minionId, x, y)` | 直接召唤小兵 |
| `Effect.canDeployMinion(actor, x, y)` | 检查能否部署 |
| `Effect.getAvailableMinions()` | 获取可用小兵模板 |
| `Effect.getMinionCount(actor)` | 获取己方小兵数量 |
| `Effect.getHand(side)` | 获取某方当前手牌数组 |
| `Effect.findCard(side, filter)` | 按过滤函数查找手牌中的卡（返回首个） |
| `Effect.getDeckCount(side)` | 获取某方卡池剩余数量 |
| `Effect.addCard(card, side)` | 向某方卡池添加一张小兵卡 |
| `Game.minionHand[side]` | 直接访问某方手牌 |
| `Game.minionPoints[side]` | 直接访问某方部署点 |
| `Game.MINION_MAX_POINTS` | 部署点上限常量（当前 15） |

### AI 战术分析（自定义 AI 逻辑可用）
以下均为纯查询函数：不修改棋盘、不触发特效/事件，可安全用于自定义 AI 决策。

**side 参数统一支持三种写法：**
- `'enemy'` — 相对 actor 的敌方（需同时传 actor）
- `'ally'` — 相对 actor 的友方（需同时传 actor）
- 数字 `0` / `1` — 绝对阵营（0=红方，1=蓝方），无需 actor

| 函数 | 说明 |
|------|------|
| `Effect.countPiecesAt(x, y, rangeDef, side, actor?)` | 统计 (x,y) 周围范围内某方棋子数量，rangeDef 默认 `{shape:'square',n:1}` |
| `Effect.bestCellForHits(centerRange, aoeRange, side, actor?)` | 在 centerRange 范围内选一格，使其 aoeRange 内某方棋子最多（AOE 落点选择），返回 `{x,y,count}` 或 null |
| `Effect.findSafestCell(actor, moveRange?)` | 移动范围内最安全格子（位置威胁最低），返回 `{x,y,threat}`；包含当前位置 |
| `Effect.findAggressiveCell(actor, moveRange?)` | 移动范围内进攻最优格子（能攻击的敌人威胁总和最高），返回 `{x,y,score}` |
| `Effect.evaluateCell(actor, x, y)` | 综合评估某格价值：进攻机会 − 位置威胁 + 推进度，返回数字越高越好 |

### 地形与工具
| 函数 | 说明 |
|------|------|
| `Effect.changeTerrain(x, y, type)` | 改变格子地形 |
| `Effect.random(min, max)` | 随机整数 |
| `Effect.chance(p)` | 概率判定 |
| `Effect.drawAoe(shape, n, ox, oy, opts)` | 绘制 AOE 范围预览（视觉提示，不影响逻辑） |
| `Game.log(text)` | 写入战斗日志 |
| `Effect.aiContext()` | 查询当前AI上下文 |
| `Effect.currentAiSkill()` | 获取AI正在执行的技能 |

### 范围计算 Range
| 函数 | 说明 |
|------|------|
| `Range.cellsInRange(shape, n, x, y, opts)` | 返回形状范围内的所有格子（不判阻断） |
| `Range.reachableCells(x, y, maxSteps, game, shape, opts)` | BFS 可达格子（移动范围，考虑地形消耗与阻断） |
| `Range.cellsInRangeWithBlock(shape, n, x, y, opts)` | 带阻断的直线视线范围（攻击/技能范围） |
| `Range.lineBlocked(ax, ay, bx, by, pieceAt, terrainFn)` | 旧版直线阻断检测（兼容保留） |
| `Range._resolveBlockMode(x, y, pieceAt, terrainFn, defaultMode, blockFilter)` | 计算单格阻断模式（高级用途） |
| `Range.inBounds(x, y)` / `Range.key(x, y)` | 边界判定 / 格子键 |
| `Range.manhattan` / `Range.chebyshev` / `Range.king` | 距离函数 |
| `Range.plus / circle / square / x` | 形状快捷方法 |

**`cellsInRangeWithBlock` 的 `opts`：**
- `pieceAt(x,y)` — 棋子查询（用于检测阻断）
- `terrainFn(x,y)` — 阻断地形查询（默认检测山地 `mt`）
- `blockMode` — 默认阻断模式：`'full'` / `'half'` / `'none'`（默认 `'half'`）
- `blockFilter(x,y,piece,terrain)` — 条件阻断，返回 `'full'`/`'half'`/`'none'`/`false`/`undefined`
- `passThrough` — 旧版兼容，`true` 等价于 `blockMode:'none'`
- `includeSelf` — 是否包含原点格（默认 `false`）

**`reachableCells` 的 `opts`（第 6 个参数）：**
- `pieceBlockMode` — 棋子默认阻断模式（默认 `'full'`，即不可移动到棋子上）
- `terrainBlockMode` — 阻断地形默认模式（默认 `'half'`，即可到达但不可穿过，如山地）
- `blockFilter(x,y,piece,terrain)` — 条件阻断（同上）

> 阻断模式语义详见 [范围阻断（Block Mode）](#范围阻断block-mode)。

### 阻断模式临时覆盖（一行改全局默认）
| 函数 | 说明 |
|------|------|
| `Range.setBlockOverride(obj)` / `Effect.setBlockOverride(obj)` | 临时覆盖默认阻断模式。obj 可选字段：`blockMode` / `passThrough` / `blockFilter` / `pieceBlockMode` / `terrainBlockMode` / `terrainFn` |
| `Range.resetBlockOverride()` / `Effect.resetBlockOverride()` | 立即恢复默认阻断逻辑（取消覆盖）|
| `Range.withBlockOverride(obj, fn)` / `Effect.withBlockOverride(obj, fn)` | **推荐**：作用域化，回调内生效，回调结束 / 抛错 / await 后自动恢复。返回 Promise，可 `await` |

**示例 1：手动 set / reset**

```javascript
Effect.setBlockOverride({ blockMode: 'none' });   // 一行：穿透
const target = await Effect.chooseEnemy(actor, { range: { shape: '+', n: 4 } });
Effect.resetBlockOverride();                       // 用完恢复
```

**示例 2：作用域化（自动恢复，不会乱套）**

```javascript
return Effect.withBlockOverride({ blockMode: 'none' }, async () => {
  const target = await Effect.chooseEnemy(actor, {
    range: { shape: '+', n: 4 },
    hintText: '穿甲箭：请选择敌人'
  });
  if (!target) return false;
  actor.skilled = true;
  Effect.damage(actor, target, Effect.getEffectiveAttack(actor), { ignoreDef: true });
  return true;
});
```

### 事件系统
| 函数 | 说明 |
|------|------|
| `Effect.on(eventName, cb)` | 注册全局事件监听，返回 cb 本身 |
| `Effect.off(eventName, cb)` | 移除已注册的事件监听 |
| `Effect.trigger(eventName, context)` | 触发全局事件，context 传给回调 |
| `Effect.triggerPassive(actor, eventName, context)` | 触发某棋子的被动技能 |

### 音频
| 函数 | 说明 |
|------|------|
| `Effect.playPieceVoice(piece, eventKey)` | 播放棋子事件语音（select/move/attack/hurt/death/kill/victory） |
| `Effect.playSkillCastSound(actor, skill)` | 播放技能释放音效（cast + 武将技能语音） |
| `Effect.playSkillHitSound(skill)` | 播放技能命中音效 |

---

## 事件系统（进阶）

游戏有两套事件机制：**被动技能触发**和**全局事件总线**。

### 1. Effect.triggerPassive(actor, eventName, context)
手动触发某个棋子的被动技能。遍历该棋子身上 `type === '被动'` 且 `trigger === eventName` 的技能，依次执行 `filter` 和 `content`。

```javascript
// 手动触发目标的 onAttacked 被动
Effect.triggerPassive(target, "onAttacked", {
  attacker: actor,
  damage: 50
});
```

### 2. Effect.on / Effect.trigger / Effect.off
全局事件总线（观察者模式）。`on` 注册回调，`trigger` 触发所有回调，`off` 取消订阅。

```javascript
// 注册全局监听
var killLog = function(ctx) {
  Game.log(ctx.victim.name + " 倒下了！");
};
Effect.on("onKilled", killLog);

// 触发自定义事件
Effect.trigger("myCustomEvent", { actor: actor });

// 取消监听（需保存原回调引用）
Effect.off("onKilled", killLog);
```

### 3. 两者的区别
| 对比项 | `triggerPassive` | `on / trigger` |
|--------|------------------|----------------|
| 机制 | 直接遍历棋子技能 | 全局事件总线 |
| 触发对象 | 某个棋子的被动技能 | 所有注册的回调 |
| actor 视角 | 传入的 actor 就是技能拥有者 | context.actor 是事件视角（攻击者/击杀者） |
| 用途 | DIY 被动技能执行 | 系统级逻辑、临时技能过期 |

> ⚠️ **注意**：DIY 被动技能统一走 `triggerPassive`。`on/trigger` 主要用于系统级处理，不要在 `on` 里直接写棋子被动逻辑，否则会因为 context 视角错误导致误触发。

### 4. 各事件 context 字段
| 事件 | context 字段 |
|------|-------------|
| `onKilled` | `{ actor(击杀者), target, victim, damage }` |
| `onAttack` | `{ actor(攻击者), target, damage }` |
| `onAttacked` | `{ actor(攻击者), target(被攻击者), damage }` |
| `onMove` | `{ actor, from:{x,y}, to:{x,y} }` |
| `onHeal` | `{ actor, amount }` |
| `onSkillCast` | `{ actor(施法者), skill }` |
| `turnStart/turnEnd` | `{ side, turn }` |

---

## 视觉特效 fx

通过 `Effect.fx` 调用视觉特效：

| 函数 | 说明 |
|------|------|
| `Effect.fx.highlightCells(cells, opts)` | 高亮指定格子，opts: `{color, duration, dashed, id}` |
| `Effect.fx.clearFx(id)` | 清除高亮特效 |
| `Effect.fx.shake(target, opts)` | 棋子抖动，opts: `{axis, intensity, duration}` |
| `Effect.fx.pulse(target, opts)` | 棋子脉动放大 |
| `Effect.fx.glow(target, opts)` | 棋子发光 |
| `Effect.fx.flashCell(x, y, opts)` | 格子闪烁 |
| `Effect.fx.line(fromX, fromY, toX, toY, opts)` | 指示线 |
| `Effect.fx.beam(fromX, fromY, toX, toY, opts)` | 光束 |
| `Effect.fx.ring(x, y, opts)` | 扩散光环 |
| `Effect.fx.particles(x, y, opts)` | 粒子爆发 |
| `Effect.fx.screenShake(opts)` | 屏幕震动 |

---

## 项目结构

```
zhanqi/
├── index.html          # 游戏首页
├── diy.html            # DIY 编辑器（武将/小兵/技能）
├── server.js           # Koa 服务器（API + 静态资源）
├── package.json        # 项目依赖
├── diy.json            # DIY 数据（拓展、武将、小兵、技能）
├── css/                # 样式文件
│   ├── style.css
│   └── diy.css
├── js/                 # JavaScript 模块
│   ├── game.js         # 游戏核心逻辑
│   ├── effects.js      # 效果 API + 事件系统
│   ├── skills.js       # 技能定义 + DIY 技能注册
│   ├── generals.js     # 武将定义
│   ├── minions.js      # 小兵系统
│   └── range.js        # 范围计算
├── assets/             # 图片资源
└── fonts/              # 字体文件
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端 | HTML5 Canvas、原生 JavaScript（无框架） |
| 后端 | Koa.js、Node.js |
| 数据存储 | JSON 文件（`diy.json`） |
| 代码高亮 | highlight.js |
| ZIP 处理 | JSZip（前后端共用） |
| 请求体解析 | koa-body |

---

## API 接口

### DIY 武将接口 (`/api/diy/*`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/diy/list` | 获取所有启用拓展的武将+小兵+技能 |
| POST | `/api/diy/submit` | 提交武将/小兵/技能 |
| GET | `/api/diy/detail?id=xxx` | 获取武将/小兵详情 |
| POST | `/api/diy/delete` | 删除武将/小兵及关联技能 |

### 拓展管理接口 (`/api/ext/*`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ext/list` | 获取所有拓展列表 |
| POST | `/api/ext/create` | 新建拓展 |
| POST | `/api/ext/toggle` | 启用/禁用拓展 |
| POST | `/api/ext/delete` | 删除拓展 |
| POST | `/api/ext/rename` | 重命名/修改描述 |

### 工程导入导出 (`/api/project/*`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/project/export` | 导出拓展为 ZIP 文件 |
| POST | `/api/project/import` | 导入 ZIP 为新拓展（multipart/form-data） |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |

---

## FAQ

### Q: 默认密码是什么？
A: 默认密码是 `diy123`，可通过环境变量 `DIY_PASSWORD` 修改。

### Q: 数据存在哪里？
A: 所有 DIY 数据存储在项目根目录的 `diy.json` 文件中。

### Q: 如何修改服务器端口？
A: 设置环境变量 `PORT`，例如：`PORT=8080 node server.js`。

### Q: 技能代码报错怎么办？
A: 打开浏览器控制台（F12）查看详细错误信息。常见错误：
- 拼写错误（如 `Effect.dmage` → `Effect.damage`）
- 忘记 `await` 异步函数（`chooseEnemy` / `chooseCell` 等）
- 使用 `global.Game` 而非 `Game`

### Q: 可以创建多个拓展吗？
A: 可以。提交武将时通过 `extName` 指定拓展名称，不同名字会自动创建不同拓展。

### Q: 小兵卡池是双方共享的吗？
A: 不是。红蓝双方各自一套独立卡池，互不影响。每个小兵的 `cardCount` 决定卡池中该小兵的数量。

### Q: 立绘和语音怎么上传？
A: 在 DIY 编辑器的属性面板上传立绘，在技能属性中设置音效。保存时自动上传到服务器。拓展导出时自动携带。

### Q: 被动技能的 trigger 和 Effect.on 有什么区别？
A: `trigger` 字段配合 `triggerPassive` 用于 DIY 被动技能，`Effect.on/trigger` 用于系统级全局监听。详见[事件系统（进阶）](#事件系统进阶)。

---

## License

MIT
