import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ClassifierService, type ClassifierResult } from '../src/services/classifier/index.js';
import { OpenAIProvider } from '../src/services/classifier/provider-openai.js';
import { AnthropicProvider } from '../src/services/classifier/provider-anthropic.js';
import { reloadConfig } from '../src/config/loader.js';
import type { LLMProviderConfig } from '../src/services/classifier/llm-provider.js';

// =============================================================================
// Runner de incidencias reales — análisis cualitativo
//
// Ejecuta las incidencias de real-incidents.json contra el clasificador
// y muestra el resultado completo de cada una para revisión manual.
//
// Uso (desde backend/):
//   npx tsx tests/run-real-incidents.ts
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RealCase {
  id: string;
  description: string;
  company_name: string;
}

const NATURE_LABELS: Record<string, string> = {
  incidencia_error:        'Error / Sistema roto',
  consulta_funcional:      'Consulta funcional',
  formacion_duda_uso:      'Formación / Duda de uso',
  configuracion:           'Configuración',
  peticion_cambio_mejora:  'Petición de cambio / mejora',
  usuario_acceso:          'Acceso / Login / Licencias',
  instalacion_entorno:     'Instalación / Entorno',
  importacion_exportacion: 'Importación / Exportación',
  rendimiento_bloqueo:     'Rendimiento / Bloqueo',
  ambiguo:                 'Ambiguo',
};

const CONFIDENCE_ICON: Record<string, string> = { high: '🟢', medium: '🟡', low: '🔴' };

const REVIEW_LABEL: Record<string, string> = {
  auto_ok:            '✅ Auto OK',
  review_recommended: '👀 Revisar recomendado',
  ambiguous:          '❓ Ambiguo',
  out_of_map:         '🗺️  Fuera de mapa',
  human_required:     '🚨 Revisión humana obligatoria',
};

function printResult(id: string, description: string, result: ClassifierResult): void {
  const line = '─'.repeat(72);
  const r = result.response;
  const preview = description.replace(/\n/g, ' ').slice(0, 110);

  console.log(`\n${line}`);
  console.log(`📩  [${id}]`);
  console.log(`    "${preview}${description.length > 110 ? '…' : ''}"`);
  console.log(line);

  if (result.usedFallback) {
    console.log('    ⚠️  FALLBACK — LLM no devolvió JSON válido');
    if (result.validationErrors.length > 0) {
      for (const e of result.validationErrors) console.log(`       • ${e}`);
    }
    return;
  }

  console.log(`    📝 Resumen:      ${r.summary}`);
  console.log(`    🔖 Naturaleza:   ${NATURE_LABELS[r.classification.nature] ?? r.classification.nature}`);
  console.log(`    🗂️  Dominio:      ${r.classification.domain}`);
  console.log(`    🎯 Objeto:       ${r.classification.object}`);
  console.log(`    ⚙️  Acción:       ${r.classification.action}`);
  console.log(`    📦 Solución:     ${r.solution_associated}`);
  if (r.expertis_module) {
    console.log(`    🧩 Módulo ERP:   ${r.expertis_module}`);
  }
  console.log(`    🗃️  Redmine:      block=${r.redmine_mapping.block}  |  module=${r.redmine_mapping.module}  |  need=${r.redmine_mapping.need}`);
  console.log(`    ${CONFIDENCE_ICON[r.confidence] ?? '?'} Confianza:    ${r.confidence.toUpperCase()}`);
  console.log(`    ${REVIEW_LABEL[r.review_status] ?? r.review_status}`);
  console.log(`    🚦 Prioridad:    ${r.suggested_priority}`);
  console.log(`    👤 Asignado a:   ${r.suggested_assignee ?? '(sin asignar)'}`);
  console.log(`    🧠 Razonamiento: ${r.reasoning}`);
  console.log(`    ⏱️  ${result.durationMs}ms  [${result.provider}]`);
}

async function run(): Promise<void> {
  const providerName = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase() as 'anthropic' | 'openai';
  const apiKey = process.env[`${providerName.toUpperCase()}_API_KEY`] ?? process.env.LLM_API_KEY;

  if (!apiKey) {
    console.error(`❌ Falta la API key. Configura ${providerName.toUpperCase()}_API_KEY en backend/.env`);
    process.exit(1);
  }

  const defaultModels: Record<string, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
  };
  const model = process.env.CLASSIFIER_MODEL ?? defaultModels[providerName];

  const config: LLMProviderConfig = {
    provider: providerName,
    apiKey,
    model,
    maxTokens: 1500,
    timeoutMs: 20000,
  };

  const provider = providerName === 'openai'
    ? new OpenAIProvider(config)
    : new AnthropicProvider(config);

  reloadConfig();

  const casesPath = resolve(__dirname, 'cases/real-incidents.json');
  const cases: RealCase[] = JSON.parse(readFileSync(casesPath, 'utf-8'));
  const svc = new ClassifierService(provider);

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ANÁLISIS DE INCIDENCIAS REALES — ${cases.length} casos`);
  console.log(`  Proveedor: ${providerName.toUpperCase()}  |  Modelo: ${model}`);
  console.log(`${'═'.repeat(72)}`);

  let fallbacks = 0;

  for (const c of cases) {
    process.stdout.write(`  Clasificando [${c.id}]...`);

    const result = await svc.classify({
      session_id: `real-${c.id}`,
      description: c.description,
      user_context: {
        user_id: 'test-user',
        company_id: 'test-company',
        company_name: c.company_name,
      },
      attachment_names: [],
      attempt: 1,
    });

    process.stdout.write(` ${result.durationMs}ms\n`);
    printResult(c.id, c.description, result);

    if (result.usedFallback) fallbacks++;
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  COMPLETADO — ${cases.length} incidencias procesadas`);
  if (fallbacks > 0) {
    console.log(`  ⚠️  ${fallbacks} fallback(s) — el LLM no pudo clasificar`);
  } else {
    console.log('  ✅ Todas clasificadas sin fallback');
  }
  console.log(`${'═'.repeat(72)}\n`);
}

run().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
