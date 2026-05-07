/**
 * LLM Provider — capa de abstracción multi-proveedor compartida
 *
 * Singleton de proveedor LLM consumido por:
 *   - ClassifierService (clasificación de incidencias)
 *   - ConfigAgent (análisis de patrones de reasignación)
 *
 * Ambos son consumidores independientes de la misma abstracción de bajo nivel.
 * Se selecciona con LLM_PROVIDER=anthropic|openai en .env.
 */

export type { LLMProvider, LLMResponse, LLMProviderConfig } from '../classifier/llm-provider.js';
import { AnthropicProvider } from '../classifier/provider-anthropic.js';
import { OpenAIProvider } from '../classifier/provider-openai.js';
import type { LLMProvider, LLMProviderConfig } from '../classifier/llm-provider.js';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

function createProvider(): LLMProvider {
  const providerName = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();

  if (providerName !== 'anthropic' && providerName !== 'openai') {
    throw new Error(
      `LLM_PROVIDER="${providerName}" no soportado. Usa "anthropic" o "openai".`
    );
  }

  const apiKey =
    process.env[`${providerName.toUpperCase()}_API_KEY`] ??
    process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error(
      `API key no encontrada. Configura ${providerName.toUpperCase()}_API_KEY ` +
      `o LLM_API_KEY en las variables de entorno.`
    );
  }

  const config: LLMProviderConfig = {
    provider: providerName as 'anthropic' | 'openai',
    apiKey,
    model: process.env.CLASSIFIER_MODEL ?? DEFAULT_MODELS[providerName],
    maxTokens: parseInt(process.env.CLASSIFIER_MAX_TOKENS ?? '1500', 10),
    timeoutMs: parseInt(process.env.CLASSIFIER_TIMEOUT_MS ?? '15000', 10),
  };

  console.log(`[LLM] Proveedor: ${providerName}, modelo: ${config.model}`);

  if (providerName === 'openai') {
    return new OpenAIProvider(config);
  }
  return new AnthropicProvider(config);
}

let _provider: LLMProvider | null = null;

/**
 * Devuelve la instancia singleton del proveedor LLM activo.
 * La primera llamada inicializa el proveedor leyendo las env vars.
 */
export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    _provider = createProvider();
  }
  return _provider;
}

/** Resetea el singleton — útil en tests. */
export function resetLLMProvider(): void {
  _provider = null;
}
