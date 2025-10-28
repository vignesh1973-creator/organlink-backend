import express from "express";
import { authenticateOrganization, AuthRequest } from "../middleware/auth.js";
import { orgPolicyVotingService } from "../services/orgPolicyVoting.js";
import { pool } from "../config/database.js";
import { ipfsService } from "../services/ipfs.js";
import NotificationService from "../services/notificationService.js";

const router = express.Router();

// All routes require organization auth
router.use(authenticateOrganization);

function requireOrganization(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!req.user || req.user.type !== "organization") {
    return res
      .status(403)
      .json({ success: false, error: "Organization access required" });
  }
  next();
}

router.use(requireOrganization);

// Create proposal by receiving a rich form (title/rationale/parameters/hours)
router.post("/propose-form", async (req: AuthRequest, res) => {
  try {
    const { title, rationale, parameters, hours } = req.body as any;
    if (!title || !rationale)
      return res
        .status(400)
        .json({ success: false, error: "title and rationale are required" });

    const orgRes = await pool.query(
      "SELECT organization_id as id, name, blockchain_org_id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    if (!orgRes.rows.length)
      return res
        .status(404)
        .json({ success: false, error: "Organization not found" });
    const proposerOrgId = Number(orgRes.rows[0].id);

    let parsedParams: any = undefined;
    try {
      if (parameters) parsedParams = JSON.parse(parameters);
    } catch {}

    const payload = {
      title,
      rationale,
      parameters: parsedParams ?? parameters ?? null,
      createdAt: new Date().toISOString(),
    };
    const cid = await ipfsService.pinJSON(payload, `policy_${Date.now()}`);

    // Register organization on blockchain (idempotent)
    const regResult = await orgPolicyVotingService.registerOrganization(proposerOrgId, orgRes.rows[0].name);
    if (!regResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to register organization: ' + regResult.error
      });
    }

    // Create details JSON with all policy info
    const detailsJSON = JSON.stringify({
      rationale,
      parameters: parsedParams,
      ipfsCid: cid,
      createdAt: new Date().toISOString()
    });

    // Propose policy on blockchain (voting duration from hours parameter)
    const votingDays = Math.ceil(Math.max(1, Number(hours) || 24) / 24);
    const proposeResult = await orgPolicyVotingService.proposePolicy(
      orgRes.rows[0].name,
      title,
      rationale,
      detailsJSON,
      votingDays
    );

    if (!proposeResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to propose policy: ' + proposeResult.error
      });
    }

    const { txHash, policyId: proposalId } = proposeResult;

    // Insert policy into database and get the generated policy_id
    const policyInsertResult = await pool.query(
      `INSERT INTO policies (title, description, policy_content, status, proposer_org_id, votes_for, votes_against, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, 0, CURRENT_TIMESTAMP)
       RETURNING policy_id`,
      [title, `IPFS ${cid}`, rationale, "voting", proposerOrgId],
    );
    
    const policyId = policyInsertResult.rows[0].policy_id;

    // Notify all other organizations about the new policy proposal
    try {
      const allOrgsResult = await pool.query(
        "SELECT organization_id, name FROM organizations WHERE organization_id != $1",
        [proposerOrgId]
      );
      
      for (const org of allOrgsResult.rows) {
        const notificationId = `notif_${Date.now()}_${org.organization_id}_${Math.random().toString(36).substr(2, 9)}`;
        await pool.query(
          `INSERT INTO notifications (notification_id, organization_id, type, title, message, related_id, is_read, created_at)
           VALUES ($1, $2, 'policy_proposal', $3, $4, $5, false, CURRENT_TIMESTAMP)`,
          [
            notificationId,
            org.organization_id,
            "New Policy Proposal",
            `${orgRes.rows[0].name} proposed "${title}". Vote now!`,
            policyId.toString()
          ]
        );
      }
      console.log(`✅ Notified ${allOrgsResult.rows.length} organizations about new policy`);
    } catch (notifError) {
      console.error("Failed to send notifications:", notifError);
    }

    res.json({ success: true, txHash, proposalId, ipfsCid: cid });
  } catch (error: any) {
    console.error("Propose-form error:", error);
    res
      .status(500)
      .json({
        success: false,
        error: error.message || "Failed to create proposal",
      });
  }
});

