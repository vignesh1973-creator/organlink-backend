import { ethers } from "ethers";

// ABIs for deployed contracts
const SIGNATURE_VERIFIER_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "docHash", type: "bytes32" },
      { internalType: "string", name: "ipfsCid", type: "string" },
      { internalType: "uint16", name: "ocrScoreBps", type: "uint16" },
      { internalType: "bool", name: "verified", type: "bool" },
    ],
    name: "attestOcr",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "docHash", type: "bytes32" }],
    name: "getLatest",
    outputs: [
      {
        components: [
          { internalType: "bytes32", name: "docHash", type: "bytes32" },
          { internalType: "string", name: "ipfsCid", type: "string" },
          { internalType: "bool", name: "ocrVerified", type: "bool" },
          { internalType: "uint16", name: "ocrScoreBps", type: "uint16" },
          { internalType: "bool", name: "sigVerified", type: "bool" },
          { internalType: "address", name: "claimedSigner", type: "address" },
          { internalType: "uint8", name: "status", type: "uint8" },
          { internalType: "uint48", name: "attestedAt", type: "uint48" },
          { internalType: "address", name: "attestedBy", type: "address" },
          { internalType: "uint32", name: "version", type: "uint32" },
        ],
        internalType: "struct OrganLinkSignatureVerifier.Record",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

// OrganLink Registry ABI
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
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "recordId",
        "type": "uint256"
      },
      {
        "indexed": false,
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

const POLICY_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "address", name: "manager", type: "address" },
    ],
    name: "createOrganization",
    outputs: [{ internalType: "uint256", name: "orgId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "orgId", type: "uint256" },
      { internalType: "bool", name: "active", type: "bool" },
    ],
    name: "setOrganizationActive",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "proposerOrgId", type: "uint256" },
      { internalType: "string", name: "ipfsCid", type: "string" },
      { internalType: "uint48", name: "startTime", type: "uint48" },
      { internalType: "uint48", name: "endTime", type: "uint48" },
    ],
    name: "createProposalOnBehalf",
    outputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "proposalId", type: "uint256" },
      { internalType: "uint256", name: "voterOrgId", type: "uint256" },
      { internalType: "uint8", name: "vote", type: "uint8" },
    ],
    name: "castVoteOnBehalf",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "finalize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "getProposal",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id", type: "uint256" },
          { internalType: "uint256", name: "proposerOrgId", type: "uint256" },
          { internalType: "string", name: "ipfsCid", type: "string" },
          { internalType: "uint48", name: "startTime", type: "uint48" },
          { internalType: "uint48", name: "endTime", type: "uint48" },
          { internalType: "uint8", name: "status", type: "uint8" },
          { internalType: "uint32", name: "eligibleCount", type: "uint32" },
          { internalType: "uint32", name: "forVotes", type: "uint32" },
          { internalType: "uint32", name: "againstVotes", type: "uint32" },
          { internalType: "uint32", name: "abstainVotes", type: "uint32" },
          { internalType: "bool", name: "passed", type: "bool" },
        ],
        internalType: "struct OrganLinkPolicyByOrganization.Proposal",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "getTally",
    outputs: [
      { internalType: "uint32", name: "forVotes", type: "uint32" },
      { internalType: "uint32", name: "againstVotes", type: "uint32" },
      { internalType: "uint32", name: "abstainVotes", type: "uint32" },
      { internalType: "uint32", name: "eligibleCount", type: "uint32" },
    ],
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
];

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private signatureVerifier: ethers.Contract;
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

    // Contracts
    const signatureAddress =
      process.env.SIGNATURE_VERIFIER_ADDRESS ||
      "0xac793b5fadbb6c5284e9fcc0bd25d770fb33439f";
    const policyAddress =
      process.env.POLICY_CONTRACT_ADDRESS ||
      "0xe84ef74ae1ec05e8650c2cd2b5e9579fec5c6c92";

    this.signatureVerifier = new ethers.Contract(
      signatureAddress,
      SIGNATURE_VERIFIER_ABI,
      this.wallet,
    );

    this.policyContract = new ethers.Contract(
      policyAddress,
      POLICY_ABI,
      this.wallet,
    );

    // OrganLink Registry Contract
    const registryAddress =
      process.env.ORGANLINK_REGISTRY_ADDRESS ||
      "0x019a2e46ea0838f324986d1c428c3d78bf73cf71";
    
    this.organLinkRegistry = new ethers.Contract(
      registryAddress,
      ORGANLINK_REGISTRY_ABI,
      this.wallet,
    );
  }

  // ========== Signature Verifier ==========
  async attestOcr(
    docHash: string,
    ipfsCid: string,
    ocrScoreBps: number,
    verified: boolean,
  ): Promise<string> {
    const tx = await this.signatureVerifier.attestOcr(
      docHash,
      ipfsCid,
      ocrScoreBps,
      verified,
    );
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async getLatest(docHash: string): Promise<any> {
    return await this.signatureVerifier.getLatest(docHash);
  }

  // ========== Policy Governance ==========
  async setOrganizationActive(orgId: number, active: boolean): Promise<string> {
    const tx = await this.policyContract.setOrganizationActive(orgId, active);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async createProposalOnBehalf(
    proposerOrgId: number,
    ipfsCid: string,
    startTime: number,
    endTime: number,
  ): Promise<{ txHash: string; proposalId: string }> {
    const tx = await this.policyContract.createProposalOnBehalf(
      proposerOrgId,
      ipfsCid,
      startTime,
      endTime,
    );
    const receipt = await tx.wait();
    const proposalId = await this.extractReturnValueFromReceipt(receipt);
    return {
      txHash: receipt.hash as string,
      proposalId: String(proposalId ?? ""),
    };
  }

  async castVoteOnBehalf(
    proposalId: number,
    voterOrgId: number,
    vote: 1 | 2 | 3,
  ): Promise<string> {
    const tx = await this.policyContract.castVoteOnBehalf(
      proposalId,
      voterOrgId,
      vote,
    );
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async finalize(proposalId: number): Promise<string> {
    const tx = await this.policyContract.finalize(proposalId);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async getProposal(proposalId: number): Promise<any> {
    return await this.policyContract.getProposal(proposalId);
  }

  async getTally(proposalId: number): Promise<{
    forVotes: number;
    againstVotes: number;
    abstainVotes: number;
    eligibleCount: number;
  }> {
    const [forVotes, againstVotes, abstainVotes, eligibleCount] =
      await this.policyContract.getTally(proposalId);
    return {
      forVotes: Number(forVotes),
      againstVotes: Number(againstVotes),
      abstainVotes: Number(abstainVotes),
      eligibleCount: Number(eligibleCount),
    };
  }

  async createOrganization(orgId: number, name: string): Promise<{ txHash: string; blockchainOrgId?: number }> {
    try {
      console.log(`Creating/registering organization ${orgId} (${name}) on blockchain...`);
      
      // Call the contract function - it returns the orgId directly
      const tx = await this.policyContract.createOrganization(name, this.wallet.address);
      const receipt = await tx.wait();
      console.log(`Organization registered: ${receipt.hash}`);
      
      // The createOrganization function returns the orgId
      // Try multiple methods to extract it
      let blockchainOrgId;
      
      // Method 1: Check events
      if (receipt && receipt.logs && receipt.logs.length > 0) {
        console.log(`Checking ${receipt.logs.length} logs for org ID...`);
        try {
          for (const log of receipt.logs) {
            try {
              const parsed = this.policyContract.interface.parseLog({
                topics: [...log.topics],
                data: log.data
              });
              
              console.log(`Parsed log event: ${parsed?.name}`);
              
              if (parsed && parsed.args) {
                // Check for orgId in different possible field names
                if (parsed.args.orgId !== undefined) {
                  blockchainOrgId = Number(parsed.args.orgId);
                  console.log(`✅ Found blockchain org ID in event: ${blockchainOrgId}`);
                  break;
                } else if (parsed.args[0] !== undefined) {
                  // Sometimes the first argument is the orgId
                  blockchainOrgId = Number(parsed.args[0]);
                  console.log(`✅ Found blockchain org ID in args[0]: ${blockchainOrgId}`);
                  break;
                }
              }
            } catch (parseError) {
              // Skip logs that can't be parsed
              continue;
            }
          }
        } catch (e) {
          console.warn('Error parsing logs:', e);
        }
      }
      
      // Method 2: If we still don't have an ID, query the contract
      if (blockchainOrgId === undefined) {
        console.log('Could not extract org ID from events, querying contract...');
        try {
          // Call a view function to get the org count (the newly created org should be the last one)
          const orgCount = await this.policyContract.orgCount();
          blockchainOrgId = Number(orgCount);
          console.log(`✅ Using org count as ID: ${blockchainOrgId}`);
        } catch (e) {
          console.warn('Could not get org count from contract:', e);
        }
      }
      
      if (blockchainOrgId !== undefined) {
        console.log(`🎯 Final blockchain org ID: ${blockchainOrgId}`);
      } else {
        console.warn('⚠️ Could not determine blockchain org ID');
      }
      
      return { txHash: receipt.hash as string, blockchainOrgId };
    } catch (error: any) {
      // If organization already exists, that's okay - return the DB orgId to use
      if (error.message?.includes('already exists') || error.message?.includes('Org exists')) {
        console.log(`Organization ${orgId} already registered on blockchain, using DB ID`);
        return { txHash: 'already_exists', blockchainOrgId: orgId };
      }
      console.error('Error creating organization on blockchain:', error);
      throw error;
    }
  }

  // ========== OrganLink Registry ==========
  
  // Generate patient hash using the same pattern as in the workflow
  generatePatientHash(name: string, dob: string, id: string, bloodGroup: string): string {
    const dataString = `${name}|${dob}|${id}|${bloodGroup}`;
    return ethers.keccak256(ethers.toUtf8Bytes(dataString));
  }

  // Add a verified record to blockchain
  async addVerifiedRecord(patientHash: string, hospitalName: string, ipfsCID: string): Promise<string> {
    try {
      console.log('Adding record to blockchain:', { patientHash, hospitalName, ipfsCID });
      
      // Validate inputs
      if (!patientHash || !hospitalName || !ipfsCID) {
        throw new Error('Missing required parameters for blockchain record');
      }
      
      // Ensure parameters are strings
      const hashString = patientHash.toString();
      const nameString = hospitalName.toString();
      const cidString = ipfsCID.toString();
      
      console.log('Calling contract with:', { hashString, nameString, cidString });
      
      const tx = await this.organLinkRegistry.addVerifiedRecord(hashString, nameString, cidString);
      console.log('Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transaction mined:', receipt.hash);
      
      return receipt.hash;
    } catch (error) {
      console.error('Blockchain error:', error);
      
      // For development, return a mock hash if blockchain fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('Using mock blockchain hash for development');
        const mockHash = `0x${'mock'.padEnd(64, '0')}`;
        return mockHash;
      }
      
      throw new Error(`Failed to add record to blockchain: ${error}`);
    }
  }

  // Get a record from blockchain
  async getRegistryRecord(recordId: number): Promise<{
    patientHash: string;
    hospitalName: string;
    ipfsCID: string;
    timestamp: number;
  }> {
    try {
      const result = await this.organLinkRegistry.getRecord(recordId);
      return {
        patientHash: result[0],
        hospitalName: result[1],
        ipfsCID: result[2],
        timestamp: Number(result[3])
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
