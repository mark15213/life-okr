const fs = require('node:fs');
const path = require('node:path');

// Atomic replacement means a process crash cannot leave half of a JSON document.
function save(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}

function read(file, restore, fallback) {
  if (!fs.existsSync(file)) return { state: fallback(), recovered: false };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const recovered = Boolean(raw.current);
    return { state: restore(raw), recovered };
  } catch {
    // Preserve the original for recovery rather than silently overwriting user records.
    const backup = `${file}.damaged-${Date.now()}`;
    fs.copyFileSync(file, backup);
    return { state: fallback(), recovered: false, error: `本地数据无法读取，原文件已备份：${backup}` };
  }
}
module.exports = { save, read };
