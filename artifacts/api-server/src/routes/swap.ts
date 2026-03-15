import { Router } from "express";
import {
  fetchFFRate,
  createSwapQuote,
  executeSwap,
  isSwapAvailable,
  getRelayerB58,
  COINCASH_FEE_USDT,
  QUOTE_TTL_MS,
  type SwapDirection,
} from "../lib/swapEngine.js";
import { isFFConfigured } from "../lib/fixedFloat.js";

const swapRouter = Router();

/**
 * GET /swap/rate
 * Returns current TRX/USDT exchange rate from FixedFloat (falls back to CoinGecko).
 * The relayerAddress is where the user sends their input tokens.
 */
swapRouter.get("/swap/rate", async (_req, res) => {
  try {
    const { trxUsd, trxPerUsdt } = await fetchFFRate();
    res.json({
      trxUsd,
      trxPerUsdt,
      feeRate:        0,              // no CoinCash % swap fee — FF spread built-in
      coinCashFee:    COINCASH_FEE_USDT,
      relayerAddress: getRelayerB58(),
      swapAvailable:  isSwapAvailable(),
      ffConfigured:   isFFConfigured(),
      quoteTTLms:     QUOTE_TTL_MS,
      provider:       "fixedfloat",
    });
  } catch (err: any) {
    res.status(503).json({ error: err?.message ?? "No se pudo obtener el precio." });
  }
});

/**
 * POST /swap/quote
 * Creates a server-side quote using FixedFloat /price (one-time use, 90 s TTL).
 * Body: { direction: "usdt_to_trx" | "trx_to_usdt", inputAmount: number }
 */
swapRouter.post("/swap/quote", async (req, res) => {
  const { direction, inputAmount } = req.body;

  if (!direction || !["usdt_to_trx", "trx_to_usdt"].includes(direction)) {
    res.status(400).json({ error: "direction must be usdt_to_trx or trx_to_usdt." });
    return;
  }
  const amt = parseFloat(String(inputAmount).replace(/,/g, "."));
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
 * Executes a swap:
 *  1. Creates FixedFloat order (gets deposit address + expected output)
 *  2. Broadcasts user's pre-signed input tx (user → relayer)
 *  3. Relayer forwards swapAmount to FF deposit address
 *  4. FF delivers output to user's wallet (async — may take a few minutes)
 *  5. Logs the full order to database
 *
 * Body: { quoteId: string, signedInputTx: object, userAddress: string }
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
