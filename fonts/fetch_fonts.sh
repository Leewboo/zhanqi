#!/usr/bin/env bash
# 从 Google Fonts 下载中文字体子集（woff2），生成本地 fonts.css
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 1) 游戏中的核心字符（棋子显示 / 按钮 / 菜单）
CORE="三国战棋策略对战关羽赵云黄忠甲乙丙丁戊己庚辛威震水淹百步穿杨常胜胆勇怒吼突袭疗伤齐射坚守妙计强袭老当益壮移动攻击防御生命战斗回合选将布阵已可行动血十字圆形方形详情关闭结束重新开始返回主页战报红方蓝本机对战士机武将池选择中剩余日志未棋子请点击下方武将卡后再点棋盘空格放置只能底部己方半场该位置已有布阵完成中文字样请战棋林营河城移动范围攻击范围伤害治疗回复生命移动"

# 2) 扩展：常用字（保证日志、武将描述等也能匹配）
COMMON="的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分奇爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感见明问力理尔点文几定本公特做外孩相西果走将月十实向声车全信重三机工物气每并别真打太新比才便夫再书部水像眼等体却加电主界门利海受听表德少克代员许稍先口由死安写性马光白或住难望教命花结乐色更拉东神记处让母父应直字场平报友关放至张认告入笑内英军候民岁往何度山觉路带万男边风解叫任金快原吃妈变通师立象数四失满战远格士音轻目条呢病始达深完今提求清王化空业思切怎非找片罗钱紶吗语元喜曾离飞科言干网早论吧功令从活氏伯共米氏伯团共米百关氏伯"

# 3) 标点符号与数字
PUNCT="，。！？：；、""''（）《》【】0123456789+-*/=·「」『』…—"

CHARS="${CORE}${COMMON}${PUNCT}"
TOTAL=${#CHARS}
echo "总共要下载的字符数（有重复，google 内部会去重）：$TOTAL"

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# 需要的字体：Noto Sans SC 400/700（正文），ZCOOL XiaoWei 400（标题）
FAMILIES=(
  "Noto Sans SC|400|noto-sans-sc-400"
  "Noto Sans SC|700|noto-sans-sc-700"
  "ZCOOL XiaoWei|400|zcool-xiaowei-400"
)

mkdir -p "$DIR/woff2"

# 生成 fonts.css
CSS="$DIR/fonts.css"
echo "/* 战棋游戏本地字体：Noto Sans SC / ZCOOL XiaoWei */" > "$CSS"
echo "/* 字体文件与这个 CSS 放在同一目录 */" >> "$CSS"
echo "" >> "$CSS"

for F in "${FAMILIES[@]}"; do
  FAMILY_NAME=$(echo "$F" | cut -d'|' -f1)
  WEIGHT=$(echo "$F" | cut -d'|' -f2)
  SLUG=$(echo "$F" | cut -d'|' -f3)

  echo ""
  echo "=== 下载 $FAMILY_NAME weight=$WEIGHT ==="

  # 用 text= 让 google fonts 返回仅针对这些字符的子集（woff2 单一文件）
  URL_FAMILY=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('$FAMILY_NAME'))
")
  URL="https://fonts.googleapis.com/css2?family=${URL_FAMILY}:wght@${WEIGHT}&text=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('${CHARS}'))
")"

  CSS_TEXT=$(curl -sA "$UA" --max-time 30 "$URL")
  if [ -z "$CSS_TEXT" ]; then
    echo "!!! 失败：无法获取字体 CSS"
    exit 1
  fi

  # 解析其中的 src url
  WOFF2_URL=$(echo "$CSS_TEXT" | grep -oE "src:[^;]+" | grep -oE "https?://[^)]+" | head -1)
  if [ -z "$WOFF2_URL" ]; then
    echo "!!! 失败：解析不到 woff2 URL，CSS_TEXT 如下："
    echo "$CSS_TEXT" | head -20
    exit 1
  fi

  echo "  URL: $WOFF2_URL"
  OUT="woff2/${SLUG}.woff2"
  curl -sL --max-time 120 -A "$UA" "$WOFF2_URL" -o "$DIR/$OUT"
  SIZE=$(stat -c%s "$DIR/$OUT" 2>/dev/null || stat -f%z "$DIR/$OUT" 2>/dev/null)
  echo "  已下载：$OUT 大小：${SIZE} 字节"

  # 写 @font-face
  CSS_FAMILY_OUT="$FAMILY_NAME"
  if [ "$FAMILY_NAME" = "ZCOOL XiaoWei" ]; then
    CSS_FAMILY_OUT="ZCOOL XiaoWei"
  fi

  cat >> "$CSS" <<EOF
@font-face {
  font-family: '${CSS_FAMILY_OUT}';
  font-style: normal;
  font-weight: ${WEIGHT};
  font-display: swap;
  src: url('woff2/${SLUG}.woff2') format('woff2');
}

EOF

done

echo ""
echo "=== 全部完成，生成 $CSS"
echo ""
ls -lh "$DIR/woff2/"
