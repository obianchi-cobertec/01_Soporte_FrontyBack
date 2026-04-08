// =============================================================================
// LLM Provider — Capa de abstracción multi-proveedor
//
// Interfaz común para Anthropic y OpenAI.
// El clasificador trabaja contra esta interfaz, sin saber qué hay debajo.
// Se selecciona con LLM_PROVIDER=anthropic|openai en .env
// =============================================================================

export interface LLMResponse {
  text: string;
}

export interface LLMProvider {
  name: string;
  call(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
}

export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}
