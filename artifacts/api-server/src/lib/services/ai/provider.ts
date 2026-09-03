import type { Buffer } from "node:buffer";

export type ArchitectDocument = {
  name: string;
  contentType: string;
  data: Buffer;
};

export type ArchitectContext = {
  problem: string;
  targetUser: string;
  desiredOutcome: string;
  additionalContext?: string;
  pattern?: { name: string; steps: string[] };
  recipe?: { name: string; components: string[] };
  documents?: ArchitectDocument[];
};

export type ArchitectProposal = {
  problemType: string;
  journey: string[];
  knowledgeRequirements: string[];
  componentRequirements: string[];
  aiRequirements: string[];
  expectedOutput: string[];
  actionPlan: string[];
  nextStep: string;
};

export interface AIProvider {
  proposeBlueprint(context: ArchitectContext): Promise<ArchitectProposal>;
}

const architectInstructions = `
Anda adalah Perancang Problem Solver Toolkit (PST). Susun rancangan yang spesifik, praktis, dan setia pada informasi pengguna serta dokumen yang sengaja dipilih.
Jangan mengarang fakta yang tidak tersedia. Jika dokumen tidak lengkap atau bertentangan, nyatakan kebutuhan validasi di actionPlan.
Kembalikan JSON valid saja dengan properti: problemType, journey, knowledgeRequirements, componentRequirements, aiRequirements, expectedOutput, actionPlan, nextStep.
Semua properti selain problemType dan nextStep harus berupa array string. Gunakan Bahasa Indonesia.
`;

function parseProposal(content: string): ArchitectProposal {
  const raw = JSON.parse(content) as Record<string, unknown>;
  const stringFields = ["problemType", "nextStep"] as const;
  const arrayFields = [
    "journey",
    "knowledgeRequirements",
    "componentRequirements",
    "aiRequirements",
    "expectedOutput",
    "actionPlan",
  ] as const;
  if (
    stringFields.some((field) => typeof raw[field] !== "string") ||
    arrayFields.some((field) =>
      !Array.isArray(raw[field]) || !(raw[field] as unknown[]).every((item) => typeof item === "string"))
  ) {
    throw new Error("LLM returned an invalid architect proposal.");
  }
  return raw as ArchitectProposal;
}

export class OpenAIProvider implements AIProvider {
  async proposeBlueprint(context: ArchitectContext): Promise<ArchitectProposal> {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const response = await openai.responses.create({
      model: "gpt-5.6-terra",
      max_output_tokens: 8192,
      instructions: architectInstructions,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Format keluaran wajib JSON.",
              `Masalah: ${context.problem}`,
              `Pengguna: ${context.targetUser}`,
              `Hasil yang diharapkan: ${context.desiredOutcome}`,
              context.additionalContext ? `Konteks tambahan: ${context.additionalContext}` : undefined,
              context.pattern ? `Pola: ${context.pattern.name} — ${context.pattern.steps.join(" → ")}` : undefined,
              context.recipe ? `Panduan: ${context.recipe.name} — ${context.recipe.components.join(", ")}` : undefined,
            ].filter(Boolean).join("\n"),
          },
          ...(context.documents ?? []).map((document) => ({
            type: "input_file" as const,
            filename: document.name,
            file_data: `data:${document.contentType};base64,${document.data.toString("base64")}`,
            detail: "low" as const,
          })),
        ],
      }],
      text: { format: { type: "json_object" } },
    }, { timeout: 45_000 });
    if (!response.output_text) {
      throw new Error("LLM returned an empty architect proposal.");
    }
    return parseProposal(response.output_text);
  }
}

export const aiProvider: AIProvider = new OpenAIProvider();