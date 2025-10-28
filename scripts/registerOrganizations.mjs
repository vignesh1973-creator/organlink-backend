import "dotenv/config";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0xe84ef74ae1ec05e8650c2cd2b5e9579fec5c6c92";
const ADMIN_PRIVATE_KEY = process.env.METAMASK_PRIVATE_KEY || "3bd2be9a27a02febd7c8a21f4d73bc9fd5a57d7521b60c78fbe029c10331189d";
const RPC_URL = process.env.INFURA_API_URL || "https://sepolia.infura.io/v3/6587311a93fe4c34adcef72bd583ea46";

const ABI = [
  {
    inputs: [
      { internalType: "address", name: "_orgAddress", type: "address" },
      { internalType: "string", name: "_name", type: "string" }
    ],
    name: "addOrganization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "orgCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

async function registerOrganizations() {
  console.log("🚀 Registering organizations on blockchain...\n");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  console.log(`Admin wallet: ${wallet.address}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}\n`);

  const organizations = [
    {
      name: "National Kidney Board",
      address: "0x118F031F28B0a4a7B99fD8938158539C2282F2FA"
    },
    {
      name: "Liver Health Council",
      address: "0xC8b8E0D8E5a5F5c5D5c5c5c5c5c5c5c5c5c5c5c5"
    }
  ];

  for (const org of organizations) {
    try {
      console.log(`Registering: ${org.name} (${org.address})...`);
      const tx = await contract.addOrganization(org.address, org.name);
      console.log(`  Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Confirmed in block ${receipt.blockNumber}\n`);
    } catch (error) {
      if (error.message?.includes('Already registered')) {
        console.log(`  ✅ Already registered\n`);
      } else {
        console.error(`  ❌ Error: ${error.message}\n`);
      }
    }
  }

  // Check final count
  const count = await contract.orgCount();
  console.log(`\n🎉 Total organizations registered: ${count}`);
}

registerOrganizations().catch(console.error);
