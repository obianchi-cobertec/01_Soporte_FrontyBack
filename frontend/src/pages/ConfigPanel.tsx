import { useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '../services/auth-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxonomyValue {
  id: string;
  label: string;
  description: string;
  keywords_positive: string[];
  keywords_negative: string[];
  decision_rules: string[];
  confusion_with: string[];
  examples_positive: string[];
  examples_negative: string[];
}

interface Taxonomy {
  nature: { description: string; values: TaxonomyValue[] };
  domain: { description: string; values: TaxonomyValue[] };
}

interface SolutionRule {
  solution: string;
  weight: number;
  priority: number;
  keywords_any: string[];
}

interface ExpertisModuleRule {
  module_expertis: string;
  keywords_any: string[];
}

interface NeedCatalogue {
  [id: string]: string;
}

interface NeedResolutionRule {
  nature: string;
  need: string;
  action_contains?: string;
  object_contains?: string;
}

interface RedmineMapping {
  need_catalogue: NeedCatalogue;
  need_resolution: { description: string; rules: NeedResolutionRule[]; default: string };
  solution_resolution: { description: string; rules: SolutionRule[]; default: string };
  expertis_module_resolution: { rules: ExpertisModuleRule[] };
  domain_to_block: Record<string, string>;
  custom_fields: Record<string, { id: string; name: string }>;
  redmine_defaults: { tracker_id: string; status_id_initial: string; default_assignee: string };
  priority_mapping: Record<string, string>;
  role_to_user_id: Record<string, number>;
  [key: string]: unknown;
}

interface MasterRule {
  priority: number;
  block: string;
  module: string;
  need: string;
  solution: string;
  assignee: string;
  _comment?: string;
}