// Create a proposal on behalf of the authenticated organization
router.post("/propose", async (req: AuthRequest, res) => {
  try {
    const { ipfs_cid, start_time, end_time } = req.body as any;
    if (!ipfs_cid || !end_time) {
      return res
        .status(400)
        .json({ success: false, error: "ipfs_cid and end_time are required" });
    }

    // Lookup org id from DB by email
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    if (!orgRes.rows.length)
      return res
        .status(404)
        .json({ success: false, error: "Organization not found" });
    const proposerOrgId = Number(orgRes.rows[0].id);

    const now = Math.floor(Date.now() / 1000);
    const start = Number(start_time || now);
    const end = Number(end_time);

    // Ensure organization is registered on blockchain before proposing
    try {
      await blockchainService.createOrganization(proposerOrgId, 'Organization');
    } catch (error) {
      console.warn('Organization registration failed, but continuing:', error);
    }

    const { txHash, proposalId } =
      await blockchainService.createProposalOnBehalf(
        proposerOrgId,
        String(ipfs_cid),
        start,
        end,
      );

    // Store basic metadata for listing
    await pool.query(
      `INSERT INTO policies (title, description, category, status, proposer_org_id, votes_for, votes_against, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, 0, CURRENT_TIMESTAMP)`,
      [
        `Policy ${proposalId}`,
        `IPFS ${ipfs_cid}`,
        "governance",
        "voting",
        proposerOrgId,
      ],
    );

    res.json({ success: true, txHash, proposalId });
  } catch (error: any) {
    console.error("Create proposal error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create proposal",
    });
  }
});

// Cast a vote on behalf of an organization (For=1, Against=2, Abstain=3)
router.post("/vote", async (req: AuthRequest, res) => {
  try {
    const { proposal_id, vote } = req.body as any;
    if (!proposal_id || !vote)
      return res
        .status(400)
        .json({ success: false, error: "proposal_id and vote required" });

    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    if (!orgRes.rows.length)
      return res
        .status(404)
        .json({ success: false, error: "Organization not found" });
    const voterOrgId = Number(orgRes.rows[0].id);

    // Ensure organization is registered on blockchain before voting
    try {
      await blockchainService.createOrganization(voterOrgId, 'Organization');
    } catch (error) {
      console.warn('Organization registration failed, but continuing:', error);
    }

    const txHash = await blockchainService.castVoteOnBehalf(
      Number(proposal_id),
      voterOrgId,
      Number(vote) as 1 | 2 | 3,
    );

    res.json({ success: true, txHash });
  } catch (error: any) {
    console.error("Vote error:", error);
    res
      .status(500)
      .json({ success: false, error: error.message || "Failed to cast vote" });
  }
});

// Finalize a proposal (admin action ideally, but allow org demo)
router.post("/finalize", async (_req: AuthRequest, res) => {
  try {
    const { proposal_id } = _req.body as any;
    if (!proposal_id)
      return res
        .status(400)
        .json({ success: false, error: "proposal_id required" });

    const txHash = await blockchainService.finalize(Number(proposal_id));

    // Reflect in local DB if present
    try {
      const tally = await blockchainService.getTally(Number(proposal_id));
      const passed =
        tally.eligibleCount > 0 &&
        tally.forVotes * 100 >= 50 * tally.eligibleCount;
      await pool.query(
        `UPDATE policies SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE title = $2`,
        [passed ? "approved" : "rejected", `Policy ${proposal_id}`],
      );
    } catch {}

    res.json({ success: true, txHash });
  } catch (error: any) {
    console.error("Finalize error:", error);
    res
      .status(500)
      .json({ success: false, error: error.message || "Failed to finalize" });
  }
});

// Read proposal info+tally
router.get("/proposal/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const proposal = await blockchainService.getProposal(id);
    const tally = await blockchainService.getTally(id);
    res.json({ success: true, proposal, tally });
  } catch (error: any) {
    console.error("Get proposal error:", error);
    res
      .status(500)
      .json({ success: false, error: error.message || "Failed to fetch" });
  }
});

