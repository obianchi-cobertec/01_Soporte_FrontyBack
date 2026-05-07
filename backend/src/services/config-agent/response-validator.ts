import { z } from 'zod';

const ProposedChangeSchema = z.object({
  config_file: z.enum(['taxonomy.json', 'redmine-mapping.json', 'assignment-rules.json']),
  jsonpath: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  reasoning: z.string(),
  summary: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

const AgentResponseSchema = z.object({
  analysis: z.string(),
  proposed_changes: z.array(ProposedChangeSchema).default([]),
  no_changes_needed: z.boolean().optional(),
  reasoning: z.string(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export function validateAgentResponse(raw: string): AgentResponse | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return AgentResponseSchema.parse(parsed);
  } catch (e: unknown) {
    console.error('[ConfigAgent] Error validando respuesta del LLM:', e);
    return null;
  }
}
