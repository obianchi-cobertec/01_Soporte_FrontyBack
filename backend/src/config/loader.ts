import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(__dirname, '../../../config');

export interface TaxonomyNatureValue {
  id: string;
  label: string;
  description: string;
  examples?: string[];
  examples_positive?: string[];
  examples_negative?: string[];
  keywords_positive?: string[];
  keywords_negative?: string[];
  decision_rules?: string[];
  confusion_with?: string[];
}

export interface TaxonomyDomainValue {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  keywords_positive?: string[];
  keywords_negative?: string[];
  examples?: string[];
  examples_positive?: string[];
  decision_rules?: string[];
  confusion_with?: string[];
}

export interface TaxonomyConfig {
  version: string;
  nature: { values: TaxonomyNatureValue[] };
  domain: { values: TaxonomyDomainValue[] };
  object?: { description: string; values: string[] };
  action?: { description: string; values: string[] };
}

export interface RedmineMappingConfig {
  version: string;
  need_resolution?: { rules: Array<Record<string, string>>; default: string };
  domain_to_block?: Record<string, string>;
  domain_to_module?: Record<string, string>;
  special_module_rules?: Array<Record<string, string>>;
  need_catalogue?: Record<string, string>;
  nature_to_redmine_need?: Record<string, string>;
  domain_to_redmine_block?: Record<string, string>;
  domain_to_redmine_module?: Record<string, string>;
  priority_mapping: Record<string, string>;
  redmine_defaults: {
    tracker_id: string;
    status_id_initial: string;
    default_assignee?: string;
    default_assignee_id?: string;
  };
  custom_fields: Record<string, { id: string; name: string }>;
  company_to_project: Record<string, string>;
}

export interface AssignmentRule {
  priority: number;
  block: string;
  module: string;
  need: string;
  assignee: string;
  condition?: Record<string, string>;
  assignee_id?: string;
  comment?: string;
}

export interface AssignmentConfig {
  version: string;
  master_rules?: AssignmentRule[];
  rules?: AssignmentRule[];
  default_assignee?: string;
  default_assignee_id?: string;
  assignee_names?: Record<string, string>;
  review_status_overrides: Record<string, string>;
}

function loadJSON<T>(filename: string): T {
  const filepath = resolve(CONFIG_DIR, filename);
  const raw = readFileSync(filepath, 'utf-8');
  return JSON.parse(raw) as T;
}

let taxonomyCache: TaxonomyConfig | null = null;
let redmineMappingCache: RedmineMappingConfig | null = null;
let assignmentCache: AssignmentConfig | null = null;

export function getTaxonomy(): TaxonomyConfig {
  if (!taxonomyCache) {
    taxonomyCache = loadJSON<TaxonomyConfig>('taxonomy.json');
  }
  return taxonomyCache;
}

export function getRedmineMapping(): RedmineMappingConfig {
  if (!redmineMappingCache) {
    redmineMappingCache = loadJSON<RedmineMappingConfig>('redmine-mapping.json');
  }
  return redmineMappingCache;
}

export function getAssignmentRules(): AssignmentConfig {
  if (!assignmentCache) {
    assignmentCache = loadJSON<AssignmentConfig>('assignment-rules.json');
  }
  return assignmentCache;
}

/** Fuerza recarga de configuración (útil para tests o hot-reload en piloto) */
export function reloadConfig(): void {
  taxonomyCache = null;
  redmineMappingCache = null;
  assignmentCache = null;
}
