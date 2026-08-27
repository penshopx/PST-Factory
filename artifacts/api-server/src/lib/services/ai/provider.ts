export type ArchitectContext = {
  problem: string;
  targetUser: string;
  desiredOutcome: string;
  additionalContext?: string;
  pattern?: { name: string; steps: string[] };
  recipe?: { name: string; components: string[] };
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

export class MockAIProvider implements AIProvider {
  async proposeBlueprint(context: ArchitectContext): Promise<ArchitectProposal> {
    const hasDecisionLanguage = /decide|decision|choose|pilih|keputusan/i.test(
      context.problem,
    );
    return {
      problemType: hasDecisionLanguage ? "Decision support" : "Assessment and action planning",
      journey: ["Profile", "Understand", "Assess", "Analyze", "Recommend", "Action plan"],
      knowledgeRequirements: [
        "A concise domain guide",
        "Clear criteria and expert rules",
        context.additionalContext ? "Creator-provided context" : "Context captured from the user",
      ],
      componentRequirements: ["Guided assessment", "Scoring logic", "Recommendation", "Action plan"],
      aiRequirements: [
        "Explain the assessment result in plain language",
        "Recommend the next best action",
        "State assumptions and limitations",
      ],
      expectedOutput: ["Assessment summary", "Priority recommendation", "Practical next steps"],
      actionPlan: [
        "Complete the assessment",
        "Review the recommendation",
        "Choose one next action",
      ],
      nextStep: "Review and approve the proposed blueprint",
    };
  }
}

export const aiProvider: AIProvider = new MockAIProvider();