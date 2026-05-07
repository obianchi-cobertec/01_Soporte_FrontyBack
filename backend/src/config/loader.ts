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
  examples_negative?: string[];
  decision_rules?: string[];
  confusion_with?: string[];
}

export interface TaxonomyObjectValue {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  examples?: string[];
}

export interface TaxonomyActionValue {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  examples?: string[];
}

export interface TaxonomyConfig {
  version: string;
  nature: { values: TaxonomyNatureValue[] };
  domain: { values: TaxonomyDomainValue[] };
  object?: { description: string; values: TaxonomyObjectValue[] };
  action?: { description: string; values: TaxonomyActionValue[] };
}

export interface SolutionResolutionRule {
  solution: string;
  keywords_any?: string[];
  block_any?: string[];
  priority: number;
  weight: number;
}

export interface ExpertisModuleRule {
  module_expertis: string;
  keywords_any: string[];
}

export interface ExpertisModuleResolution {
  applies_when_solution: string;
  priority_hint: string[];
  residual_modules: string[];
  rules: ExpertisModuleRule[];
  default: string;
}

export interface NeedResolutionRule {
  nature: string;
  need: string;
  object_contains?: string;
  action_contains?: string;
}

export interface RedmineMappingConfig {
  version: string;
  need_resolution?: { rules: NeedResolutionRule[]; default: string };
  solution_resolution?: { rules: SolutionResolutionRule[]; default: string };
  expertis_module_resolution?: ExpertisModuleResolution;
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
    default_assignee_id?: number | null;
    unassignable_fallback_assignee_id?: number | null;
    /** Role ID que se asigna al staff de Cobertec cuando se les añade a un proyecto de cliente.
     *  Default: 4 (Developer en Redmine estándar). Cambiar si Cobertec usa un role distinto. */
    support_role_id?: number;
  };
  custom_fields: Record<string, { id: string; name: string }>;
  company_to_project: Record<string, string>;
  role_to_user_id?: Record<string, number>;
  billable_rules?: BillableRulesConfig;
}

export interface BillableRuleConfig {
  nature: string;
  domains?: string[];
  min_cost_eur: number;
  requires_disambiguation?: boolean;
  disambiguation_question_id?: string;
  billable_when_answer?: string;
}

export interface DisambiguationQuestionOption {
  id: string;
  label: string;
}

export interface DisambiguationQuestionConfig {
  question: string;
  options: DisambiguationQuestionOption[];
}

export interface BillableRulesConfig {
  default_min_cost_eur: number;
  notice_template: string;
  rules: BillableRuleConfig[];
  disambiguation_questions: Record<string, DisambiguationQuestionConfig>;
}

export interface AssignmentRule {
  priority: number;
  block: string;
  module: string;
  need: string;
  assignee: string;
  solution?: string;
  nature?: string; // si está presente, la regla solo aplica cuando classification.nature coincide (soporta "*")
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
  rol_funcional?: Record<string, string>;
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

export function reloadConfig(): void {
  taxonomyCache = null;
  redmineMappingCache = null;
  assignmentCache = null;
}