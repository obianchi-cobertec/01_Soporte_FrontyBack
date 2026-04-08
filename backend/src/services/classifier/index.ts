import { buildSystemPrompt, buildUserPrompt } from './prompt-builder.js';
import { validateClassificationResponse, buildFallbackResponse } from './response-validator.js';
import type { LLMProvider, LLMProviderConfig } from './llm-provider.js';
import { AnthropicProvider } from './provider-anthropic.js';
import { OpenAIProvider } from './provider-openai.js';
import type { ClassificationRequest, ClassificationResponse } from '../../types.js';

// =============================================================================
// Classifier Service — Motor IA v1
//
// Orquesta el flujo completo de clasificación:
// 1. Construye prompts desde configuración externalizada
// 2. Llama al LLM (Anthropic o OpenAI, según LLM_PROVIDER)
// 3. Valida y sanitiza la respuesta
// 4. Devuelve clasificación estructurada o fallback
// =============================================================================

export interface ClassifierResult {
  response: ClassificationResponse;
  durationMs: number;
  usedFallback: boolean;
  validationErrors: string[];
  provider: string;
}

export class ClassifierService {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async classify(request: ClassificationRequest): Promise<ClassifierResult> {
    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(request);

    try {
      const llmResponse = await this.provider.call(systemPrompt, userPrompt);
      const durationMs = Date.now() - startTime;

      if (!llmResponse.text) {
        return {
          response: buildFallbackResponse(request.session_id, request.description),
          durationMs,
          usedFallback: true,
          validationErrors: ['El LLM no devolvió texto en la respuesta'],
          provider: this.provider.name,
        };
      }

      const validation = validateClassificationResponse(llmResponse.text, request.session_id);

      if (validation.success) {
        return {
          response: validation.data,
          durationMs,
          usedFallback: false,
          validationErrors: [],
          provider: this.provider.name,
        };
      } else {
        console.error('[Classifier] Validación fallida:', validation.errors);
        console.error('[Classifier] Raw LLM output:', validation.raw);
        return {
          response: buildFallbackResponse(request.session_id, request.description),
          durationMs,
          usedFallback: true,
          validationErrors: validation.errors,
          provider: this.provider.name,
        };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`[Classifier][${this.provider.name}] Error en llamada LLM:`, errorMsg);

      return {
        response: buildFallbackResponse(request.session_id, request.description),
        durationMs,
        usedFallback: true,
        validationErrors: [`Error LLM: ${errorMsg}`],
        provider: this.provider.name,
      };
    }
  }
}

// =============================================================================
// Factory — lee variables de entorno y crea el proveedor correcto
// =============================================================================

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
    provider: providerName,
    apiKey,
    model: process.env.CLASSIFIER_MODEL ?? DEFAULT_MODELS[providerName],
    maxTokens: parseInt(process.env.CLASSIFIER_MAX_TOKENS ?? '1500', 10),
    timeoutMs: parseInt(process.env.CLASSIFIER_TIMEOUT_MS ?? '15000', 10),
  };

  console.log(`[Classifier] Proveedor: ${providerName}, modelo: ${config.model}`);

  if (providerName === 'openai') {
    return new OpenAIProvider(config);
  }
  return new AnthropicProvider(config);
}

let instance: ClassifierService | null = null;

export function getClassifier(): ClassifierService {
  if (!instance) {
    const provider = createProvider();
    instance = new ClassifierService(provider);
  }
  return instance;
}

export function resetClassifier(): void {
  instance = null;
}
