export interface GustaftaEngine {
  getPersona(): Promise<{ name: string; mode: string }>;
  generateAIResponse(input: string): Promise<string>;
  retrieveKnowledge(query: string): Promise<string[]>;
}

/**
 * Development adapter only. The interface is intentionally provider-neutral
 * until the real Gustafta API contract is available.
 */
export class MockGustaftaEngine implements GustaftaEngine {
  async getPersona() {
    return { name: "PST Guide", mode: "MOCK" };
  }

  async generateAIResponse(input: string) {
    return `MOCK Gustafta response for: ${input}`;
  }

  async retrieveKnowledge(query: string) {
    return [`MOCK knowledge reference for: ${query}`];
  }
}

export const gustaftaEngine: GustaftaEngine = new MockGustaftaEngine();