import { ethers } from "ethers";

// OrganLink Registry ABI (OrganLinkRegistry.sol) - Enhanced with Aadhaar + OCR verification
const ORGANLINK_REGISTRY_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_patientHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "_hospitalName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_verificationType",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "_ocrVerified",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "_ipfsCID",
        "type": "string"
      }
    ],
    "name": "addVerifiedRecord",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      }
    ],
    "name": "getRecord",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "patientHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "hospitalName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "verificationType",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "ocrVerified",
        "type": "bool"
      },
      {
        "internalType": "string",
        "name": "ipfsCID",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "recordCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "admin",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newAdmin",
        "type": "address"
      }
    ],
    "name": "changeAdmin",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "recordId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "patientHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "hospitalName",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "verificationType",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "ocrVerified",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "ipfsCID",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "RecordAdded",
    "type": "event"
  }
];

// ABI for OrgPolicyVoting.sol
const POLICY_ABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "orgAddress", type: "address" },
      { indexed: false, internalType: "string", name: "name", type: "string" },
    ],
    name: "OrganizationAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "policyId", type: "uint256" },
      { indexed: false, internalType: "string", name: "title", type: "string" },
    ],
    name: "PolicyApproved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "policyId", type: "uint256" },
      { indexed: false, internalType: "string", name: "title", type: "string" },
      { indexed: false, internalType: "address", name: "proposer", type: "address" },
    ],
    name: "PolicyProposed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "policyId", type: "uint256" },
      { indexed: false, internalType: "address", name: "voter", type: "address" },
      { indexed: false, internalType: "bool", name: "vote", type: "bool" },
    ],
    name: "Voted",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "_orgAddress", type: "address" },
      { internalType: "string", name: "_name", type: "string" },
    ],
    name: "addOrganization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "admin",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_policyId", type: "uint256" }],
    name: "getPolicy",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "description", type: "string" },
      { internalType: "address", name: "proposer", type: "address" },
      { internalType: "uint256", name: "yesVotes", type: "uint256" },
      { internalType: "uint256", name: "noVotes", type: "uint256" },
      { internalType: "bool", name: "isActive", type: "bool" },
      { internalType: "bool", name: "isApproved", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTotalPolicies",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "orgCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "organizations",
    outputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "address", name: "orgAddress", type: "address" },
      { internalType: "bool", name: "isRegistered", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "policyCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "_title", type: "string" },
      { internalType: "string", name: "_description", type: "string" },
    ],
    name: "proposePolicy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_policyId", type: "uint256" },
      { internalType: "bool", name: "_vote", type: "bool" },
    ],
    name: "votePolicy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private policyContract: ethers.Contract;
  private organLinkRegistry: ethers.Contract;

  constructor() {
    // Provider & wallet
    const rpcUrl =
      process.env.INFURA_API_URL ||
      "https://sepolia.infura.io/v3/6587311a93fe4c34adcef72bd583ea46";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.METAMASK_PRIVATE_KEY || "";
    this.wallet = new ethers.Wallet(privateKey, this.provider);

    // OrgPolicyVoting Contract
    const policyAddress =
      process.env.POLICY_CONTRACT_ADDRESS ||
      "0x43f973a6f01cd2003035a0ef9d4293a1c136413f";

    this.policyContract = new ethers.Contract(
      policyAddress,
      POLICY_ABI,
      this.wallet,
    );

    // OrganLink Registry Contract (Enhanced with Aadhaar support + OCR verification)
    // This contract combines registry AND signature verification functionality
    const registryAddress =
      process.env.ORGANLINK_REGISTRY_ADDRESS ||
      "0xFf0398328fc43d500536D03f3FEBCa0F66A528eC";
    
    this.organLinkRegistry = new ethers.Contract(
      registryAddress,
      ORGANLINK_REGISTRY_ABI,
      this.wallet,
    );
  }

  // ========== Policy Governance (OrgPolicyVoting.sol) ==========
  
  // Add organization to voting contract (admin only on contract side)
  async addOrganization(orgAddress: string, name: string): Promise<string> {
    try {
      console.log(`Adding organization ${name} (${orgAddress}) to voting contract...`);
      const tx = await this.policyContract.addOrganization(orgAddress, name);
      const receipt = await tx.wait();
      console.log(`Organization added: ${receipt.hash}`);
      return receipt.hash as string;
    } catch (error: any) {
      if (error.message?.includes('Already registered')) {
        console.log(`Organization ${name} already registered on blockchain`);
        return 'already_exists';
      }
      console.error('Error adding organization:', error);
      throw error;
    }
  }

  // Propose a new policy
  async proposePolicy(title: string, description: string): Promise<string> {
    const tx = await this.policyContract.proposePolicy(title, description);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  // Vote on a policy
  async votePolicy(policyId: number, vote: boolean): Promise<string> {
    const tx = await this.policyContract.votePolicy(policyId, vote);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  // Get policy details
  async getPolicy(policyId: number): Promise<any> {
    return await this.policyContract.getPolicy(policyId);
  }

  // Get total policies count
  async getTotalPolicies(): Promise<number> {
    const count = await this.policyContract.getTotalPolicies();
    return Number(count);
  }

  // Get organization count
  async getOrgCount(): Promise<number> {
    const count = await this.policyContract.orgCount();
    return Number(count);
  }

  // ========== OCR Verification (via Registry Contract) ==========
  // Note: OCR verification is now part of the addVerifiedRecord function
  // The registry contract handles both record storage AND OCR verification

  // ========== OrganLink Registry ==========
  
  // Generate patient hash using the same pattern as in the workflow
  generatePatientHash(name: string, dob: string, id: string, bloodGroup: string): string {
    const dataString = `${name}|${dob}|${id}|${bloodGroup}`;
    return ethers.keccak256(ethers.toUtf8Bytes(dataString));
  }

  // Add a verified record to blockchain (enhanced with verification type)
  async addVerifiedRecord(
    patientHash: string, 
    hospitalName: string, 
    ipfsCID: string,
    verificationType: string = 'signature',
    ocrVerified: boolean = false
  ): Promise<string> {
    try {
      console.log('Adding record to blockchain:', { 
        patientHash, 
        hospitalName, 
        ipfsCID, 
        verificationType, 
        ocrVerified 
      });
      
      // Validate inputs
      if (!patientHash || !hospitalName || !ipfsCID) {
        throw new Error('Missing required parameters for blockchain record');
      }
      
      // Validate verification type
      if (verificationType !== 'signature' && verificationType !== 'aadhaar') {
        console.warn(`Invalid verification type: ${verificationType}, defaulting to 'signature'`);
        verificationType = 'signature';
      }
      
      // Ensure parameters are correct types
      const hashString = patientHash.toString();
      const nameString = hospitalName.toString();
      const typeString = verificationType.toString();
      const verifiedBool = Boolean(ocrVerified);
      const cidString = ipfsCID.toString();
      
      console.log('Calling contract with:', { 
        hashString, 
        nameString, 
        typeString, 
        verifiedBool, 
        cidString 
      });
      
      const tx = await this.organLinkRegistry.addVerifiedRecord(
        hashString, 
        nameString, 
        typeString,
        verifiedBool,
        cidString
      );
      console.log('Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transaction mined:', receipt.hash);
      
      return receipt.hash;
    } catch (error) {
      console.error('Blockchain error:', error);
      
      // For development, return a mock hash if blockchain fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using mock blockchain hash for development');
        const mockHash = `0x${Date.now().toString(16).padEnd(64, '0')}`;
        return mockHash;
      }
      
      throw new Error(`Failed to add record to blockchain: ${error}`);
    }
  }

  // Get a record from blockchain (enhanced with verification type)
  async getRegistryRecord(recordId: number): Promise<{
    patientHash: string;
    hospitalName: string;
    verificationType: string;
    ocrVerified: boolean;
    ipfsCID: string;
    timestamp: number;
  }> {
    try {
      const result = await this.organLinkRegistry.getRecord(recordId);
      return {
        patientHash: result[0],
        hospitalName: result[1],
        verificationType: result[2],
        ocrVerified: result[3],
        ipfsCID: result[4],
        timestamp: Number(result[5])
      };
    } catch (error) {
      console.error('Error getting record:', error);
      throw new Error(`Failed to get record: ${error}`);
    }
  }

  // Get total record count
  async getRegistryRecordCount(): Promise<number> {
    try {
      const count = await this.organLinkRegistry.recordCount();
      return Number(count);
    } catch (error) {
      console.error('Error getting record count:', error);
      throw new Error(`Failed to get record count: ${error}`);
    }
  }

  // ========== Utility & Status ==========
  getWalletAddress(): string {
    return this.wallet.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.provider.getNetwork();
      return true;
    } catch (e) {
      return false;
    }
  }

  private async extractReturnValueFromReceipt(
    receipt: ethers.TransactionReceipt,
  ) {
    try {
      // Ethers v6 does not decode return values from events automatically here;
      // many OpenZeppelin functions emit events with the created id. Consumers
      // should read events or re-query chain. We'll just return undefined here.
      return undefined;
    } catch {
      return undefined;
    }
  }
}

export const blockchainService = new BlockchainService();
