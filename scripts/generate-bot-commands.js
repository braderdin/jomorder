#!/usr/bin/env node
// Start: Phase 70 - Dynamic bot_commands.json Generator (SSOT from types.ts)
// Membaca NATIVE_COMMAND_LIST dari src/types.ts dan menjana src/bot_commands.json
// (Fasal 4 SOA: Single Source of Truth untuk definisi perintah bot)
'use strict';

const fs = require('fs');
const path = require('path');

const typesPath = path.join(__dirname, '..', 'src', 'types.ts');
const outputPath = path.join(__dirname, '..', 'src', 'bot_commands.json');

// Baca kandungan types.ts
let typesContent;
try {
  typesContent = fs.readFileSync(typesPath, 'utf8');
} catch (err) {
  console.error('[ERROR] Failed to read src/types.ts:', err.message);
  process.exit(1);
}

// Ekstrak NATIVE_COMMAND_LIST menggunakan regex
// Mencari array [ { command: '/xxx', description: 'yyy', role: 'zzz' }, ... ]
const nativeCommandMatch = typesContent.match(
  /export const NATIVE_COMMAND_LIST: TelegramBotCommand\[\]\s*=\s*\[([\s\S]*?)\];/
);

if (!nativeCommandMatch) {
  console.error('[ERROR] Could not find NATIVE_COMMAND_LIST in types.ts');
  process.exit(1);
}

const arrayContent = nativeCommandMatch[1];

// Parse setiap objek command
const commands = [];
const commandRegex = /\{\s*command:\s*'([^']+)',\s*description:\s*'([^']+)',\s*role:\s*'([^']+)'\s*\}/g;

let match;
while ((match = commandRegex.exec(arrayContent)) !== null) {
  commands.push({
    command: match[1],
    description: match[2]
  });
}

if (commands.length === 0) {
  console.error('[ERROR] No commands extracted from NATIVE_COMMAND_LIST');
  process.exit(1);
}

// Tulis ke bot_commands.json
try {
  fs.writeFileSync(outputPath, JSON.stringify(commands, null, 2) + '\n');
  console.log(`[PASS] Generated ${commands.length} commands to ${outputPath}`);
  console.log(`[PASS] Commands: ${commands.map(c => c.command).join(', ')}`);
} catch (err) {
  console.error('[ERROR] Failed to write bot_commands.json:', err.message);
  process.exit(1);
}
// End: Phase 70 - Dynamic bot_commands.json Generator