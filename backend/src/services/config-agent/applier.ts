import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getIntakeStore } from '../intake-store/store.js';
import { reloadConfig } from '../../config/loader.js';
import type { ConfigChangeType } from '../../intake-store-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(__dirname, '../../../../../config');

export async function applyApprovedChange(configChangeId: string, reviewedBy: string, reason?: string): Promise<void> {
  const store = getIntakeStore();
  const change = store.getConfigChangeLogById(configChangeId);
  if (!change) throw new Error('Propuesta no encontrada');
  if (change.change_type !== 'proposed') throw new Error('Solo se pueden aplicar propuestas pendientes');

  const diff = JSON.parse(change.diff) as { jsonpath: string; before: unknown; after: unknown };
  const filePath = resolve(CONFIG_DIR, change.config_file);
  const raw = readFileSync(filePath, 'utf-8');
  const config = JSON.parse(raw) as Record<string, unknown>;

  applyJsonPath(config, diff.jsonpath, diff.after);

  copyFileSync(filePath, `${filePath}.bak.${Date.now()}`);
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');

  store.updateConfigChangeDecision(configChangeId, {
    change_type: 'applied' as ConfigChangeType,
    reviewed_by: reviewedBy,
    reason,
  });

  reloadConfig();
  console.log(`[ConfigAgent] Cambio ${configChangeId} aplicado en ${change.config_file}`);
}

function applyJsonPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.replace(/\[(['"]?)(\w+)\1\]/g, '.$2').split('.').filter(Boolean);
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) current[parts[i]] = {};
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
