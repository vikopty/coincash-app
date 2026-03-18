import { Router, type IRouter } from "express";
import healthRouter from "./health";
import blacklistRouter from "./blacklist";
import relayRouter from "./relay";
import bitraceProxyRouter from "./bitraceProxy";
import riskAnalysisRouter from "./riskAnalysis";
import bitraceBlacklistRouter from "./bitraceBlacklist";
import swapRouter from "./swap";
import usersRouter from "./users";
import chatRouter from "./chat";
import dmRouter from "./dm";
import storageRouter from "./storage";
import pushRouter from "./push";
import visitsRouter from "./visits";
import authRouter from "./auth";
import scanRouter from "./scan";
import tronRouter from "./tron";

const router: IRouter = Router();

router.use(healthRouter);
router.use(blacklistRouter);
router.use(relayRouter);
router.use(bitraceProxyRouter);
router.use(riskAnalysisRouter);
router.use(bitraceBlacklistRouter);
router.use(swapRouter);
router.use(usersRouter);
router.use(chatRouter);
router.use(dmRouter);
router.use(storageRouter);
router.use(pushRouter);
router.use(visitsRouter);
router.use(authRouter);
router.use(scanRouter);
router.use(tronRouter);

export default router;
