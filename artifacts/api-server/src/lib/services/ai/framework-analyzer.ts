import { AnalyzePstFrameworkBody, AnalyzePstFrameworkResponse } from "@workspace/api-zod";

const frameworkAnalysisInstructions = `
Anda adalah analis Problem Solver Toolkit (PST). Analisis problem mentah pengguna secara hati-hati.
Pilih tepat satu framework yang paling relevan dari: "5 Whys", "Fishbone", "ICE Scoring", atau "SWOT".
- Gunakan 5 Whys untuk dugaan akar masalah dan sebab-akibat.
- Gunakan Fishbone untuk masalah operasional/kompleks dengan banyak kategori penyebab.
- Gunakan ICE Scoring untuk memilih atau memprioritaskan beberapa solusi.
- Gunakan SWOT untuk situasi strategi yang melibatkan kekuatan, kelemahan, peluang, dan ancaman.

Kembalikan JSON valid saja, tanpa markdown atau komentar, dengan bentuk persis:
{
  "problem_statement": "rumusan masalah yang tajam, spesifik, dan netral",
  "selected_framework": { "name": "nama framework", "reason": "alasan pemilihan" },
  "framework_breakdown": [
    {
      "id": "node-1",
      "label": "nama cabang",
      "question": "pertanyaan analisis",
      "focus": "apa yang dicari",
      "children": ["sub-cabang 1", "sub-cabang 2"]
    }
  ],
  "recommended_solutions": [
    {
      "id": "solution-1",
      "title": "solusi konkret",
      "description": "cara menjalankan solusi",
      "expectedImpact": "perubahan yang diharapkan",
      "effort": "Low"
    }
  ]
}

Framework breakdown harus MECE: cabang tidak tumpang tindih dan bersama-sama mencakup area utama problem.
Berikan 3-5 cabang dan 3-5 solusi yang dapat ditindaklanjuti. Gunakan effort hanya "Low", "Med", atau "High".
Jangan membuat klaim angka atau fakta yang tidak diberikan pengguna. Jika konteks kurang, tuliskan asumsi yang perlu divalidasi di dalam reason atau description.
`;

export async function analyzePstFramework(input: unknown) {
  const request = AnalyzePstFrameworkBody.parse(input);
  const context = [
    `Problem mentah: ${request.problemStatement}`,
    request.targetUser ? `Pengguna terdampak: ${request.targetUser}` : undefined,
    request.additionalContext ? `Konteks tambahan: ${request.additionalContext}` : undefined,
  ].filter(Boolean).join("\n");

  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const completion = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: frameworkAnalysisInstructions },
      { role: "user", content: context },
    ],
  }, { timeout: 45_000 });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned an empty framework analysis.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new Error("LLM returned invalid JSON for framework analysis.", { cause: error });
  }
  const result = AnalyzePstFrameworkResponse.parse(raw);
  const nodeIds = result.framework_breakdown.map((node) => node.id);
  const solutionIds = result.recommended_solutions.map((solution) => solution.id);
  if (new Set(nodeIds).size !== nodeIds.length || new Set(solutionIds).size !== solutionIds.length) {
    throw new Error("LLM returned duplicate framework or solution identifiers.");
  }
  return result;
}