import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

interface OrganizationJwtPayload {
  organization_id: number;
  email: string;
  name: string;
  type: string;
}

export interface OrganizationRequest extends Request {
  organization?: {
    organization_id: number;
    email: string;
    name: string;
    country: string;
    description: string;
  };
}

export const authenticateOrganization = async (
  req: OrganizationRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : req.cookies?.organization_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'organlink_secret_key_2024'
    ) as OrganizationJwtPayload;

    // Get organization from database to ensure it still exists and is active
    const result = await pool.query(
      'SELECT organization_id, name, email, country, description, is_active FROM organizations WHERE organization_id = $1',
      [decoded.organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Organization not found.',
      });
    }

    const organization = result.rows[0];

    if (!organization.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Organization account is inactive.',
      });
    }

    // Attach organization info to request
    req.organization = organization;
    next();
  } catch (error) {
    console.error('Organization authentication error:', error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token.',
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        error: 'Token expired.',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Server error during authentication.',
    });
  }
};