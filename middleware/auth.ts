import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "organlink_secret_key_2024";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    type: "admin" | "hospital" | "organization";
  };
  hospital?: {
    hospital_id: string;
    hospital_name: string;
    email: string;
    city: string;
    country: string;
  };
  hospitalId?: string; // For convenience
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const tokenHeader = authHeader && authHeader.split(" ")[1];
  const cookies = (req as any).cookies || {};
  const token =
    tokenHeader ||
    cookies.admin_token ||
    cookies.hospital_token ||
    cookies.organization_token;

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || req.user.type !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

export const authenticateHospital = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const tokenHeader = authHeader && authHeader.split(" ")[1];
  const cookies = (req as any).cookies || {};
  const token = tokenHeader || cookies.hospital_token;

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err: any, hospital: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.hospital = hospital;
    req.hospitalId = hospital.hospital_id; // For convenience
    next();
  });
};

export const requireHospital = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.hospital) {
    return res.status(403).json({ error: "Hospital access required" });
  }
  next();
};

export const authenticateOrganization = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const tokenHeader = authHeader && authHeader.split(" ")[1];
  const cookies = (req as any).cookies || {};
  const token = tokenHeader || cookies.organization_token;

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

export const generateToken = (payload: any) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
};
