import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ClassifierService } from '../src/services/classifier/index.js';
import { AnthropicProvider } from '../src/services/classifier/provider-anthropic.js';
import { OpenAIProvider } from '../src/services/classifier/provider-openai.js';
import { reloadConfig } from '../src/config/loader.js';
import type { ClassificationResponse, Confidence, ReviewStatus, Priority } from '../src/types.js';
import type { LLMProviderConfig } from '../src/services/classifier/llm-provider.js';

// =============================================================================
// Test Runner — Motor IA v1
//
// Ejecuta la batería de casos de prueba contra el clasificador real.
// Soporta Anthropic y OpenAI según LLM_PROVIDER.
//
// Uso con OpenAI:
//   LLM_PROVIDER=openai OPENAI_API_KEY=sk-... npx tsx tests/run-classifier-tests.ts
//
// Uso con Anthropic:
//   LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... npx tsx tests/run-classifier-tests.ts
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestCase {
  id: string;
  description: string;
  company_name: string;
  expected: {
    nature?: string;
    domain?: string;
    need?: string;
    block?: string;
    assignee?: string;
    confidence_min?: Confidence;
    confidence_max?: Confidence;
    review_status_min?: ReviewStatus;
    review_status_max?: ReviewStatus;
    suggested_priority_min?: Priority;
  };
}

interface TestResult {
  id: string;
  passed: boolean;
  failures: string[];
  response: ClassificationResponse | null;
  durationMs: number;
  usedFallback: boolean;
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const REVIEW_ORDER: Record<ReviewStatus, number> = {
  auto_ok: 0, review_recommended: 1, ambiguous: 2, out_of_map: 3, human_required: 4,
};
const PRIORITY_ORDER: Record<Priority, number> = { normal: 0, high: 1, urgent: 2 };

function checkExpectations(response: ClassificationResponse, expected: TestCase['expected']): string[] {
  const failures: string[] = [];

  if (expected.nature && response.classification.nature !== expected.nature) {
    failures.push(`nature: esperado "${expected.nature}", obtenido "${response.classification.nature}"`);
  }

  if (expected.domain && response.classification.domain !== expected.domain) {
    failures.push(`domain: esperado "${expected.domain}", obtenido "${response.classification.domain}"`);
  }

  if (expected.need && response.redmine_mapping.need !== expected.need) {
    failures.push(`need: esperado "${expected.need}", obtenido "${response.redmine_mapping.need}"`);
  }

  if (expected.block && response.redmine_mapping.block !== expected.block) {
    failures.push(`block: esperado "${expected.block}", obtenido "${response.redmine_mapping.block}"`);
  }

  if (expected.assignee && response.suggested_assignee !== expected.assignee) {
    failures.push(`assignee: esperado "${expected.assignee}", obtenido "${response.suggested_assignee}"`);
  }

  if (expected.confidence_min) {
    if (CONFIDENCE_ORDER[response.confidence] < CONFIDENCE_ORDER[expected.confidence_min]) {
      failures.push(`confidence: esperado mín "${expected.confidence_min}", obtenido "${response.confidence}"`);
    }
  }

  if (expected.confidence_max) {
    if (CONFIDENCE_ORDER[response.confidence] > CONFIDENCE_ORDER[expected.confidence_max]) {
      failures.push(`confidence: esperado máx "${expected.confidence_max}", obtenido "${response.confidence}"`);
    }
  }

  if (expected.review_status_min) {
    if (REVIEW_ORDER[response.review_status] < REVIEW_ORDER[expected.review_status_min]) {
      failures.push(`review_status: esperado mín "${expected.review_status_min}", obtenido "${response.review_status}"`);
    }
  }

  if (expected.review_status_max) {
    if (REVIEW_ORDER[response.review_status] > REVIEW_ORDER[expected.review_status_max]) {
      failures.push(`review_status: esperado máx "${expected.review_status_max}", obtenido "${response.review_status}"`);
    }
  }

  if (expected.suggested_priority_min) {
    if (PRIORITY_ORDER[response.suggested_priority] < PRIORITY_ORDER[expected.suggested_priority_min]) {
      failures.push(`priority: esperado mín "${expected.suggested_priority_min}", obtenido "${response.suggested_priority}"`);
    }
  }

  return failures;
}

async function runTests(): Promise<void> {
  const providerName = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase() as 'anthropic' | 'openai';

  const defaultModels: Record<string, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
  };

