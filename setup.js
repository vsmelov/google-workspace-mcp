#!/usr/bin/env node
// Проверка готовности к запуску: node, зависимости, ключ сервисного аккаунта.
//
//     node setup.js
//
// Ничего не скачивает и никуда не отправляет. Ключ только читается локально —
// содержимое не печатается, наружу не уходит.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OK = '[ok]', WARN = '[ ! ]', BAD = '[x ]';
const problems = [];

const say = (mark, text, hint) => {
  console.log(` ${mark} ${text}`);
  if (hint) console.log(`      ${hint}`);
};
const fail = (text, hint) => { say(BAD, text, hint); problems.push(text); };

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) say(OK, `Node ${process.versions.node}`);
  else fail(`Node ${process.versions.node} — нужен 18+`, 'обнови Node: nodejs.org');
}

function checkDeps() {
  if (!existsSync(join(ROOT, 'node_modules'))) {
    fail('зависимости не установлены', 'npm install');
    return;
  }
  const missing = ['@modelcontextprotocol/sdk', 'googleapis', 'zod']
    .filter((p) => !existsSync(join(ROOT, 'node_modules', ...p.split('/'))));
  if (missing.length) fail('не хватает пакетов: ' + missing.join(', '), 'npm install');
  else say(OK, 'зависимости установлены');
}

function checkKey() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    fail(
      'GOOGLE_APPLICATION_CREDENTIALS не задан',
      'путь к JSON-ключу сервисного аккаунта; как его сделать — в README, раздел «Google Cloud»',
    );
    return null;
  }
  if (!existsSync(keyFile)) {
    fail(`ключ не найден: ${keyFile}`, 'проверь путь в GOOGLE_APPLICATION_CREDENTIALS');
    return null;
  }

  let data;
  try {
    data = JSON.parse(readFileSync(keyFile, 'utf8'));
  } catch (e) {
    fail(`ключ не читается как JSON: ${e.message}`, 'скачай ключ заново в Google Cloud Console');
    return null;
  }

  if (data.type !== 'service_account') {
    fail(
      `это не ключ сервисного аккаунта (type: ${data.type})`,
      'нужен именно service account key, не OAuth client',
    );
    return null;
  }

  say(OK, `ключ сервисного аккаунта: ${data.client_email}`);
  if (keyFile.startsWith(ROOT)) {
    say(WARN, 'ключ лежит внутри репозитория',
      'перенеси его наружу — так он не попадёт в git даже случайно');
  }
  return data.client_email;
}

function main() {
  console.log(`\ngoogle-workspace-mcp — проверка окружения\n${ROOT}\n`);
  checkNode();
  checkDeps();
  const email = checkKey();

  if (problems.length) {
    console.log(`\nНе готово, ${problems.length} пункт(ов):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }

  console.log('\nВсё на месте.\n');
  console.log(`Не забудь: сервер видит ТОЛЬКО те файлы и папки Drive, которые`);
  console.log(`расшарены на ${email} — как на обычного пользователя.\n`);
  console.log('Подключить к Claude Code:\n');
  console.log(
    `  claude mcp add --scope user gworkspace ` +
    `-e GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS} ` +
    `-- node "${join(ROOT, 'index.js')}"\n`,
  );
}

main();