interface AssignmentRules {
  master_rules: (MasterRule | { _comment: string })[];
  rol_funcional: Record<string, string>;
  default_assignee: string;
  review_status_overrides: Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BILLABLE_NEEDS = ['campo', 'sacarcampo', 'infor', 'modificar-informe'];

const TABS = [
  { id: 'taxonomy', label: 'Taxonomía' },
  { id: 'solutions', label: 'Soluciones' },
  { id: 'needs', label: 'Necesidades' },
  { id: 'assignment', label: 'Asignación' },
  { id: 'redmine', label: 'Redmine' },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadConfig(file: string) {
  const res = await authenticatedFetch<unknown>(`/config/${file}`);
  return res;
}

async function saveConfig(file: string, data: unknown) {
  await authenticatedFetch(`/config/${file}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TagList({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
      setInput('');
    }
  };

  return (
    <div className="tag-list">
      <div className="tags">
        {tags.map((t, i) => (
          <span key={i} className="tag">
            {t}
            <button
              className="tag-remove"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              title="Eliminar"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder ?? 'Añadir...'}
          className="tag-input"
        />
        <button onClick={add} className="btn-sm">+</button>
      </div>
    </div>
  );
}

function LineList({
  lines,
  onChange,
  placeholder,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (v) { onChange([...lines, v]); setInput(''); }
  };

  return (
    <div className="line-list">
      {lines.map((l, i) => (
        <div key={i} className="line-item">
          <input
            value={l}
            onChange={e => {
              const copy = [...lines];
              copy[i] = e.target.value;
              onChange(copy);
            }}
            className="line-input"
          />
          <button onClick={() => onChange(lines.filter((_, j) => j !== i))} className="btn-icon" title="Eliminar">
            🗑
          </button>
        </div>
      ))}
      <div className="tag-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder ?? 'Nueva entrada...'}
          className="tag-input"
        />
        <button onClick={add} className="btn-sm">+</button>
      </div>
    </div>
  );
}

function TaxonomyValueEditor({
  value,
  onChange,
  onDelete,
}: {
  value: TaxonomyValue;
  onChange: (v: TaxonomyValue) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const u = <K extends keyof TaxonomyValue>(k: K, v: TaxonomyValue[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="card">
      <div className="card-header" onClick={() => setOpen(o => !o)}>
        <div className="card-header-left">
          <span className="expand-icon">{open ? '▾' : '▸'}</span>
          <code className="id-badge">{value.id}</code>
          <span className="card-label">{value.label}</span>
        </div>
        <button className="btn-danger-sm" onClick={e => { e.stopPropagation(); onDelete(); }} title="Eliminar">
          Eliminar
        </button>
      </div>
      {open && (
        <div className="card-body">
          <div className="field-row">
            <label>ID</label>
            <input value={value.id} onChange={e => u('id', e.target.value)} className="text-input" />
          </div>
          <div className="field-row">
            <label>Etiqueta</label>
            <input value={value.label} onChange={e => u('label', e.target.value)} className="text-input" />
          </div>
          <div className="field-row">
            <label>Descripción</label>
            <textarea value={value.description} onChange={e => u('description', e.target.value)} className="textarea" rows={2} />
          </div>
          <div className="field-row">
            <label>Keywords positivas</label>
            <TagList tags={value.keywords_positive} onChange={v => u('keywords_positive', v)} placeholder="keyword positiva..." />
          </div>
          <div className="field-row">
            <label>Keywords negativas</label>
            <TagList tags={value.keywords_negative} onChange={v => u('keywords_negative', v)} placeholder="keyword negativa..." />
          </div>
          <div className="field-row">
            <label>Reglas de decisión</label>
            <LineList lines={value.decision_rules} onChange={v => u('decision_rules', v)} placeholder="Nueva regla..." />
          </div>
          <div className="field-row">
            <label>Confusión con</label>
            <TagList tags={value.confusion_with} onChange={v => u('confusion_with', v)} placeholder="id de naturaleza/dominio..." />
          </div>
          <div className="field-row">
            <label>Ejemplos positivos</label>
            <LineList lines={value.examples_positive} onChange={v => u('examples_positive', v)} placeholder="Ejemplo positivo..." />
          </div>
          <div className="field-row">
            <label>Ejemplos negativos</label>
            <LineList lines={value.examples_negative} onChange={v => u('examples_negative', v)} placeholder="Ejemplo negativo..." />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function TaxonomyTab({ taxonomy, onChange }: { taxonomy: Taxonomy; onChange: (t: Taxonomy) => void }) {
  const [section, setSection] = useState<'nature' | 'domain'>('nature');
  const values = taxonomy[section].values;

  const updateValue = (i: number, v: TaxonomyValue) => {
    const copy = { ...taxonomy };
    copy[section] = { ...copy[section], values: values.map((x, j) => (j === i ? v : x)) };
    onChange(copy);
  };
  const deleteValue = (i: number) => {
    const copy = { ...taxonomy };
    copy[section] = { ...copy[section], values: values.filter((_, j) => j !== i) };
    onChange(copy);
  };
  const addValue = () => {
    const blank: TaxonomyValue = {
      id: 'nuevo_' + Date.now(),
      label: 'Nueva entrada',
      description: '',
      keywords_positive: [],
      keywords_negative: [],
      decision_rules: [],
      confusion_with: [],
      examples_positive: [],
      examples_negative: [],
    };
    const copy = { ...taxonomy };
    copy[section] = { ...copy[section], values: [...values, blank] };
    onChange(copy);
  };

  return (
    <div>
      <div className="section-tabs">
        <button className={`section-tab ${section === 'nature' ? 'active' : ''}`} onClick={() => setSection('nature')}>
          Naturalezas ({taxonomy.nature.values.length})
        </button>
        <button className={`section-tab ${section === 'domain' ? 'active' : ''}`} onClick={() => setSection('domain')}>
          Dominios ({taxonomy.domain.values.length})
        </button>
      </div>
      <div className="values-list">
        {values.map((v, i) => (
          <TaxonomyValueEditor key={v.id + i} value={v} onChange={val => updateValue(i, val)} onDelete={() => deleteValue(i)} />
        ))}
      </div>
      <button className="btn-add" onClick={addValue}>+ Añadir {section === 'nature' ? 'naturaleza' : 'dominio'}</button>
    </div>
  );
}

function SolutionsTab({ mapping, onChange }: { mapping: RedmineMapping; onChange: (m: RedmineMapping) => void }) {
  const rules = mapping.solution_resolution.rules;
  const emRules = mapping.expertis_module_resolution.rules;

  const updateRule = (i: number, rule: SolutionRule) => {
    const newRules = rules.map((r, j) => (j === i ? rule : r));
    onChange({ ...mapping, solution_resolution: { ...mapping.solution_resolution, rules: newRules } });
  };

  const updateEmRule = (i: number, rule: ExpertisModuleRule) => {
    const newRules = emRules.map((r, j) => (j === i ? rule : r));
    onChange({ ...mapping, expertis_module_resolution: { rules: newRules } });
  };

  return (
    <div>
      <h3 className="section-title">Soluciones asociadas</h3>
      <p className="section-desc">Pesos y keywords para resolución de solución. El LLM usa los pesos como sesgo probabilístico.</p>
      {rules.map((rule, i) => (
        <div key={i} className="card flat">
          <div className="inline-fields">
            <div className="field-inline">
              <label>Solución</label>
              <input value={rule.solution} onChange={e => updateRule(i, { ...rule, solution: e.target.value })} className="text-input" />
            </div>
            <div className="field-inline narrow">
              <label>Peso</label>
              <input type="number" step="0.01" min="0" max="1" value={rule.weight}
                onChange={e => updateRule(i, { ...rule, weight: parseFloat(e.target.value) || 0 })}
                className="text-input" />
            </div>
            <div className="field-inline narrow">
              <label>Prioridad</label>
              <input type="number" min="1" value={rule.priority}
                onChange={e => updateRule(i, { ...rule, priority: parseInt(e.target.value) || 1 })}
                className="text-input" />
            </div>
          </div>
          <div className="field-row mt-sm">
            <label>Keywords</label>
            <TagList tags={rule.keywords_any} onChange={kw => updateRule(i, { ...rule, keywords_any: kw })} placeholder="keyword..." />
          </div>
        </div>
      ))}

      <h3 className="section-title mt-lg">Módulos Expertis</h3>
      <p className="section-desc">Keywords para identificar el módulo Expertis afectado.</p>
      {emRules.map((rule, i) => (
        <div key={i} className="card flat">
          <div className="field-inline">
            <label>Módulo</label>
            <input value={rule.module_expertis}
              onChange={e => updateEmRule(i, { ...rule, module_expertis: e.target.value })}
              className="text-input" />
          </div>
          <div className="field-row mt-sm">
            <label>Keywords</label>
            <TagList tags={rule.keywords_any} onChange={kw => updateEmRule(i, { ...rule, keywords_any: kw })} placeholder="keyword..." />
          </div>
        </div>
      ))}
    </div>
  );
}

function NeedsTab({ mapping, onChange }: { mapping: RedmineMapping; onChange: (m: RedmineMapping) => void }) {
  const catalogue = mapping.need_catalogue;
  const rules = mapping.need_resolution.rules;

  const [newId, setNewId] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const updateLabel = (id: string, label: string) => {
    onChange({ ...mapping, need_catalogue: { ...catalogue, [id]: label } });
  };

  const deleteNeed = (id: string) => {
    const copy = { ...catalogue };
    delete copy[id];
    onChange({ ...mapping, need_catalogue: copy });
  };

  const addNeed = () => {
    if (!newId.trim() || !newLabel.trim()) return;
    onChange({ ...mapping, need_catalogue: { ...catalogue, [newId.trim()]: newLabel.trim() } });
    setNewId(''); setNewLabel('');
  };

  const updateRule = (i: number, rule: NeedResolutionRule) => {
    const newRules = rules.map((r, j) => (j === i ? rule : r));
    onChange({ ...mapping, need_resolution: { ...mapping.need_resolution, rules: newRules } });
  };

  const deleteRule = (i: number) => {
    const newRules = rules.filter((_, j) => j !== i);
    onChange({ ...mapping, need_resolution: { ...mapping.need_resolution, rules: newRules } });
  };

  const addRule = () => {
    const newRules = [...rules, { nature: '', need: '' } as NeedResolutionRule];
    onChange({ ...mapping, need_resolution: { ...mapping.need_resolution, rules: newRules } });
  };

  return (
    <div>
      <h3 className="section-title">Catálogo de necesidades</h3>
      <p className="section-desc">
        Las marcadas con <span className="billable-badge">€</span> son facturables (aviso al usuario).
      </p>
      <div className="need-catalogue">
        {Object.entries(catalogue).map(([id, label]) => (
          <div key={id} className="need-row">
            <code className={`id-badge ${BILLABLE_NEEDS.includes(id) ? 'billable' : ''}`}>
              {id}
              {BILLABLE_NEEDS.includes(id) && <span className="billable-badge"> €</span>}
            </code>
            <input value={label} onChange={e => updateLabel(id, e.target.value)} className="text-input flex-1" />
            <button onClick={() => deleteNeed(id)} className="btn-icon" title="Eliminar">🗑</button>
          </div>
        ))}
        <div className="need-row new-row">
          <input value={newId} onChange={e => setNewId(e.target.value)} placeholder="id (sin espacios)" className="text-input narrow" />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Etiqueta / pregunta" className="text-input flex-1"
            onKeyDown={e => { if (e.key === 'Enter') addNeed(); }} />
          <button onClick={addNeed} className="btn-sm">+ Añadir</button>
        </div>
      </div>

      <h3 className="section-title mt-lg">Reglas de resolución de necesidad</h3>
      <p className="section-desc">Mapeo naturaleza → necesidad, opcionalmente condicionado por action_contains / object_contains.</p>
      <div className="rules-table">
        <div className="rules-header">
          <span>Naturaleza</span><span>action_contains</span><span>object_contains</span><span>Need</span><span></span>
        </div>
        {rules.map((rule, i) => (
          <div key={i} className="rules-row">
            <input value={rule.nature} onChange={e => updateRule(i, { ...rule, nature: e.target.value })} className="text-input" placeholder="nature id" />
            <input value={rule.action_contains ?? ''} onChange={e => updateRule(i, { ...rule, action_contains: e.target.value || undefined })} className="text-input" placeholder="opcional" />
            <input value={rule.object_contains ?? ''} onChange={e => updateRule(i, { ...rule, object_contains: e.target.value || undefined })} className="text-input" placeholder="opcional" />
            <input value={rule.need} onChange={e => updateRule(i, { ...rule, need: e.target.value })} className="text-input" placeholder="need id" />
            <button onClick={() => deleteRule(i)} className="btn-icon" title="Eliminar">🗑</button>
          </div>
        ))}
      </div>
      <button className="btn-add" onClick={addRule}>+ Añadir regla</button>
    </div>
  );
}

function AssignmentTab({ rules, onChange }: { rules: AssignmentRules; onChange: (r: AssignmentRules) => void }) {
  const masterRules = rules.master_rules.filter(r => !('_comment' in r)) as MasterRule[];

  const updateMasterRule = (i: number, rule: MasterRule) => {
    // Preserva los _comment entries
    let idx = -1;
    let count = 0;
    for (let j = 0; j < rules.master_rules.length; j++) {
      if (!('_comment' in rules.master_rules[j])) {
        if (count === i) { idx = j; break; }
        count++;
      }
    }
    if (idx === -1) return;
    const copy = [...rules.master_rules];
    copy[idx] = rule;
    onChange({ ...rules, master_rules: copy });
  };

  const deleteMasterRule = (i: number) => {
    let idx = -1;
    let count = 0;
    for (let j = 0; j < rules.master_rules.length; j++) {
      if (!('_comment' in rules.master_rules[j])) {
        if (count === i) { idx = j; break; }
        count++;
      }
    }
    if (idx === -1) return;
    const copy = rules.master_rules.filter((_, j) => j !== idx);
    onChange({ ...rules, master_rules: copy });
  };

  const addMasterRule = () => {
    const newRule: MasterRule = { priority: 3, block: '*', module: '*', need: '*', solution: '*', assignee: rules.default_assignee };
    onChange({ ...rules, master_rules: [...rules.master_rules, newRule] });
  };

  const [newRoleId, setNewRoleId] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');

  const addRole = () => {
    if (!newRoleId.trim() || !newRoleLabel.trim()) return;
    onChange({ ...rules, rol_funcional: { ...rules.rol_funcional, [newRoleId.trim()]: newRoleLabel.trim() } });
    setNewRoleId(''); setNewRoleLabel('');
  };

  return (
    <div>
      <h3 className="section-title">Reglas maestras de asignación</h3>
      <p className="section-desc">
        Prioridad 1 = bloque+módulo exacto · 2 = bloque+need o catch-all · 3 = genérica por need. Usa <code>*</code> como comodín.
      </p>
      <div className="rules-table wide">
        <div className="rules-header">
          <span>Pri</span><span>Bloque</span><span>Módulo</span><span>Need</span><span>Solución</span><span>Assignee</span><span></span>
        </div>
        {masterRules.map((rule, i) => (
          <div key={i} className="rules-row">
            <input type="number" min="1" max="3" value={rule.priority}
              onChange={e => updateMasterRule(i, { ...rule, priority: parseInt(e.target.value) || 1 })}
              className="text-input narrow" />
            <input value={rule.block} onChange={e => updateMasterRule(i, { ...rule, block: e.target.value })} className="text-input" />
            <input value={rule.module} onChange={e => updateMasterRule(i, { ...rule, module: e.target.value })} className="text-input" />
            <input value={rule.need} onChange={e => updateMasterRule(i, { ...rule, need: e.target.value })} className="text-input" />
            <input value={rule.solution} onChange={e => updateMasterRule(i, { ...rule, solution: e.target.value })} className="text-input" />
            <input value={rule.assignee} onChange={e => updateMasterRule(i, { ...rule, assignee: e.target.value })} className="text-input" />
            <button onClick={() => deleteMasterRule(i)} className="btn-icon" title="Eliminar">🗑</button>
          </div>
        ))}
      </div>
      <button className="btn-add" onClick={addMasterRule}>+ Añadir regla</button>

      <h3 className="section-title mt-lg">Roles funcionales</h3>
      <p className="section-desc">Mapa id → nombre legible. El assignee de las reglas maestras referencia estos IDs.</p>
      <div className="need-catalogue">
        {Object.entries(rules.rol_funcional).map(([id, label]) => (
          <div key={id} className="need-row">
            <code className="id-badge">{id}</code>
            <input value={label}
              onChange={e => onChange({ ...rules, rol_funcional: { ...rules.rol_funcional, [id]: e.target.value } })}
              className="text-input flex-1" />
            <button onClick={() => {
              const copy = { ...rules.rol_funcional };
              delete copy[id];
              onChange({ ...rules, rol_funcional: copy });
            }} className="btn-icon" title="Eliminar">🗑</button>
          </div>
        ))}
        <div className="need-row new-row">
          <input value={newRoleId} onChange={e => setNewRoleId(e.target.value)} placeholder="id_rol" className="text-input narrow" />
          <input value={newRoleLabel} onChange={e => setNewRoleLabel(e.target.value)} placeholder="Nombre legible"
            className="text-input flex-1" onKeyDown={e => { if (e.key === 'Enter') addRole(); }} />
          <button onClick={addRole} className="btn-sm">+ Añadir</button>
        </div>
      </div>

      <h3 className="section-title mt-lg">Assignee por defecto</h3>
      <input value={rules.default_assignee}
        onChange={e => onChange({ ...rules, default_assignee: e.target.value })}
        className="text-input" style={{ maxWidth: 320 }} />
    </div>
  );
}

function RedmineTab({ mapping, onChange }: { mapping: RedmineMapping; onChange: (m: RedmineMapping) => void }) {
  const [redmineUsers, setRedmineUsers] = useState<{ id: number; login: string; name: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    setUsersLoading(true);
    authenticatedFetch<{ id: number; login: string; name: string }[]>('/config/redmine-users')
      .then(data => setRedmineUsers(Array.isArray(data) ? data : []))
      .catch(() => setRedmineUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  const customFields = mapping.custom_fields;
  const domainToBlock = mapping.domain_to_block;
  const defaults = mapping.redmine_defaults;

  const updateCF = (key: string, field: 'id' | 'name', value: string) => {
    onChange({
      ...mapping,
      custom_fields: { ...customFields, [key]: { ...customFields[key], [field]: value } },
    });
  };

  const updateBlock = (domain: string, block: string) => {
    onChange({ ...mapping, domain_to_block: { ...domainToBlock, [domain]: block } });
  };

  return (
    <div>
      <h3 className="section-title">Campos custom de Redmine</h3>
      <p className="section-desc">
        IDs de los campos custom de tu instancia Redmine. Los valores <code>__CF_*__</code> son placeholders hasta que tengas acceso.
      </p>
      <div className="need-catalogue">
        <div className="need-row header-row">
          <span className="id-badge">Clave</span>
          <span className="flex-1">Nombre Redmine</span>
          <span style={{ width: 180 }}>ID Redmine</span>
        </div>
        {Object.entries(customFields).map(([key, cf]) => (
          <div key={key} className="need-row">
            <code className="id-badge">{key}</code>
            <input value={cf.name} onChange={e => updateCF(key, 'name', e.target.value)} className="text-input flex-1" />
            <input value={String(cf.id)} onChange={e => updateCF(key, 'id', e.target.value)}
              className={`text-input ${String(cf.id).startsWith('__') ? 'pending' : ''}`}
              style={{ width: 180 }} placeholder="ID numérico" />
          </div>
        ))}
      </div>

      <h3 className="section-title mt-lg">Defaults Redmine</h3>
      <div className="need-catalogue">
        {Object.entries(defaults).map(([key, val]) => (
          <div key={key} className="need-row">
            <code className="id-badge">{key}</code>
            <input value={String(val)}
              onChange={e => onChange({ ...mapping, redmine_defaults: { ...defaults, [key]: e.target.value } })}
              className={`text-input flex-1 ${String(val).startsWith('__') ? 'pending' : ''}`} />
          </div>
        ))}
      </div>

      <h3 className="section-title mt-lg">Dominio → Bloque Redmine</h3>
      <p className="section-desc">Mapeo de cada dominio de la taxonomía al bloque de Redmine correspondiente.</p>
      <div className="need-catalogue">
        {Object.entries(domainToBlock).map(([domain, block]) => (
          <div key={domain} className="need-row">
            <code className="id-badge">{domain}</code>
            <input value={block} onChange={e => updateBlock(domain, e.target.value)} className="text-input flex-1" />
          </div>
        ))}
      </div>

      <h3 className="section-title mt-lg">Rol funcional → Usuario Redmine</h3>
      <p className="section-desc">
        Asigna cada rol funcional a una persona de Redmine. El sistema usará esta tabla para asignar tickets automáticamente.
      </p>
      <div className="need-catalogue">
        <div className="need-row header-row">
          <span style={{ flex: 1 }}>Rol funcional</span>
          <span style={{ width: 240 }}>Identificador Redmine</span>
          <span style={{ width: 40, fontSize: 11, color: '#4a6080' }}>ID</span>
        </div>
        {usersLoading && (
          <div style={{ color: '#4a6080', fontSize: 12, padding: '8px 0' }}>Cargando usuarios de Redmine…</div>
        )}
        {Object.entries(mapping.role_to_user_id ?? {}).map(([roleId, userId]) => (
          <div key={roleId} className="need-row">
            <code className="id-badge" style={{ flex: 1 }}>{roleId}</code>
            <select
              value={userId}
              onChange={e => onChange({
                ...mapping,
                role_to_user_id: { ...mapping.role_to_user_id, [roleId]: parseInt(e.target.value) || 0 },
              })}
              className="text-input"
              style={{ width: 240 }}
            >
              {redmineUsers.map(u => (
                <option key={u.id} value={u.id}>{u.login} — {u.name}</option>
              ))}
            </select>
            <span style={{ width: 40, fontSize: 11, color: '#4a6080', textAlign: 'right' }}>#{userId}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConfigPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('taxonomy');
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [redmineMapping, setRedmineMapping] = useState<RedmineMapping | null>(null);
  const [assignmentRules, setAssignmentRules] = useState<AssignmentRules | null>(null);
  const [redmineUsers, setRedmineUsers] = useState<{ id: number; login: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tx, rm, ar, ru] = await Promise.all([
        loadConfig('taxonomy'),
        loadConfig('redmine-mapping'),
        loadConfig('assignment-rules'),
        authenticatedFetch<{ users: { id: number; login: string; name: string }[] }>('/config/redmine-users').catch(() => ({ users: [] })),
      ]);
      setTaxonomy(tx as Taxonomy);
      setRedmineMapping(rm as RedmineMapping);
      setAssignmentRules(ar as AssignmentRules);
      setRedmineUsers((ru as { users: { id: number; login: string; name: string }[] }).users ?? []);
    } catch (e) {
      setError('Error al cargar la configuración: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!taxonomy || !redmineMapping || !assignmentRules) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        saveConfig('taxonomy', taxonomy),
        saveConfig('redmine-mapping', redmineMapping),
        saveConfig('assignment-rules', assignmentRules),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError('Error al guardar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="config-panel"><div className="loading">Cargando configuración…</div></div>;
  }

  if (error && !taxonomy) {
    return (
      <div className="config-panel">
        <div className="error-box">{error}</div>
        <button className="btn-primary" onClick={load}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="config-panel">
      <style>{CONFIG_PANEL_CSS}</style>

      <div className="config-header">
        <div>
          <h1 className="config-title">Panel de configuración</h1>
          <p className="config-subtitle">Taxonomía · Soluciones · Necesidades · Asignación · Redmine</p>
        </div>
        <div className="header-actions">
          {error && <span className="error-inline">{error}</span>}
          {saved && <span className="saved-badge">✓ Guardado</span>}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar todo'}
          </button>
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'taxonomy' && taxonomy && (
          <TaxonomyTab taxonomy={taxonomy} onChange={setTaxonomy} />
        )}
        {activeTab === 'solutions' && redmineMapping && (
          <SolutionsTab mapping={redmineMapping} onChange={setRedmineMapping} />
        )}
        {activeTab === 'needs' && redmineMapping && (
          <NeedsTab mapping={redmineMapping} onChange={setRedmineMapping} />
        )}
        {activeTab === 'assignment' && assignmentRules && (
          <AssignmentTab rules={assignmentRules} onChange={setAssignmentRules} />
        )}
        {activeTab === 'redmine' && redmineMapping && (
          <RedmineTab mapping={redmineMapping} onChange={setRedmineMapping} assignmentRoles={assignmentRules.rol_funcional} redmineUsers={redmineUsers} />
        )}
      </div>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CONFIG_PANEL_CSS = `
  .config-panel {
    font-family: 'IBM Plex Mono', 'Fira Code', 'Cascadia Code', monospace;
    background: #0f1117;
    min-height: 100vh;
    color: #e2e8f0;
    padding: 0;
  }

  .config-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 28px 32px 20px;
    border-bottom: 1px solid #1e2a3a;
    background: #0d1321;
  }

  .config-title {
    font-size: 20px;
    font-weight: 700;
    color: #f0f4f8;
    margin: 0 0 4px;
    letter-spacing: -0.3px;
  }

  .config-subtitle {
    font-size: 12px;
    color: #4a6080;
    margin: 0;
    letter-spacing: 0.5px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tab-bar {
    display: flex;
    gap: 0;
    padding: 0 32px;
    background: #0d1321;
    border-bottom: 1px solid #1e2a3a;
  }

  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 12px 20px;
    font-size: 13px;
    font-family: inherit;
    color: #4a6080;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    letter-spacing: 0.3px;
  }

  .tab-btn:hover { color: #94b0cc; }
  .tab-btn.active { color: #5ba3f5; border-bottom-color: #5ba3f5; }

  .tab-content {
    padding: 28px 32px;
    max-width: 900px;
  }

  .section-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .section-tab {
    background: #161d2e;
    border: 1px solid #1e2a3a;
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 13px;
    font-family: inherit;
    color: #4a6080;
    cursor: pointer;
    transition: all 0.15s;
  }

  .section-tab:hover { border-color: #2d3d55; color: #94b0cc; }
  .section-tab.active { background: #1a2640; border-color: #5ba3f5; color: #5ba3f5; }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #94b0cc;
    margin: 0 0 6px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-size: 11px;
  }

  .section-desc {
    font-size: 13px;
    color: #4a6080;
    margin: 0 0 16px;
    line-height: 1.5;
  }

  .mt-lg { margin-top: 32px; }
  .mt-sm { margin-top: 10px; }

  /* Cards */
  .card {
    background: #111827;
    border: 1px solid #1e2a3a;
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .card.flat { padding: 16px; margin-bottom: 10px; }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }

  .card-header:hover { background: #161d2e; }

  .card-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .expand-icon { color: #4a6080; font-size: 12px; }
  .card-label { font-size: 14px; color: #c5d5e8; }
  .card-body { padding: 0 16px 16px; border-top: 1px solid #1e2a3a; }

  .values-list { margin-bottom: 12px; }

  /* Fields */
  .field-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
  }

  .field-row label {
    font-size: 11px;
    color: #4a6080;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .inline-fields {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .field-inline {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 160px;
  }

  .field-inline.narrow { flex: 0 0 100px; min-width: 80px; }

  .field-inline label {
    font-size: 11px;
    color: #4a6080;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .text-input, .textarea {
    background: #0d1321;
    border: 1px solid #1e2a3a;
    border-radius: 5px;
    padding: 7px 10px;
    font-family: inherit;
    font-size: 13px;
    color: #c5d5e8;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }

  .text-input:focus, .textarea:focus { border-color: #5ba3f5; }
  .text-input.pending { color: #f59e42; border-color: #8a4f00; }
  .text-input.narrow { max-width: 120px; }
  .text-input.flex-1 { flex: 1; }

  /* Tags */
  .tag-list { display: flex; flex-direction: column; gap: 6px; }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tag {
    background: #1a2640;
    border: 1px solid #2d3d55;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    color: #94b0cc;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .tag-remove {
    background: none;
    border: none;
    color: #4a6080;
    cursor: pointer;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    transition: color 0.1s;
  }

  .tag-remove:hover { color: #f87171; }

  .tag-input-row {
    display: flex;
    gap: 6px;
  }

  .tag-input {
    background: #0d1321;
    border: 1px solid #1e2a3a;
    border-radius: 5px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: 12px;
    color: #c5d5e8;
    outline: none;
    flex: 1;
    transition: border-color 0.15s;
  }

  .tag-input:focus { border-color: #5ba3f5; }

  /* Line list */
  .line-list { display: flex; flex-direction: column; gap: 6px; }
  .line-item { display: flex; gap: 6px; align-items: center; }
  .line-input {
    background: #0d1321;
    border: 1px solid #1e2a3a;
    border-radius: 5px;
    padding: 6px 10px;
    font-family: inherit;
    font-size: 13px;
    color: #c5d5e8;
    outline: none;
    flex: 1;
    transition: border-color 0.15s;
  }
  .line-input:focus { border-color: #5ba3f5; }

  /* Need catalogue */
  .need-catalogue { display: flex; flex-direction: column; gap: 5px; }
  .need-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
  }
  .need-row.new-row { margin-top: 8px; padding-top: 10px; border-top: 1px solid #1e2a3a; }
  .need-row.header-row { font-size: 11px; color: #4a6080; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 6px; border-bottom: 1px solid #1e2a3a; }

  /* Rules table */
  .rules-table { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .rules-table.wide .rules-row { grid-template-columns: 50px 1fr 1fr 1fr 1fr 1fr 36px; }
  .rules-table.wide .rules-header { grid-template-columns: 50px 1fr 1fr 1fr 1fr 1fr 36px; }

  .rules-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 36px;
    gap: 6px;
    padding: 0 4px 8px;
    font-size: 11px;
    color: #4a6080;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    border-bottom: 1px solid #1e2a3a;
  }

  .rules-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 36px;
    gap: 6px;
    align-items: center;
  }

  /* Badges */
  .id-badge {
    background: #1a2640;
    border: 1px solid #2d3d55;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 12px;
    color: #5ba3f5;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .id-badge.billable {
    border-color: #92400e;
    color: #f59e42;
    background: #1c1208;
  }

  .billable-badge {
    font-size: 10px;
    font-weight: 700;
    color: #f59e42;
    margin-left: 3px;
  }

  /* Buttons */
  .btn-primary {
    background: #1d4ed8;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 9px 20px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover { background: #2563eb; }
  .btn-primary:disabled { background: #1e2a3a; color: #4a6080; cursor: not-allowed; }

  .btn-sm {
    background: #1a2640;
    border: 1px solid #2d3d55;
    border-radius: 4px;
    padding: 5px 10px;
    font-family: inherit;
    font-size: 12px;
    color: #94b0cc;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.15s;
  }

  .btn-sm:hover { border-color: #5ba3f5; color: #5ba3f5; }

  .btn-add {
    background: none;
    border: 1px dashed #2d3d55;
    border-radius: 6px;
    padding: 8px 16px;
    font-family: inherit;
    font-size: 13px;
    color: #4a6080;
    cursor: pointer;
    width: 100%;
    margin-top: 8px;
    transition: all 0.15s;
  }

  .btn-add:hover { border-color: #5ba3f5; color: #5ba3f5; }

  .btn-icon {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    opacity: 0.5;
    transition: opacity 0.1s;
    flex-shrink: 0;
  }

  .btn-icon:hover { opacity: 1; }

  .btn-danger-sm {
    background: none;
    border: 1px solid #7f1d1d;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-family: inherit;
    color: #f87171;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-danger-sm:hover { background: #7f1d1d; }

  /* States */
  .loading {
    padding: 60px 32px;
    color: #4a6080;
    font-size: 14px;
  }

  .error-box {
    background: #1c0a0a;
    border: 1px solid #7f1d1d;
    border-radius: 6px;
    padding: 14px 18px;
    color: #f87171;
    font-size: 13px;
    margin: 28px 32px;
  }

  .error-inline {
    font-size: 12px;
    color: #f87171;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .saved-badge {
    font-size: 12px;
    color: #34d399;
    font-weight: 600;
  }
`;
