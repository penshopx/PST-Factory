import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  AnalyzePstFrameworkBody,
  AnalyzePstFrameworkResponse,
  ConvertPstActionPlanBody,
  ConvertPstActionPlanResponse,
} from "@workspace/api-zod";
import { analyzePstFramework } from "../lib/services/ai/framework-analyzer";
import { convertPstActionPlan } from "../lib/services/ai/action-plan";
import { consumeAnalysisQuota } from "../lib/services/ai/quota";

const router: IRouter = Router();

router.post("/pst/framework-analyzer", async (req, res): Promise<void> => {
  const body = AnalyzePstFrameworkBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const userId = getAuth(req).userId;
  if (!userId || !consumeAnalysisQuota(userId)) {
    res.status(429).json({ error: "Batas analisis tercapai. Coba lagi dalam beberapa menit.", retryable: true });
    return;
  }
  try {
    res.json(AnalyzePstFrameworkResponse.parse(await analyzePstFramework(body.data)));
  } catch (error) {
    req.log.warn({ err: error }, "PST framework analysis failed");
    res.status(502).json({ error: "Analisis AI tidak tersedia. Coba lagi sebentar.", retryable: true });
  }
});

router.post("/pst/action-plan", (req, res): void => {
  const body = ConvertPstActionPlanBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  res.json(ConvertPstActionPlanResponse.parse(convertPstActionPlan(body.data)));
});

export default router;