const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
for (const directory of ['api', 'frontend/scripts', 'scripts', 'test']) {
  for (const file of readdirSync(directory).filter(name => name.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', join(directory, file)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('JavaScript syntax checks passed');
