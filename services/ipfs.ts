import axios from "axios";
import FormData from "form-data";

const PINATA_API_URL = "https://api.pinata.cloud";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export class IPFSService {
  private apiKey: string;
  private apiSecret: string;
  private jwtToken: string;

  constructor() {
    this.apiKey = process.env.PINATA_API_KEY || "";
    this.apiSecret = process.env.PINATA_API_SECRET || "";
    this.jwtToken = process.env.PINATA_JWT_TOKEN || "";
  }

  private headersWithJwt(extra: any = {}) {
    return {
      ...extra,
      Authorization: `Bearer ${this.jwtToken}`,
    };
  }

  private headersWithApiKeys(extra: any = {}) {
    return {
      ...extra,
      pinata_api_key: this.apiKey,
      pinata_secret_api_key: this.apiSecret,
    };
  }

  // Pin file to IPFS
  async pinFile(
    fileBuffer: Buffer,
    fileName: string,
    metadata?: any,
  ): Promise<string> {
    try {
      const formData = new FormData();
      formData.append("file", fileBuffer, fileName);

      if (metadata) {
        formData.append(
          "pinataMetadata",
          JSON.stringify({
            name: fileName,
            keyvalues: metadata,
          }),
        );
      }

      const doPost = (headers: any) =>
        axios.post(`${PINATA_API_URL}/pinning/pinFileToIPFS`, formData, {
          headers: {
            ...formData.getHeaders(),
            ...headers,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 60000,
        });

      // Try JWT first if available
      let response;
      try {
        if (this.jwtToken) {
          response = await doPost(this.headersWithJwt());
        } else {
          throw new Error("NO_JWT");
        }
      } catch (jwtErr: any) {
        const status = jwtErr?.response?.status;
        if (
          (status === 401 || status === 403 || jwtErr?.message === "NO_JWT") &&
          this.apiKey &&
          this.apiSecret
        ) {
          // Fallback to API key/secret
          response = await doPost(this.headersWithApiKeys());
        } else {
          throw jwtErr;
        }
      }

      return response.data.IpfsHash;
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const dataStr = typeof data === "object" ? JSON.stringify(data) : data;
      console.error(
        "IPFS pinning error:",
        status,
        dataStr || error?.message || error,
      );

      // Demo fallback: generate deterministic CID-like hash to unblock flow in non-production
      if (process.env.NODE_ENV !== "production") {
        try {
          const { keccak256, hexlify } = await import("ethers");
          const hash = keccak256(fileBuffer);
          const cid = `demo-${hash}`;
          console.warn("Using demo CID fallback due to IPFS failure:", cid);
          return cid;
        } catch {}
      }

      const msg =
        (data && (data.error || data.message)) ||
        error?.message ||
        "Failed to pin file to IPFS";
      throw new Error(`IPFS error${status ? ` (${status})` : ""}: ${msg}`);
    }
  }

  // Pin JSON data to IPFS
  async pinJSON(jsonData: any, name: string): Promise<string> {
    try {
      const body = {
        pinataContent: jsonData,
        pinataMetadata: { name },
      };

      const doPost = (headers: any) =>
        axios.post(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, body, {
          headers,
          timeout: 30000,
        });

      let response;
      try {
        if (this.jwtToken) {
          response = await doPost({
            "Content-Type": "application/json",
            ...this.headersWithJwt(),
          });
        } else {
          throw new Error("NO_JWT");
        }
      } catch (jwtErr: any) {
        const status = jwtErr?.response?.status;
        if (
          (status === 401 || status === 403 || jwtErr?.message === "NO_JWT") &&
          this.apiKey &&
          this.apiSecret
        ) {
          response = await doPost({
            "Content-Type": "application/json",
            ...this.headersWithApiKeys(),
          });
        } else {
          throw jwtErr;
        }
      }

      return response.data.IpfsHash;
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const dataStr = typeof data === "object" ? JSON.stringify(data) : data;
      console.error(
        "IPFS JSON pinning error:",
        status,
        dataStr || error?.message || error,
      );
      const msg =
        (data && (data.error || data.message)) ||
        error?.message ||
        "Failed to pin JSON to IPFS";
      throw new Error(`IPFS error${status ? ` (${status})` : ""}: ${msg}`);
    }
  }

  // Get file from IPFS
  async getFile(ipfsHash: string): Promise<Buffer> {
    try {
      const response = await axios.get(`${PINATA_GATEWAY}/${ipfsHash}`, {
        responseType: "arraybuffer",
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error("IPFS retrieval error:", error);
      throw new Error("Failed to retrieve file from IPFS");
    }
  }

  // Get file URL
  getFileUrl(ipfsHash: string): string {
    return `${PINATA_GATEWAY}/${ipfsHash}`;
  }

  // Test connection
  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${PINATA_API_URL}/data/testAuthentication`,
        {
          headers: {
            Authorization: `Bearer ${this.jwtToken}`,
          },
        },
      );

      return response.status === 200;
    } catch (error) {
      console.error("IPFS connection test failed:", error);
      return false;
    }
  }

  // Unpin file (optional - for cleanup)
  async unpinFile(ipfsHash: string): Promise<boolean> {
    try {
      await axios.delete(`${PINATA_API_URL}/pinning/unpin/${ipfsHash}`, {
        headers: {
          Authorization: `Bearer ${this.jwtToken}`,
        },
      });

      return true;
    } catch (error) {
      console.error("IPFS unpin error:", error);
      return false;
    }
  }
}

export const ipfsService = new IPFSService();
