// 生成项目 zip 包（用于分发）
// 用法：node build-zip.js [输出路径]
// 默认输出：zhanqi.zip
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = __dirname;
const OUTPUT = process.argv[2] || path.join(ROOT, 'zhanqi.zip');

// 需要包含的文件/目录（白名单）
const INCLUDE = [
  'server.js',
  'package.json',
  'index.html',
  'diy.html',
  'README.md',
  'css/',
  'js/',
  'fonts/',
  'assets/',
  'portraits/',
  'diy.json',
  '.gitignore',
];

// 需要排除的模式
const EXCLUDE_PATTERNS = [
  /\.git\//,
  /node_modules\//,
  /\.local\//,
  /\.agents\//,
  /\.replit$/,
  /replit\.md$/,
  /replit\.nix$/,
  /sessions\.json$/,
  /users\.json$/,
  /package-lock\.json$/,
  /Thumbs\.db$/,
  /\.DS_Store$/,
  /~$/,
];

function shouldExclude(relPath) {
  const p = relPath.replace(/\\/g, '/');
  return EXCLUDE_PATTERNS.some(re => re.test(p));
}

function walkDir(dir, baseDir, files) {
  baseDir = baseDir || dir;
  files = files || [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (shouldExclude(relPath)) continue;
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, files);
    } else if (entry.isFile()) {
      files.push({ fullPath, relPath });
    }
  }
  return files;
}

function collectFiles() {
  const files = [];
  for (const item of INCLUDE) {
    const fullPath = path.join(ROOT, item);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, ROOT, files);
    } else if (stat.isFile()) {
      if (!shouldExclude(item)) {
        files.push({ fullPath, relPath: item });
      }
    }
  }
  // 去重
  const seen = new Set();
  return files.filter(f => {
    if (seen.has(f.relPath)) return false;
    seen.add(f.relPath);
    return true;
  });
}

async function build() {
  console.log('正在收集文件...');
  const files = collectFiles();
  console.log(`共 ${files.length} 个文件`);

  const zip = new JSZip();
  // 包一层 zhanqi/ 目录，和 GitHub 下载的 zip 结构一致
  const folder = zip.folder('zhanqi');

  for (const { fullPath, relPath } of files) {
    const content = fs.readFileSync(fullPath);
    const zipPath = relPath.replace(/\\/g, '/');
    folder.file(zipPath, content);
    process.stdout.write(`  + ${zipPath}\n`);
  }

  console.log('\n正在压缩...');
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  fs.writeFileSync(OUTPUT, buf);
  const sizeKB = (buf.length / 1024).toFixed(1);
  console.log(`\n✅ 打包完成：${OUTPUT}（${sizeKB} KB）`);
}

build().catch(e => {
  console.error('打包失败:', e);
  process.exit(1);
});
