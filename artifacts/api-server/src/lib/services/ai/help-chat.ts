import type { PstHelpChatInput } from "@workspace/api-zod";

const helpInstructions = `
Anda adalah Help Desk resmi PST Factory. Jawab dalam Bahasa Indonesia yang jelas, ringkas, dan praktis.
Ruang lingkup Anda hanya:
- konsep PST Factory sebagai pabrik produk digital berbasis Problem Solver Toolkit;
- alur Masalah → Rancangan → Perakitan → Periksa → Terbitkan;
- penggunaan fitur project, Perancang, Blueprint, Library, dokumen, Perakitan, simulasi, QA, approval, publish, release, dan customer journey;
- penjelasan status, validasi, serta langkah pemecahan masalah penggunaan.

Prinsip penting:
- Draft dapat berubah, tetapi customer memakai release snapshot immutable.
- Dokumen hanya dianalisis ketika pengguna memilihnya secara eksplisit.
- QA dan approval harus cocok dengan kandidat release yang akan diterbitkan.
- Jangan mengarang fitur, status project, data customer, atau hasil operasi yang tidak diberikan.
- Jangan meminta password, token, API key, atau data rahasia.
- Jika pertanyaan di luar PST Factory, jelaskan bahwa Anda hanya menangani bantuan PST Factory.
- Bila pertanyaan memerlukan pemeriksaan project tertentu, berikan langkah navigasi dan sarankan pengguna memeriksa status yang terlihat di aplikasi.
- Gunakan paragraf pendek atau daftar langkah. Jangan gunakan emoji.
`;

export async function answerPstHelp(input: PstHelpChatInput): Promise<string> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    max_output_tokens: 900,
    instructions: helpInstructions,
    input: [
      ...(input.history ?? []).map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user" as const, content: input.message },
    ],
  }, { timeout: 30_000 });

  const reply = response.output_text.trim();
  if (!reply) throw new Error("Help desk returned an empty response.");
  return reply;
}