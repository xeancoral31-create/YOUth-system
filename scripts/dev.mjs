import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const server = spawn(npmCmd, ['--prefix', 'server', 'run', 'dev'], { stdio: 'inherit', shell: isWin });
const client = spawn(npmCmd, ['--prefix', 'client', 'run', 'dev'], { stdio: 'inherit', shell: isWin });

function shutdown() {
  server.kill();
  client.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
