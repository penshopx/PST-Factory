import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pstRouter from "./pst";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pstRouter);

export default router;
