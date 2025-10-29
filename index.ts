import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { handleDemo } from "./routes/demo";
import adminAuthRoutes from "./routes/admin-auth";
import hospitalRoutes from "./routes/hospitals";
import organizationRoutes from "./routes/organizations";
import dashboardRoutes from "./routes/dashboard";
import logsRoutes from "./routes/logs";
import hospitalAuthRoutes from "./routes/hospital-auth";
import hospitalPatientsRoutes from "./routes/hospital-patients";
import hospitalDonorsRoutes from "./routes/hospital-donors";
import hospitalDashboardRoutes from "./routes/hospital-dashboard";
import fileUploadRoutes from "./routes/file-upload";
import hospitalMatchingRoutes from "./routes/hospital-matching";
import hospitalReportsRoutes from "./routes/hospital-reports";
import hospitalNotificationsRoutes from "./routes/hospital-notifications";
import hospitalCleanupRoutes from "./routes/hospital-cleanup";
import adminBlockchainRoutes from "./routes/admin-blockchain";
import adminPasswordResetRoutes from "./routes/admin-password-reset";
import organizationAuthRoutes from "./routes/organization-auth";
import organizationPoliciesRoutes from "./routes/organization-policies";

export function createServer() {
  const app = express();

  // Middleware
  const corsOrigin = process.env.CORS_ORIGIN || "*";
  app.use(
    cors({ origin: corsOrigin === "*" ? true : corsOrigin, credentials: true }),
  );
  app.use(
    helmet({
      frameguard: false, // allow iframe embedding in Builder preview
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Admin routes
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/hospitals", hospitalRoutes);
  app.use("/api/admin/organizations", organizationRoutes);
  app.use("/api/admin/dashboard", dashboardRoutes);
  app.use("/api/admin/logs", logsRoutes);
  app.use("/api/admin/blockchain", adminBlockchainRoutes);
  app.use("/api/admin/password-reset", adminPasswordResetRoutes);

  // Organization routes
  app.use("/api/organization/auth", organizationAuthRoutes);
  app.use("/api/organization/policies", organizationPoliciesRoutes);

  // Hospital routes
  app.use("/api/hospital/auth", hospitalAuthRoutes);
  app.use("/api/hospital/patients", hospitalPatientsRoutes);
  app.use("/api/hospital/donors", hospitalDonorsRoutes);
  app.use("/api/hospital/dashboard", hospitalDashboardRoutes);
  app.use("/api/hospital/upload", fileUploadRoutes);
  app.use("/api/hospital/matching", hospitalMatchingRoutes);
  app.use("/api/hospital/reports", hospitalReportsRoutes);
  app.use("/api/hospital/notifications", hospitalNotificationsRoutes);
  app.use("/api/hospital/cleanup", hospitalCleanupRoutes);

  // Global JSON error handler
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Unhandled server error:", err?.stack || err);
      const msg = err?.message || "Internal server error";
      res.status(500).json({ success: false, error: msg });
    },
  );

  return app;
}
