import OpenAI from 'openai';
import type { LLMProvider, LLMResponse, LLMProviderConfig } from './llm-provider.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.timeoutMs = config.timeoutMs;
  }

  async call(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const text = response.choices[0]?.message?.content ?? '';

      return { text };
    } finally {
      clearTimeout(timeout);
    }
  }
}
