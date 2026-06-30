# 三国战棋 (zhanqi)

一款基于 HTML5 Canvas 的回合制战棋游戏，支持 DIY 武将、技能拓展和工程化管理。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [游戏玩法](#游戏玩法)
- [DIY 武将系统](#diy-武将系统)
- [拓展管理系统](#拓展管理系统)
- [工程导入导出](#工程导入导出)
- [技能开发指南](#技能开发指南)
- [Effect API 参考](#effect-api-参考)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [API 接口](#api-接口)
- [FAQ](#faq)

---

## 功能特性

### 🎮 游戏核心
- **回合制战棋**：经典战棋玩法，移动 → 攻击/技能 → 结束回合
- **武将系统**：多个内置武将（赵云、吕布、诸葛亮、张飞、貂蝉、周瑜等），各有独特技能
- **地形系统**：平原、山地（+10防御）、森林（+5防御）、河流（+15防御）
- **AI 对战**：内置简易 AI，支持人机对战
- **战斗动画**：伤害飘字、命中特效、闪避/护盾提示

### 🛠️ DIY 系统
- **可视化编辑器**：在浏览器中直接编辑武将属性和技能代码
- **动态技能编译**：技能代码实时生效，无需重启服务器
- **代码高亮**：基于 highlight.js 的技能代码编辑器
- **密码保护**：提交/删除需要密码验证（默认 `diy123`）

### 📦 拓展与工程
- **拓展（Extension）**：武将和技能按拓展分组，可启用/禁用
- **工程导出**：将整个拓展打包为 ZIP 文件分享
- **工程导入**：导入他人分享的 ZIP 工程，一键加载武将和技能
- **多拓展管理**：支持创建多个拓展，自由组合启用

### ⚡ 丰富的 Effect API
- 40+ 内置效果函数：伤害、治疗、位移、眩晕、魅惑、中毒、护盾……
- 标记系统（Mark System）：自定义状态效果
- 事件系统：`onKill` / `onAttacked` / `turnStart` / `turnEnd` 等触发时机

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
- **DIY 武将编辑器**：http://localhost:5000/diy.html

---

## 游戏玩法

### 基本操作
1. **选择武将**：点击己方武将（红方）选中
2. **移动**：点击蓝色高亮格子移动
3. **攻击**：移动后点击红色高亮的敌方武将进行普通攻击
4. **技能**：点击底部技能按钮，选择目标释放技能
5. **结束回合**：点击「结束回合」按钮，轮到敌方行动

### 胜利条件
- 消灭所有敌方武将即为胜利

### 地形加成
| 地形 | 代码 | 防御加成 |
|------|------|----------|
| 平原 | - | 0 |
| 山地 | m | +10 |
| 森林 | f | +5 |
| 河流 | r | +15 |

---

## DIY 武将系统

### 快速上手（30秒）
1. 打开 [diy.html](http://localhost:5000/diy.html)
2. 左侧「武将属性」填写 `id`、`name`、`hp`、`atk`、`def`、移动/攻击范围
3. 右侧「技能列表」点「+ 添加」，写 `filter` 与 `content` 代码
4. 底部输入密码 `diy123`，点「提交到服务器」
5. 回到游戏首页，DIY 武将会出现在选将池中

### 武将属性说明
| 属性 | 说明 | 取值范围 |
|------|------|----------|
| id | 武将唯一标识，自动加前缀 `diy_` | 2-20位字母/数字/下划线 |
| name | 武将显示名称 | 任意字符串 |
| hp | 最大生命值 | 1 - 10000 |
| atk | 攻击力 | 0 - 1000 |
| def | 防御力 | 0 - 1000 |
| 移动范围 | 移动距离和形状 | 十字/方形/圆形/X形，半径1-12 |
| 攻击范围 | 普通攻击距离和形状 | 十字/方形/圆形/X形，半径1-12 |

---

## 拓展管理系统

### 什么是拓展？
拓展（Extension）是武将和技能的集合。你可以：
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
4. 浏览器自动下载 `.zip` 文件

### 导入工程
1. 打开 DIY 页面
2. 点击「📥 导入」按钮
3. 选择 ZIP 文件
4. 输入密码
5. 工程内的所有武将和技能自动加载

### 工程 ZIP 结构
```
my-project.zip
├── project.json     # 工程元信息（名称、版本、描述）
├── generals.json    # 武将数组
└── skills.json      # 技能数组
```

---

## 技能开发指南

### 技能结构
每个技能包含以下字段：

```javascript
{
  id: 'skillId',          // 唯一ID
  name: '技能名',          // 显示名称
  type: '主动',            // '主动' 或 '被动'
  cooldown: 2,            // 冷却回合数（主动技能）
  trigger: 'onKill',      // 被动触发时机（被动技能）
  desc: '技能描述',        // 说明文字
  preview: {              // 技能范围预览（可选）
    shape: '+',
    n: 4,
    passThrough: true
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
| `onKill` | 击杀敌人时触发 | `{ killed: target }` |
| `onAttacked` | 被攻击后触发 | `{ attacker, damage }` |
| `turnStart` | 回合开始时触发 | - |
| `turnEnd` | 回合结束时触发 | - |

### 主动技能示例

```javascript
// filter：判断是否可施放
return actor && actor.alive && !actor.skilled;
```

```javascript
// content：技能主逻辑
// 在十字3格范围内选择一名敌人，造成2倍攻击伤害
const target = await Effect.chooseEnemy(actor, {
  range: { shape: '+', n: 3 },
  passThrough: true,
  hintText: '请选择敌人'
});
if (!target) return false;

actor.skilled = true;
Effect.damage(actor, target, Effect.getEffectiveAttack(actor), { mul: 2 });
global.Game.log(actor.name + ' 发动了强力一击！');
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

### 可用全局对象
在技能代码中可以直接使用：
- `Effect` — 效果 API（见下文）
- `Range` — 范围计算
- `global.Game` — 游戏实例
- `Math` — 数学函数
- `actor` — 当前武将对象（参数）
- `context` — 触发上下文（被动技能参数）

---

## Effect API 参考

### 战斗数值
| 函数 | 说明 |
|------|------|
| `Effect.getEffectiveAttack(actor)` | 获取有效攻击力（含buff和标记） |
| `Effect.getEffectiveDefense(target)` | 获取有效防御力（含buff、地形、标记） |

### 伤害与治疗
| 函数 | 说明 |
|------|------|
| `Effect.damage(actor, target, amount, opts)` | 造成伤害，opts: `{ mul, ignoreDef, ignoreShield }` |
| `Effect.basicAttack(actor, target)` | 普通攻击 |
| `Effect.heal(actor, amount)` | 治疗 |
| `Effect.leech(actor, target, amount, opts)` | 吸血伤害 |
| `Effect.explode(actor, x, y, range, amount, opts)` | 范围爆炸伤害 |

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
| `Effect.dodge(target, chance)` | 闪避（概率闪避下次伤害） |
| `Effect.taunt(actor, turns)` | 嘲讽 |

### 属性增减益
| 函数 | 说明 |
|------|------|
| `Effect.modifyAttack(target, delta, turns)` | 攻击力增减 |
| `Effect.modifyMoveRange(target, delta, turns)` | 移动力增减 |

### 位移与位置
| 函数 | 说明 |
|------|------|
| `Effect.teleport(actor, x, y)` | 传送到指定位置 |
| `Effect.randomTeleport(actor, range)` | 随机传送 |
| `Effect.push(actor, target, dir, n)` | 击退 |
| `Effect.pull(actor, target, n)` | 拉拽 |
| `Effect.swap(actor, target)` | 换位 |

### 目标选择
| 函数 | 说明 |
|------|------|
| `Effect.chooseCell(actor, options)` | 选择格子（返回 Promise） |
| `Effect.chooseEnemy(actor, options)` | 选择敌人（返回 Promise） |
| `Effect.chooseAlly(actor, options)` | 选择友方（返回 Promise） |

### 单位获取
| 函数 | 说明 |
|------|------|
| `Effect.getAllies(actor)` | 获取所有友方存活棋子 |
| `Effect.getEnemies(actor)` | 获取所有敌方存活棋子 |

### 行动恢复
| 函数 | 说明 |
|------|------|
| `Effect.resetAction(actor)` | 恢复全部行动 |
| `Effect.resetMove(actor)` | 仅恢复移动 |
| `Effect.resetAttack(actor)` | 仅恢复攻击 |
| `Effect.resetSkill(actor, skillId)` | 仅恢复技能（可清冷却） |

### 标记系统
| 函数 | 说明 |
|------|------|
| `Effect.mark(actor, name, opts)` | 添加标记 |
| `Effect.unmark(actor, name)` | 移除标记 |
| `Effect.unmarkAll(actor)` | 移除所有标记 |
| `Effect.hasMark(actor, name)` | 是否有某标记 |
| `Effect.getMarkData(actor, name)` | 获取标记数据 |
| `Effect.getMarksOn(actor)` | 获取所有标记 |

### 事件系统
| 函数 | 说明 |
|------|------|
| `Effect.on(eventName, cb)` | 注册事件监听 |
| `Effect.off(eventName, cb)` | 移除事件监听 |
| `Effect.trigger(eventName, context)` | 触发事件 |

### 地形
| 函数 | 说明 |
|------|------|
| `Effect.changeTerrain(x, y, terrain)` | 改变指定格子地形 |
| `Effect.drawAoe(shape, n, x, y, opts)` | 获取范围格子列表 |

### 召唤
| 函数 | 说明 |
|------|------|
| `Effect.summonDecoy(actor, x, y, hp)` | 召唤幻象 |

### 工具
| 函数 | 说明 |
|------|------|
| `Effect.random(min, max)` | 随机整数 |
| `Effect.chance(p)` | 概率判定 |
| `Effect.chain(actor, target, amount, count, opts)` | 链式闪电 |
| `Effect.healArea(actor, shape, n, amount)` | 范围治疗 |

---

## 项目结构

```
zhanqi/
├── index.html          # 游戏首页
├── diy.html            # DIY 武将编辑器
├── server.js           # Koa 服务器（API + 静态资源）
├── package.json        # 项目依赖
├── diy.json            # DIY 数据（拓展、武将、技能）
├── css/                # 样式文件
│   ├── style.css
│   └── diy.css
├── js/                 # JavaScript 模块
│   ├── game.js         # 游戏核心逻辑
│   ├── effects.js      # 效果 API
│   ├── skills.js       # 技能定义 + DIY 技能注册
│   ├── generals.js     # 武将定义
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
| GET | `/api/diy/list` | 获取所有启用拓展的武将+技能（扁平列表） |
| POST | `/api/diy/submit` | 提交武将（含技能） |
| GET | `/api/diy/detail?id=xxx` | 获取武将详情（含技能） |
| POST | `/api/diy/delete` | 删除武将及其技能 |

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
- 使用了未定义的变量

### Q: 可以创建多个拓展吗？
A: 可以。提交武将时通过 `extName` 指定拓展名称，不同名字会自动创建不同拓展。

### Q: 工程 ZIP 和拓展的关系？
A: 一个 ZIP 工程对应一个拓展。导出时将整个拓展打包，导入时创建或覆盖一个拓展。

---

## License

MIT