// Get dashboard statistics for organization
router.get("/dashboard-stats", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    
    // Get active policies count (not deleted)
    const activePoliciesResult = await pool.query(
      "SELECT COUNT(*) as count FROM policies WHERE status != 'deleted'"
    );
    
    // Get my proposals count
    const myProposalsResult = await pool.query(
      "SELECT COUNT(*) as count FROM policies WHERE proposer_org_id = $1 AND status != 'deleted'",
      [orgId]
    );
    
    // Get pending votes (policies I haven't voted on yet)
    const pendingVotesResult = await pool.query(
      `SELECT COUNT(*) as count FROM policies p
       WHERE p.status = 'voting' 
         AND p.proposer_org_id != $1
         AND NOT EXISTS (
           SELECT 1 FROM policy_votes pv 
           WHERE pv.policy_id = p.policy_id AND pv.organization_id = $1
         )`,
      [orgId]
    );
    
    // Get total votes I've cast
    const totalVotesResult = await pool.query(
      "SELECT COUNT(*) as count FROM policy_votes WHERE organization_id = $1",
      [orgId]
    );

    res.json({
      success: true,
      stats: {
        activePolicies: parseInt(activePoliciesResult.rows[0]?.count || 0),
        myProposals: parseInt(myProposalsResult.rows[0]?.count || 0),
        pendingVotes: parseInt(pendingVotesResult.rows[0]?.count || 0),
        totalVotes: parseInt(totalVotesResult.rows[0]?.count || 0)
      }
    });
  } catch (error: any) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch dashboard stats"
    });
  }
});

// Get active proposals requiring votes
router.get("/dashboard-active-proposals", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    
    // Get active proposals this org hasn't voted on yet
    const proposalsResult = await pool.query(
      `SELECT 
        p.policy_id as id,
        p.title,
        LEFT(p.policy_content, 100) as description,
        p.votes_for as "votesFor",
        p.votes_against as "votesAgainst",
        p.total_votes as "totalVotes",
        (SELECT COUNT(*) FROM organizations WHERE organization_id != p.proposer_org_id) as "eligibleVoters",
        CASE 
          WHEN p.total_votes > 0 THEN ROUND((p.votes_for::numeric / p.total_votes::numeric) * 100)
          ELSE 0
        END as approval,
        p.created_at as "createdAt"
       FROM policies p
       WHERE p.status = 'voting'
         AND p.proposer_org_id != $1
         AND NOT EXISTS (
           SELECT 1 FROM policy_votes pv 
           WHERE pv.policy_id = p.policy_id AND pv.organization_id = $1
         )
       ORDER BY p.created_at DESC
       LIMIT 5`,
      [orgId]
    );

    res.json({
      success: true,
      proposals: proposalsResult.rows
    });
  } catch (error: any) {
    console.error("Get active proposals error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch active proposals"
    });
  }
});

// Get recent activity
router.get("/dashboard-recent-activity", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    
    // Get recent activities: my proposals and my votes
    const activitiesResult = await pool.query(
      `SELECT 
        'policy_proposed' as type,
        p.title as action,
        'Policy proposed by you' as description,
        p.status as status,
        p.created_at as timestamp
       FROM policies p
       WHERE p.proposer_org_id = $1 AND p.status != 'deleted'
       UNION ALL
       SELECT 
        'policy_voted' as type,
        p.title as action,
        CASE WHEN pv.vote THEN 'You voted YES' ELSE 'You voted NO' END as description,
        p.status as status,
        pv.created_at as timestamp
       FROM policy_votes pv
       JOIN policies p ON pv.policy_id = p.policy_id
       WHERE pv.organization_id = $1
       ORDER BY timestamp DESC
       LIMIT 10`,
      [orgId]
    );

    res.json({
      success: true,
      activities: activitiesResult.rows
    });
  } catch (error: any) {
    console.error("Get recent activity error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch recent activity"
    });
  }
});

