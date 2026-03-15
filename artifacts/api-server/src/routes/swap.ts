import { Router } from "express";
import {
  fetchTRXPrice,
  createSwapQuote,
  executeSwap,
  isSwapAvailable,
  getRelayerB58,
  SWAP_FEE_RATE,
  QUOTE_TTL_MS,
  type SwapDirection,
} from "../lib/swapEngine.js";

const swapRouter = Router();

/**
 * GET /swap/rate
 * Returns TRX/USD price, relayer address, fee rate, and whether swaps are available.
 * The relayer address is the destination for the user's input token payment.
 */
swapRouter.get("/swap/rate", async (_req, res) => {
  try {
    const trxUsd = await fetchTRXPrice();
    res.json({
      trxUsd,
      feeRate:        SWAP_FEE_RATE,
      relayerAddress: getRelayerB58(),
      swapAvailable:  isSwapAvailable(),
      quoteTTLms:     QUOTE_TTL_MS,
    });
  } catch (err: any) {
    res.status(503).json({ error: err?.message ?? "No se pudo obtener el precio." });
  }
});

/**
 * POST /swap/quote
 * Creates a server-side quote (one-time use, 60 s TTL).
 * Body: { direction: "usdt_to_trx" | "trx_to_usdt", inputAmount: number }
 * Returns a quoteId that the execute endpoint requires.
 */
swapRouter.post("/swap/quote", async (req, res) => {
  const { direction, inputAmount } = req.body;

  if (!direction || !["usdt_to_trx", "trx_to_usdt"].includes(direction)) {
    res.status(400).json({ error: "direction must be usdt_to_trx or trx_to_usdt." });
    return;
  }
  const amt = parseFloat(inputAmount);
  if (!amt || amt <= 0) {
    res.status(400).json({ error: "inputAmount must be a positive number." });
    return;
  }

  try {
    const quote = await createSwapQuote(direction as SwapDirection, amt);
    res.json(quote);
  } catch (err: any) {
    res.status(503).json({ error: err?.message ?? "Error al crear cotización." });
  }
});

/**
 * POST /swap/execute
 * Executes a swap using a server-side quote.
 * Body: { quoteId: string, signedInputTx: object, userAddress: string }
 *
 * Flow:
 *   1. Validates the quote (must exist and not be expired)
 *   2. Broadcasts user's pre-signed input tx (user → relayer)
 *   3. Sends output tokens from relayer → user
 *   4. Sends 2% fee from relayer → treasury (if configured)
 */
swapRouter.post("/swap/execute", async (req, res) => {
  const { quoteId, signedInputTx, userAddress } = req.body;

  if (!quoteId || typeof quoteId !== "string") {
    res.status(400).json({ error: "quoteId is required." });
    return;
  }
  if (!signedInputTx || typeof signedInputTx !== "object" ||
      !signedInputTx.txID || !signedInputTx.raw_data || !Array.isArray(signedInputTx.signature)) {
    res.status(400).json({ error: "signedInputTx must include txID, raw_data, and signature." });
    return;
  }
  if (!userAddress || typeof userAddress !== "string") {
    res.status(400).json({ error: "userAddress is required." });
    return;
  }

  try {
    const result = await executeSwap(quoteId, signedInputTx, userAddress);
    res.json(result);
  } catch (err: any) {
    console.error("[swap/execute] Error:", err?.message);
    res.status(500).json({ error: err?.message ?? "Error al ejecutar el swap." });
  }
});

export default swapRouter;
