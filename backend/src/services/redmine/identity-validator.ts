import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RedmineMappingConfig } from '../../config/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(__dirname, '../../../../config');

interface CobertecUser {
  id: number;
  login: string;
  name: string;
  email: string;
}

interface CobertecUsersFile {
  users: CobertecUser[];
}

function loadCobertecUsers(): Set<number> {
  const filepath = resolve(CONFIG_DIR, 'cobertec-users.json');
  const raw = readFileSync(filepath, 'utf-8');
  const data = JSON.parse(raw) as CobertecUsersFile;
  return new Set(data.users.map(u => u.id));
}

const VALID_IDS: Set<number> = loadCobertecUsers();

export function validateRedmineMapping(mapping: RedmineMappingConfig): {
  valid: boolean;
  orphanIds: Array<{ role: string; id: number }>;
} {
  const orphans: Array<{ role: string; id: number }> = [];

  if (mapping.role_to_user_id) {
    for (const [role, id] of Object.entries(mapping.role_to_user_id)) {
      if (typeof id === 'number' && !VALID_IDS.has(id)) {
        orphans.push({ role, id });
      }
    }
  }

  const defaultId = mapping.redmine_defaults?.default_assignee_id;
  if (typeof defaultId === 'number' && !VALID_IDS.has(defaultId)) {
    orphans.push({ role: 'default_assignee_id', id: defaultId });
  }

  const fallbackId = mapping.redmine_defaults?.unassignable_fallback_assignee_id;
  if (typeof fallbackId === 'number' && !VALID_IDS.has(fallbackId)) {
    orphans.push({ role: 'unassignable_fallback_assignee_id', id: fallbackId });
  }

  return { valid: orphans.length === 0, orphanIds: orphans };
}

export function lookupCobertecUser(id: number): CobertecUser | null {
  const filepath = resolve(CONFIG_DIR, 'cobertec-users.json');
  const raw = readFileSync(filepath, 'utf-8');
  const data = JSON.parse(raw) as CobertecUsersFile;
  return data.users.find(u => u.id === id) ?? null;
}
