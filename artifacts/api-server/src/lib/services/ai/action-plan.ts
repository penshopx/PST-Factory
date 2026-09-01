import { ConvertPstActionPlanBody, ConvertPstActionPlanResponse } from "@workspace/api-zod";

function priorityFor(
  effort: "Low" | "Med" | "High",
  title: string,
  index: number,
): "High" | "Med" | "Low" {
  if (/(urgent|kritis|risiko|blokir|segera|critical|blocker)/i.test(title)) return "High";
  if (index === 0) return "High";
  if (effort === "High") return "Med";
  return index === 1 ? "Med" : "Low";
}

function timelineFor(priority: "High" | "Med" | "Low", effort: "Low" | "Med" | "High") {
  if (priority === "High") return effort === "High" ? "Minggu 1–2" : "Minggu 1";
  if (priority === "Med") return effort === "High" ? "Minggu 2–4" : "Minggu 2–3";
  return "Setelah prioritas utama stabil";
}

export function convertPstActionPlan(input: unknown) {
  const request = ConvertPstActionPlanBody.parse(input);
  const actionPlan = request.solutions.map((solution, index) => {
    const priority = priorityFor(solution.effort, solution.title, index);
    return {
      task_title: `Jalankan: ${solution.title}`,
      description: `${solution.description}${request.frameworkName ? ` Acuan: ${request.frameworkName}.` : ""}`,
      priority,
      suggested_timeline: timelineFor(priority, solution.effort),
      success_metric: solution.expectedImpact || `Solusi "${solution.title}" selesai dijalankan dan ditinjau oleh pemilik masalah.`,
    };
  });
  return ConvertPstActionPlanResponse.parse({ action_plan: actionPlan });
}