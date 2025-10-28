import express from "express";
import { blockchainService } from "../services/blockchain.js";

const router = express.Router();

// Get blockchain status and authorization info
router.get("/status", async (req, res) => {
  try {
    const walletAddress = blockchainService.getWalletAddress();
    const balance = await blockchainService.getBalance();
    const isConnected = await blockchainService.testConnection();

    res.json({
      success: true,
      status: {
        walletAddress,
        balance,
        isConnected,
      },
    });
  } catch (error) {
    console.error("Blockchain status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get blockchain status",
    });
  }
});

export default router;