// Get notifications for current organization
router.get("/notifications", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    
    const notificationsResult = await pool.query(
      `SELECT notification_id, title, message, type as related_type, related_id, created_at, is_read
       FROM notifications
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [orgId]
    );

    res.json({
      success: true,
      notifications: notificationsResult.rows
    });
  } catch (error: any) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch notifications"
    });
  }
});

// Mark notification as read
router.post("/notifications/:id/read", async (req: AuthRequest, res) => {
  try {
    const notificationId = req.params.id;
    
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE notification_id = $1",
      [notificationId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Mark notification as read error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to mark notification as read"
    });
  }
});

// Withdraw a policy within 24 hours (proposer only)
router.post("/policies/:policy_id/withdraw", async (req: AuthRequest, res) => {
  try {
    const { policy_id } = req.params;
    const { reason } = req.body;
    
    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;

    // Check if policy exists and belongs to this organization
    const policyResult = await pool.query(
      `SELECT policy_id, title, proposer_org_id, status, created_at, votes_for, votes_against, total_votes,
              is_withdrawn, is_suspended
       FROM policies 
       WHERE policy_id = $1`,
      [policy_id]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Policy not found"
      });
    }

    const policy = policyResult.rows[0];

    // Only proposer can withdraw
    if (policy.proposer_org_id !== orgId) {
      return res.status(403).json({
        success: false,
        error: "Only the proposer can withdraw this policy"
      });
    }

    // Check if already withdrawn or suspended
    if (policy.is_withdrawn) {
      return res.status(400).json({
        success: false,
        error: "Policy has already been withdrawn"
      });
    }

    if (policy.is_suspended) {
      return res.status(400).json({
        success: false,
        error: "Policy is already suspended"
      });
    }

    // Check if within 24 hours
    const createdAt = new Date(policy.created_at);
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceCreation > 24) {
      return res.status(400).json({
        success: false,
        error: "Policy can only be withdrawn within 24 hours of creation"
      });
    }

    // Determine if policy is active (has > 50% yes votes)
    const totalVotes = policy.total_votes || 0;
    const votesFor = policy.votes_for || 0;
    const isActive = totalVotes > 0 && (votesFor / totalVotes) > 0.5;

    if (isActive) {
      // Policy is active - SUSPEND it (still visible but not used in AI)
      await pool.query(
        `UPDATE policies 
         SET is_suspended = true, 
             suspended_at = CURRENT_TIMESTAMP,
             withdrawal_reason = $2
         WHERE policy_id = $1`,
        [policy_id, reason || 'Withdrawn by proposer']
      );

      // Notify all organizations
      const allOrgsResult = await pool.query(
        "SELECT organization_id FROM organizations WHERE organization_id != $1",
        [orgId]
      );
      
      for (const org of allOrgsResult.rows) {
        const notificationId = `notif_${Date.now()}_${org.organization_id}_${Math.random().toString(36).substr(2, 9)}`;
        await pool.query(
          `INSERT INTO notifications (notification_id, organization_id, type, title, message, related_id, is_read, created_at)
           VALUES ($1, $2, 'policy_suspended', $3, $4, $5, false, CURRENT_TIMESTAMP)`,
          [
            notificationId,
            org.organization_id,
            "Policy Suspended",
            `The active policy "${policy.title}" has been suspended by its proposer.`,
            policy_id.toString()
          ]
        );
      }

      return res.json({
        success: true,
        action: 'suspended',
        message: `Policy "${policy.title}" has been suspended. It will no longer affect AI matching but remains visible for transparency.`
      });
    } else {
      // Policy is NOT active - WITHDRAW it (soft delete, hide from others)
      await pool.query(
        `UPDATE policies 
         SET is_withdrawn = true, 
             withdrawn_at = CURRENT_TIMESTAMP,
             withdrawal_reason = $2,
             status = 'withdrawn'
         WHERE policy_id = $1`,
        [policy_id, reason || 'Withdrawn by proposer']
      );

      // Delete notifications for non-proposer organizations
      await pool.query(
        `DELETE FROM notifications 
         WHERE related_id = $1 
           AND type = 'policy_proposal' 
           AND organization_id != $2`,
        [policy_id, orgId]
      );

      return res.json({
        success: true,
        action: 'withdrawn',
        message: `Policy "${policy.title}" has been withdrawn and is no longer visible to other organizations.`
      });
    }
  } catch (error: any) {
    console.error("Withdraw policy error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to withdraw policy"
    });
  }
});

// Delete a policy (only proposer, only if no votes cast)
router.delete("/policies/:policy_id", async (req: AuthRequest, res) => {
  try {
    const { policy_id } = req.params;
    
    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;

    // Check if policy exists and belongs to this organization
    const policyResult = await pool.query(
      "SELECT policy_id, title, proposer_org_id, total_votes FROM policies WHERE policy_id = $1",
      [policy_id]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Policy not found"
      });
    }

    const policy = policyResult.rows[0];

    // Only proposer can delete
    if (policy.proposer_org_id !== orgId) {
      return res.status(403).json({
        success: false,
        error: "Only the proposer can delete this policy"
      });
    }

    // Cannot delete if votes have been cast
    if (policy.total_votes > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete policy that has received votes"
      });
    }

    // Mark as deleted (soft delete - change status to 'deleted' to preserve history)
    await pool.query(
      "UPDATE policies SET status = 'deleted' WHERE policy_id = $1",
      [policy_id]
    );

    // Delete notifications related to this policy
    await pool.query(
      "DELETE FROM notifications WHERE related_id = $1 AND type = 'policy_proposal'",
      [policy_id]
    );

    res.json({
      success: true,
      message: `Policy "${policy.title}" has been deleted successfully`
    });
  } catch (error: any) {
    console.error("Delete policy error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete policy"
    });
  }
});

// Vote on a policy (new blockchain system)
router.post("/vote-policy", async (req: AuthRequest, res) => {
  try {
    const { policy_id, vote } = req.body as any;
    
    if (!policy_id || vote === undefined) {
      return res.status(400).json({
        success: false,
        error: "policy_id and vote are required"
      });
    }

    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    const orgName = orgRes.rows[0].name;

    // Check if already voted
    const existingVote = await pool.query(
      "SELECT vote_id FROM policy_votes WHERE policy_id = $1 AND organization_id = $2",
      [policy_id, orgId]
    );

    if (existingVote.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "You have already voted on this policy"
      });
    }

    // Vote on blockchain (vote is boolean: true = yes, false = no)
    // NOTE: Currently using database-only voting due to single admin wallet limitation
    // All orgs share the same blockchain wallet, so we track votes in DB instead
    let txHash = 'db_only_vote';
    
    /* Blockchain voting disabled - would require separate wallets per org
    const voteResult = await orgPolicyVotingService.voteOnPolicy(
      orgName,
      Number(policy_id),
      Boolean(vote)
    );

    if (!voteResult.success) {
      if (voteResult.error?.includes('Already voted')) {
        return res.status(400).json({
          success: false,
          error: "You have already voted on this policy"
        });
      }
      return res.status(500).json({
        success: false,
        error: "Failed to vote on blockchain: " + voteResult.error
      });
    }
    txHash = voteResult.txHash;
    */

    // Record vote in database
    await pool.query(
      "INSERT INTO policy_votes (policy_id, organization_id, vote) VALUES ($1, $2, $3)",
      [policy_id, orgId, vote]
    );

    // Update vote counts in database
    const voteColumn = vote ? 'votes_for' : 'votes_against';
    await pool.query(
      `UPDATE policies 
       SET ${voteColumn} = ${voteColumn} + 1, 
           total_votes = total_votes + 1
       WHERE policy_id = $1`,
      [policy_id]
    );

    res.json({
      success: true,
      txHash: txHash
    });
  } catch (error: any) {
    console.error("Vote on policy error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to vote on policy"
    });
  }
});

// Delete a policy (only if no votes yet)
router.delete("/delete/:id", async (req: AuthRequest, res) => {
  try {
    const policyId = req.params.id;
    
    // Get organization
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    // Check if policy belongs to this org
    const policyRes = await pool.query(
      "SELECT proposer_org_id, total_votes FROM policies WHERE policy_id = $1",
      [policyId]
    );

    if (!policyRes.rows.length) {
      return res.status(404).json({ success: false, error: "Policy not found" });
    }

    if (policyRes.rows[0].proposer_org_id !== orgRes.rows[0].id) {
      return res.status(403).json({ success: false, error: "You can only delete your own policies" });
    }

    if (policyRes.rows[0].total_votes > 0) {
      return res.status(400).json({ success: false, error: "Cannot delete policy that has votes" });
    }

    // Delete policy
    await pool.query("DELETE FROM policies WHERE policy_id = $1", [policyId]);

    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete policy error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to delete policy" });
  }
});

// Get dashboard stats
router.get("/dashboard-stats", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const orgId = orgRes.rows[0].id;

    // Get total active policies (only count policies with 'active' status, not 'voting')
    const activePolicies = await pool.query(
      "SELECT COUNT(*) as count FROM policies WHERE status = 'active'"
    );

    // Get my proposals
    const myProposals = await pool.query(
      "SELECT COUNT(*) as count FROM policies WHERE proposer_org_id = $1",
      [orgId]
    );

    // Get pending votes (policies I haven't voted on yet)
    const pendingVotes = await pool.query(
      `SELECT COUNT(*) as count FROM policies p 
       WHERE p.status = 'voting' 
       AND p.proposer_org_id != $1
       AND NOT EXISTS (
         SELECT 1 FROM policy_votes pv 
         WHERE pv.policy_id = p.policy_id 
         AND pv.organization_id = $1
       )`,
      [orgId]
    );

    // Get total votes cast
    const totalVotes = await pool.query(
      "SELECT COUNT(*) as count FROM policy_votes WHERE organization_id = $1",
      [orgId]
    );

    res.json({
      success: true,
      stats: {
        activePolicies: Number(activePolicies.rows[0].count),
        myProposals: Number(myProposals.rows[0].count),
        pendingVotes: Number(pendingVotes.rows[0].count),
        totalVotes: Number(totalVotes.rows[0].count)
      }
    });
  } catch (error: any) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch dashboard stats"
    });
  }
});

// Get active proposals for dashboard
router.get("/dashboard-active-proposals", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const orgId = orgRes.rows[0].id;

    // Get policies where current org hasn't voted yet
    const result = await pool.query(
      `SELECT p.policy_id, p.title, p.description, p.votes_for, p.votes_against, 
              p.total_votes, p.created_at
       FROM policies p
       WHERE p.status = 'voting'
       AND p.proposer_org_id != $1
       AND NOT EXISTS (
         SELECT 1 FROM policy_votes pv 
         WHERE pv.policy_id = p.policy_id AND pv.organization_id = $1
       )
       ORDER BY p.created_at DESC
       LIMIT 3`,
      [orgId]
    );

    // Get total eligible voters
    const totalOrgsResult = await pool.query(
      "SELECT COUNT(*) as count FROM organizations"
    );
    const totalOrgs = Number(totalOrgsResult.rows[0].count);

    const proposals = result.rows.map(p => ({
      id: p.policy_id,
      title: p.title,
      description: p.description || 'No description',
      votesFor: p.votes_for || 0,
      votesAgainst: p.votes_against || 0,
      totalVotes: p.total_votes || 0,
      eligibleVoters: totalOrgs - 1,
      approval: p.total_votes > 0 ? Math.round((p.votes_for / p.total_votes) * 100) : 0,
      createdAt: p.created_at
    }));

    res.json({ success: true, proposals });
  } catch (error: any) {
    console.error("Get active proposals error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch active proposals"
    });
  }
});

// Get recent activity for dashboard
router.get("/dashboard-recent-activity", async (req: AuthRequest, res) => {
  try {
    const orgRes = await pool.query(
      "SELECT organization_id as id FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({ success: false, error: "Organization not found" });
    }

    const orgId = orgRes.rows[0].id;

    // Get recent votes by this organization
    const votesResult = await pool.query(
      `SELECT pv.vote, pv.voted_at, p.title, p.policy_id, p.status
       FROM policy_votes pv
       JOIN policies p ON pv.policy_id = p.policy_id
       WHERE pv.organization_id = $1
       ORDER BY pv.voted_at DESC
       LIMIT 3`,
      [orgId]
    );

    // Get recent proposals by this organization
    const proposalsResult = await pool.query(
      `SELECT p.policy_id, p.title, p.created_at, p.status, p.total_votes
       FROM policies p
       WHERE p.proposer_org_id = $1
       ORDER BY p.created_at DESC
       LIMIT 2`,
      [orgId]
    );

    const activities = [];

    // Add votes to activity
    votesResult.rows.forEach(v => {
      activities.push({
        type: 'vote',
        action: `Voted ${v.vote ? 'YES' : 'NO'} on ${v.title}`,
        description: `Policy ID: POL-${v.policy_id}`,
        status: v.status === 'active' ? 'APPROVED' : 'PENDING',
        timestamp: v.voted_at
      });
    });

    // Add proposals to activity
    proposalsResult.rows.forEach(p => {
      activities.push({
        type: 'proposal',
        action: `Proposed ${p.title}`,
        description: `Policy ID: POL-${p.policy_id} - ${p.total_votes || 0} votes received`,
        status: p.status === 'active' ? 'APPROVED' : 'PENDING',
        timestamp: p.created_at
      });
    });

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({ success: true, activities: activities.slice(0, 3) });
  } catch (error: any) {
    console.error("Get recent activity error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch recent activity"
    });
  }
});

// Get all policies from database (separated into my policies and others)
router.get("/list", async (req: AuthRequest, res) => {
  try {
    // Get current organization
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const currentOrgId = orgRes.rows[0].id;
    
    // Get all policies with organization names including pause status
    const policiesResult = await pool.query(
      `SELECT p.policy_id, p.title, p.description, p.policy_content,
              p.status, p.proposer_org_id, p.votes_for, p.votes_against, 
              p.total_votes, p.created_at, p.paused_for_matching,
              o.name as proposer_name
       FROM policies p
       LEFT JOIN organizations o ON p.proposer_org_id = o.organization_id
       ORDER BY p.created_at DESC`
    );

    // Get voting status for current org
    const votesResult = await pool.query(
      "SELECT policy_id, vote FROM policy_votes WHERE organization_id = $1",
      [currentOrgId]
    );
    
    const votesMap = new Map();
    votesResult.rows.forEach((v: any) => {
      votesMap.set(v.policy_id, v.vote);
    });

    // Get total eligible voters (all orgs except proposer)
    const totalOrgsResult = await pool.query(
      "SELECT COUNT(*) as count FROM organizations"
    );
    const totalOrgs = Number(totalOrgsResult.rows[0].count);

    // Separate into my policies and others
    const myPolicies = [];
    const otherPolicies = [];

    for (const policy of policiesResult.rows) {
      const hasVoted = votesMap.has(policy.policy_id);
      const myVote = votesMap.get(policy.policy_id);
      
      // Calculate eligible voters (total orgs - 1 for proposer)
      const eligibleVoters = totalOrgs - 1;
      const actualVotes = policy.total_votes || 0;
      
      const policyData = {
        id: policy.policy_id,
        title: policy.title,
        description: policy.description,
        content: policy.policy_content,
        category: 'Kidney', // Default category
        status: policy.status,
        paused_for_matching: policy.paused_for_matching || false,
        proposer: policy.proposer_name || 'Unknown Organization',
        votesFor: policy.votes_for || 0,
        votesAgainst: policy.votes_against || 0,
        totalVotes: actualVotes,
        eligibleVoters,
        voteProgress: `${actualVotes}/${eligibleVoters}`,
        approval: actualVotes > 0 
          ? Math.round((policy.votes_for / actualVotes) * 100) 
          : 0,
        createdAt: policy.created_at,
        isMyProposal: policy.proposer_org_id === currentOrgId,
        hasVoted,
        myVote: hasVoted ? (myVote ? 'YES' : 'NO') : null
      };

      if (policy.proposer_org_id === currentOrgId) {
        myPolicies.push(policyData);
      } else {
        otherPolicies.push(policyData);
      }
    }

    res.json({
      success: true,
      myPolicies,
      otherPolicies,
      total: policiesResult.rows.length
    });
  } catch (error: any) {
    console.error("Get policies list error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch policies"
    });
  }
});

// NEW BLOCKCHAIN POLICY SYSTEM ROUTES
// These routes use the new OrgPolicyVoting contract

// Get all policies from new blockchain system
router.get("/blockchain/policies", async (req: AuthRequest, res) => {
  try {
    // Get policies from new blockchain
    const blockchainResult = await blockchainPolicyService.getAllPolicies();
    
    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch policies from blockchain",
      });
    }

    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    const orgName = orgRes.rows[0].name;

    // Get voting status from database
    const votingStatus = await pool.query(
      "SELECT policy_id, vote, voted_at FROM blockchain_policy_votes WHERE organization_id = $1",
      [orgId]
    );

    const votingMap = new Map();
    votingStatus.rows.forEach((row: any) => {
      votingMap.set(row.policy_id.toString(), {
        vote: row.vote,
        voted_at: row.voted_at
      });
    });

    // Combine blockchain data with voting status
    const enrichedPolicies = blockchainResult.policies.map((policy: any) => ({
      ...policy,
      user_vote: votingMap.get(policy.id.toString()),
      can_vote: policy.isActive && !votingMap.has(policy.id.toString()),
      voting_progress: {
        total_votes: policy.totalVotes,
        yes_percentage: policy.totalVotes > 0 ? Math.round((policy.yesVotes / policy.totalVotes) * 100) : 0,
        no_percentage: policy.totalVotes > 0 ? Math.round((policy.noVotes / policy.totalVotes) * 100) : 0
      }
    }));

    res.json({
      success: true,
      policies: enrichedPolicies,
      total_policies: blockchainResult.totalCount,
      organization_name: orgName,
      blockchain_connected: true
    });
  } catch (error: any) {
    console.error("Get blockchain policies error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch policies",
    });
  }
});

// Propose a new policy using new blockchain system
router.post("/blockchain/propose", async (req: AuthRequest, res) => {
  try {
    const { title, description } = req.body as any;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: "Title and description are required",
      });
    }

    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    const orgName = orgRes.rows[0].name;

    // Register organization on blockchain if not already registered
    await blockchainPolicyService.registerOrganization(orgName);

    // Propose policy on blockchain
    const blockchainResult = await blockchainPolicyService.proposePolicy(
      title,
      description,
      orgName
    );

    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to propose policy on blockchain: " + blockchainResult.error,
      });
    }

    // Store proposal in database for tracking
    await pool.query(
      `INSERT INTO blockchain_policy_proposals (
        policy_id, organization_id, title, description, 
        blockchain_tx_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        blockchainResult.policyId,
        orgId,
        title,
        description,
        blockchainResult.transactionHash
      ]
    );

    res.json({
      success: true,
      policy_id: blockchainResult.policyId,
      transaction_hash: blockchainResult.transactionHash,
      message: "Policy proposed successfully on blockchain",
    });
  } catch (error: any) {
    console.error("Propose blockchain policy error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to propose policy",
    });
  }
});

