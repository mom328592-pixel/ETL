const crypto = require("crypto");
const pool = require("../db");
const { createAuditLog } = require("../utils/audit");

const FRONTEND_URL = (process.env.FRONTEND_URL || "https://eltsimu.vercel.app").replace(/\/+$/, "");

const createPublicToken = () => crypto.randomBytes(32).toString("hex");

const buildPublicLink = (token) =>
    `${FRONTEND_URL}/customer-registration/${encodeURIComponent(token)}`;

// =========================
// GET ALL AGENTS
// =========================
const getAllAgents = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                a.id_agent,
                a.agent_name,
                a.contact_phone,
                a.contact_email,
                a.address,
                a.public_token,
                a.created_by,
                u.username AS created_by_username,
                a.created_at,
                a.updated_at
            FROM agents a
            LEFT JOIN users u ON a.created_by = u.id_user
            WHERE a.deleted_at IS NULL
            ORDER BY a.id_agent DESC
        `);

        res.json({
            success: true,
            message: "Agents retrieved successfully",
            data: rows.map((row) => ({
                ...row,
                public_link: buildPublicLink(row.public_token)
            }))
        });
    } catch (error) {
        console.error("GET /agents ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

// =========================
// GET AGENT BY ID
// =========================
const getAgentById = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                a.id_agent,
                a.agent_name,
                a.contact_phone,
                a.contact_email,
                a.address,
                a.public_token,
                a.created_by,
                u.username AS created_by_username,
                a.created_at,
                a.updated_at
            FROM agents a
            LEFT JOIN users u ON a.created_by = u.id_user
            WHERE a.id_agent = ? AND a.deleted_at IS NULL
        `, [req.params.id]);

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        res.json({
            success: true,
            message: "Agent retrieved successfully",
            data: {
                ...rows[0],
                public_link: buildPublicLink(rows[0].public_token)
            }
        });
    } catch (error) {
        console.error("GET /agents/:id ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

// =========================
// CREATE AGENT
// =========================
const createAgent = async (req, res) => {
    try {
        const { agent_name, contact_phone, contact_email, address } = req.body;

        if (!agent_name?.trim()) {
            return res.status(400).json({ success: false, message: "Agent name is required" });
        }

        const publicToken = createPublicToken();
        const [result] = await pool.query(`
            INSERT INTO agents (
                agent_name, contact_phone, contact_email, address, public_token, created_by
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            agent_name.trim(),
            contact_phone || null,
            contact_email || null,
            address || null,
            publicToken,
            req.user.id_user
        ]);

        const publicLink = buildPublicLink(publicToken);

        await createAuditLog({
            req,
            action: "CREATE",
            targetEntity: "agents",
            targetId: result.insertId,
            metadata: { agent_name: agent_name.trim(), public_link: publicLink }
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: "Agent created successfully",
            data: { id_agent: result.insertId, public_token: publicToken, public_link: publicLink }
        });
    } catch (error) {
        console.error("POST /agents ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

// =========================
// UPDATE AGENT
// =========================
const updateAgent = async (req, res) => {
    try {
        const { id } = req.params;
        const { agent_name, contact_phone, contact_email, address } = req.body;

        if (!agent_name?.trim()) {
            return res.status(400).json({ success: false, message: "agent_name is required" });
        }

        const [result] = await pool.query(`
            UPDATE agents
            SET agent_name=?, contact_phone=?, contact_email=?, address=?
            WHERE id_agent=? AND deleted_at IS NULL
        `, [
            agent_name.trim(),
            contact_phone || null,
            contact_email || null,
            address || null,
            id
        ]);

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        const [rows] = await pool.query(`
            SELECT a.*, u.username AS created_by_username
            FROM agents a
            LEFT JOIN users u ON a.created_by=u.id_user
            WHERE a.id_agent=?
        `, [id]);

        await createAuditLog({
            req,
            action: "UPDATE",
            targetEntity: "agents",
            targetId: id,
            metadata: { agent_name: agent_name.trim() }
        }).catch(() => {});

        res.json({
            success: true,
            message: "Agent updated successfully",
            data: { ...rows[0], public_link: buildPublicLink(rows[0].public_token) }
        });
    } catch (error) {
        console.error("PUT /agents/:id ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

// =========================
// REGENERATE PUBLIC LINK
// =========================
const regeneratePublicLink = async (req, res) => {
    try {
        const token = createPublicToken();

        const [result] = await pool.query(`
            UPDATE agents
            SET public_token=?
            WHERE id_agent=? AND deleted_at IS NULL
        `, [token, req.params.id]);

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        const publicLink = buildPublicLink(token);

        await createAuditLog({
            req,
            action: "REGENERATE_PUBLIC_LINK",
            targetEntity: "agents",
            targetId: req.params.id,
            metadata: { public_link: publicLink }
        }).catch(() => {});

        res.json({
            success: true,
            message: "Agent public link regenerated successfully",
            data: { public_token: token, public_link: publicLink }
        });
    } catch (error) {
        console.error("REGENERATE AGENT LINK ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

// =========================
// DELETE AGENT
// =========================
const deleteAgent = async (req, res) => {
    try {
        const [result] = await pool.query(`
            UPDATE agents SET deleted_at=NOW()
            WHERE id_agent=? AND deleted_at IS NULL
        `, [req.params.id]);

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        await createAuditLog({
            req,
            action: "DELETE",
            targetEntity: "agents",
            targetId: req.params.id
        }).catch(() => {});

        res.json({ success: true, message: "Agent deleted successfully" });
    } catch (error) {
        console.error("DELETE /agents/:id ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

module.exports = {
    getAllAgents,
    getAgentById,
    createAgent,
    updateAgent,
    regeneratePublicLink,
    deleteAgent
};