  const apiKey =
    process.env[`${providerName.toUpperCase()}_API_KEY`] ??
    process.env.LLM_API_KEY;

  if (!apiKey) {
    console.error(`❌ API key no encontrada para proveedor "${providerName}".`);
    console.error(`   Configura ${providerName.toUpperCase()}_API_KEY o LLM_API_KEY.`);
    console.error('');
    console.error('   Ejemplos:');
    console.error('   LLM_PROVIDER=openai OPENAI_API_KEY=sk-... npx tsx tests/run-classifier-tests.ts');
    console.error('   LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... npx tsx tests/run-classifier-tests.ts');
    process.exit(1);
  }

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

  // Cargar configuración
  reloadConfig();

  // Cargar casos de prueba
  const casesPath = resolve(__dirname, 'cases/classifier-tests.json');
  const cases: TestCase[] = JSON.parse(readFileSync(casesPath, 'utf-8'));

  console.log(`\n🧪 Ejecutando ${cases.length} casos de prueba contra Motor IA v1\n`);
  console.log(`   Proveedor: ${providerName}`);
  console.log(`   Modelo: ${model}`);
  console.log('');

  const classifier = new ClassifierService(provider);

  const results: TestResult[] = [];

  for (const testCase of cases) {
    process.stdout.write(`  [${testCase.id}] ...`);

    const result = await classifier.classify({
      session_id: `test-${testCase.id}`,
      description: testCase.description,
      user_context: {
        user_id: 'test-user',
        company_id: 'test-company',
        company_name: testCase.company_name,
      },
      attachment_names: [],
      attempt: 1,
    });

    const failures = result.usedFallback
      ? ['Clasificador usó fallback (LLM falló o respuesta inválida)']
      : checkExpectations(result.response, testCase.expected);

    const passed = failures.length === 0;

    results.push({
      id: testCase.id,
      passed,
      failures,
      response: result.response,
      durationMs: result.durationMs,
      usedFallback: result.usedFallback,
    });

    if (passed) {
      console.log(` ✅ (${result.durationMs}ms) [${result.response.confidence}] ${result.response.classification.nature}/${result.response.classification.domain}`);
    } else {
      console.log(` ❌ (${result.durationMs}ms)`);
      for (const f of failures) {
        console.log(`       → ${f}`);
      }
    }
  }

  // Resumen
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const fallbacks = results.filter(r => r.usedFallback).length;
  const avgMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);

  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTADOS: ${passed} pasados, ${failed} fallidos, ${fallbacks} fallbacks`);
  console.log(`  Tiempo medio: ${avgMs}ms`);
  console.log(`  Tasa de acierto: ${((passed / results.length) * 100).toFixed(0)}%`);
  console.log('═'.repeat(60));

  // Detalle de respuestas para análisis
  if (process.env.VERBOSE === '1') {
    console.log('\n📋 Detalle de respuestas:\n');
    for (const r of results) {
      console.log(`--- ${r.id} ---`);
      if (r.response) {
        console.log(`  Resumen: ${r.response.summary}`);
        console.log(`  Naturaleza: ${r.response.classification.nature}`);
        console.log(`  Dominio: ${r.response.classification.domain}`);
        console.log(`  Objeto: ${r.response.classification.object}`);
        console.log(`  Acción: ${r.response.classification.action}`);
        console.log(`  Confianza: ${r.response.confidence}`);
        console.log(`  Review: ${r.response.review_status}`);
        console.log(`  Prioridad: ${r.response.suggested_priority}`);
        console.log(`  Razonamiento: ${r.response.reasoning}`);
      }
      console.log('');
    }
  }

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Error fatal en test runner:', err);
  process.exit(1);
});
