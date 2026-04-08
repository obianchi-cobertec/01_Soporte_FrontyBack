import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMResponse, LLMProviderConfig } from './llm-provider.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(config: LLMProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.timeoutMs = config.timeoutMs;
  }

  async call(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = message.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('');

      return { text };
    } finally {
      clearTimeout(timeout);
    }
  }
}