// Vote on a policy using new blockchain system
router.post("/blockchain/:policyId/vote", async (req: AuthRequest, res) => {
  try {
    const { policyId } = req.params;
    const { vote } = req.body as any;

    if (typeof vote !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Vote must be true (Yes) or false (No)",
      });
    }

    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id as id, name FROM organizations WHERE email = $1",
      [req.user!.email],
    );
    
    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    const orgId = orgRes.rows[0].id;
    const orgName = orgRes.rows[0].name;

    // Check if organization has already voted
    const existingVote = await pool.query(
      "SELECT * FROM blockchain_policy_votes WHERE organization_id = $1 AND policy_id = $2",
      [orgId, policyId]
    );

    if (existingVote.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Organization has already voted on this policy",
      });
    }

    // Submit vote to blockchain
    const blockchainResult = await blockchainPolicyService.voteOnPolicy(
      parseInt(policyId),
      vote,
      orgName
    );

    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to submit vote to blockchain: " + blockchainResult.error,
      });
    }

    // Store vote in database
    await pool.query(
      `INSERT INTO blockchain_policy_votes (
        organization_id, policy_id, vote, blockchain_tx_hash, voted_at
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [orgId, policyId, vote, blockchainResult.transactionHash]
    );

    // Get updated policy status from blockchain
    const policyResult = await blockchainPolicyService.getPolicy(parseInt(policyId));

    res.json({
      success: true,
      vote,
      transaction_hash: blockchainResult.transactionHash,
      policy_status: policyResult.success ? policyResult.policy : null,
      message: `Vote ${vote ? 'Yes' : 'No'} submitted successfully`,
    });
  } catch (error: any) {
    console.error("Vote blockchain policy error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to submit vote",
    });
  }
});

// Get approved policies for AI integration
router.get("/blockchain/approved", async (req: AuthRequest, res) => {
  try {
    const blockchainResult = await blockchainPolicyService.getApprovedPolicies();
    
    if (!blockchainResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch approved policies from blockchain",
      });
    }

    res.json({
      success: true,
      approved_policies: blockchainResult.approvedPolicies,
      count: blockchainResult.count,
    });
  } catch (error: any) {
    console.error("Get approved blockchain policies error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch approved policies",
    });
  }
});

// Pause or resume policy from AI matching consideration
// Only the policy proposer organization can pause their own policies
router.post("/policies/:policyId/toggle-pause", async (req: AuthRequest, res) => {
  try {
    const { policyId } = req.params;
    const { paused } = req.body; // true = pause, false = resume

    if (typeof paused !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "'paused' field must be true or false",
      });
    }

    // Get organization info
    const orgRes = await pool.query(
      "SELECT organization_id FROM organizations WHERE email = $1",
      [req.user!.email],
    );

    if (!orgRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Organization not found",
      });
    }

    const orgId = orgRes.rows[0].organization_id;

    // Check if policy exists and belongs to this organization
    const policyRes = await pool.query(
      "SELECT * FROM policies WHERE policy_id = $1 AND proposer_org_id = $2",
      [policyId, orgId],
    );

    if (!policyRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Policy not found or you don't have permission to modify it",
      });
    }

    const policy = policyRes.rows[0];

    // Only allow pausing active policies
    if (policy.status !== "active") {
      return res.status(400).json({
        success: false,
        error: "Only active policies can be paused/resumed",
      });
    }

    // Update the paused_for_matching flag
    await pool.query(
      "UPDATE policies SET paused_for_matching = $1 WHERE policy_id = $2",
      [paused, policyId],
    );

    res.json({
      success: true,
      message: paused
        ? "Policy paused for AI matching. It will no longer be considered in organ allocation."
        : "Policy resumed for AI matching. It will now be considered in organ allocation.",
      policy_id: policyId,
      paused_for_matching: paused,
    });
  } catch (error: any) {
    console.error("Toggle policy pause error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle policy pause status",
    });
  }
});

export default router;
