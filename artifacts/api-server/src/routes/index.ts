import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pstRouter from "./pst";
import aiRouter from "./ai";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pstRouter);
router.use(aiRouter);
router.use(storageRouter);

export default router;
