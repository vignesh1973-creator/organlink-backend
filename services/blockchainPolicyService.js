import { ethers } from "ethers";

// Your deployed contract details
const CONTRACT_ADDRESS = "0xbc4d07f282c3bde645d26272994cf70f2ef28381";
const ADMIN_PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY; // Store securely in .env
const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || "https://sepolia.infura.io/v3/YOUR_PROJECT_ID";

// Smart Contract ABI (Application Binary Interface)
const CONTRACT_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "orgAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      }
    ],
    "name": "OrganizationAdded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "policyId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "title",
        "type": "string"
      }
    ],
    "name": "PolicyApproved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "policyId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "title",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      }
    ],
    "name": "PolicyProposed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "policyId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "voter",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "vote",
        "type": "bool"
      }
    ],
    "name": "Voted",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_orgAddress",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      }
    ],
    "name": "addOrganization",
    "outputs": [],
    "stateMutability": "nonpayable",
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
        "internalType": "uint256",
        "name": "_policyId",
        "type": "uint256"
      }
    ],
    "name": "getPolicy",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "title",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "proposer",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "yesVotes",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "noVotes",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isApproved",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTotalPolicies",
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
    "name": "orgCount",
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
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "organizations",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "orgAddress",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "isRegistered",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "policyCount",
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
    "inputs": [
      {
        "internalType": "string",
        "name": "_title",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_description",
        "type": "string"
      }
    ],
    "name": "proposePolicy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_policyId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "_vote",
        "type": "bool"
      }
    ],
    "name": "votePolicy",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

class BlockchainPolicyService {
  constructor() {
    this.provider = null;
    this.adminWallet = null;
    this.contract = null;
    this.initialized = false;
  }

  // Lazy initialization of blockchain connection
  async initialize() {
    if (this.initialized) return;
    
    try {
      if (!ADMIN_PRIVATE_KEY || ADMIN_PRIVATE_KEY === 'your_admin_wallet_private_key') {
        console.warn('Blockchain private key not configured. Blockchain features disabled.');
        return;
      }
      
      this.provider = new ethers.JsonRpcProvider(RPC_URL);
      this.adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, this.provider);
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.adminWallet);
      this.initialized = true;
      console.log('Blockchain policy service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize blockchain service:', error);
      this.initialized = false;
    }
  }

  // Helper method to check if blockchain is available
  async ensureInitialized() {
    await this.initialize();
    if (!this.initialized || !this.contract) {
      throw new Error('Blockchain service not available');
    }
  }

  /**
   * Register a new organization on blockchain
   */
  async registerOrganization(orgName) {
    try {
      await this.ensureInitialized();
      // Generate a unique address for the organization (deterministic)
      const orgAddress = ethers.keccak256(ethers.toUtf8Bytes(orgName)).substring(0, 42);
      
      const tx = await this.contract.addOrganization(orgAddress, orgName);
      const receipt = await tx.wait();
      
      return {
        success: true,
        transactionHash: receipt.hash,
        orgAddress,
        orgName
      };
    } catch (error) {
      console.error("Blockchain org registration error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Propose a new policy on blockchain
   */
  async proposePolicy(title, description, proposerOrgName) {
    try {
      await this.ensureInitialized();
      const tx = await this.contract.proposePolicy(title, description);
      const receipt = await tx.wait();
      
      // Get the new policy ID from the event
      const event = receipt.logs.find(log => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed.name === 'PolicyProposed';
        } catch { return false; }
      });
      
      const policyId = event ? this.contract.interface.parseLog(event).args[0] : null;
      
      return {
        success: true,
        policyId: Number(policyId),
        transactionHash: receipt.hash,
        proposer: proposerOrgName
      };
    } catch (error) {
      console.error("Blockchain policy proposal error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vote on a policy
   */
  async voteOnPolicy(policyId, vote, voterOrgName) {
    try {
      await this.ensureInitialized();
      const tx = await this.contract.votePolicy(policyId, vote);
      const receipt = await tx.wait();
      
      return {
        success: true,
        policyId,
        vote,
        voter: voterOrgName,
        transactionHash: receipt.hash
      };
    } catch (error) {
      console.error("Blockchain voting error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get policy details from blockchain
   */
  async getPolicy(policyId) {
    try {
      await this.ensureInitialized();
      const policy = await this.contract.getPolicy(policyId);
      
      return {
        success: true,
        policy: {
          id: Number(policy.id),
          title: policy.title,
          description: policy.description,
          proposer: policy.proposer,
          yesVotes: Number(policy.yesVotes),
          noVotes: Number(policy.noVotes),
          isActive: policy.isActive,
          isApproved: policy.isApproved,
          totalVotes: Number(policy.yesVotes) + Number(policy.noVotes)
        }
      };
    } catch (error) {
      console.error("Blockchain get policy error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all policies from blockchain
   */
  async getAllPolicies() {
    try {
      await this.ensureInitialized();
      const totalPolicies = await this.contract.getTotalPolicies();
      const policies = [];
      
      for (let i = 1; i <= Number(totalPolicies); i++) {
        const policyResult = await this.getPolicy(i);
        if (policyResult.success) {
          policies.push(policyResult.policy);
        }
      }
      
      return {
        success: true,
        policies,
        totalCount: Number(totalPolicies)
      };
    } catch (error) {
      console.error("Blockchain get all policies error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get approved policies (for AI matching integration)
   */
  async getApprovedPolicies() {
    try {
      const allPoliciesResult = await this.getAllPolicies();
      if (!allPoliciesResult.success) return allPoliciesResult;
      
      const approvedPolicies = allPoliciesResult.policies.filter(p => p.isApproved);
      
      return {
        success: true,
        approvedPolicies,
        count: approvedPolicies.length
      };
    } catch (error) {
      console.error("Get approved policies error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get organization count
   */
  async getOrganizationCount() {
    try {
      await this.ensureInitialized();
      const count = await this.contract.orgCount();
      return {
        success: true,
        count: Number(count)
      };
    } catch (error) {
      console.error("Get org count error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if specific policy is active and approved (for AI integration)
   */
  async isPolicyActive(policyTitle) {
    try {
      const allPoliciesResult = await this.getAllPolicies();
      if (!allPoliciesResult.success) return false;
      
      const policy = allPoliciesResult.policies.find(p => 
        p.title.toLowerCase().includes(policyTitle.toLowerCase()) && p.isApproved
      );
      
      return !!policy;
    } catch (error) {
      console.error("Check policy active error:", error);
      return false;
    }
  }
}

export const blockchainPolicyService = new BlockchainPolicyService();