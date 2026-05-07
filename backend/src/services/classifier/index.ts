import { buildSystemPrompt, buildUserPrompt } from './prompt-builder.js';
import { validateClassificationResponse, buildFallbackResponse } from './response-validator.js';
import { resolveAssignee } from './assignee-resolver.js';
import { generateClarifyingQuestion } from './question-generator.js';
import { getLLMProvider } from '../llm/index.js';
import type { LLMProvider } from './llm-provider.js';
import type { ClassificationRequest, ClassificationResponse, ClarifyingQuestion } from '../../types.js';

export interface ClassifierResult {
  response: ClassificationResponse;
  clarifying_question: ClarifyingQuestion | null;
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
          clarifying_question: null,
          durationMs,
          usedFallback: true,
          validationErrors: ['El LLM no devolvió texto en la respuesta'],
          provider: this.provider.name,
        };
      }

      const validation = validateClassificationResponse(llmResponse.text, request.session_id);

      if (validation.success) {
        // Resolver determinista: sobreescribe el assignee del LLM con la regla correcta
        validation.data.suggested_assignee = resolveAssignee(validation.data);

        // Pregunta determinista: siempre en primera clasificación, nunca en re-clasificación
        const clarifying_question: ClarifyingQuestion | null = request.clarification
          ? null
          : generateClarifyingQuestion(validation.data);

        return {
          response: validation.data,
          clarifying_question,
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
          clarifying_question: null,
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
        clarifying_question: null,
        durationMs,
        usedFallback: true,
        validationErrors: [`Error LLM: ${errorMsg}`],
        provider: this.provider.name,
      };
    }
  }
}

let instance: ClassifierService | null = null;

export function getClassifier(): ClassifierService {
  if (!instance) {
    instance = new ClassifierService(getLLMProvider());
  }
  return instance;
}

export function resetClassifier(): void {
  instance = null;
}
