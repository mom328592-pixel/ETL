const pool = require("../db");
const path = require("path");

// =========================
// GET REGISTRATION OPTIONS BY AGENT TOKEN
// =========================
const getRegistrationOptions = async (req, res) => {
    try {
        const { agentToken } = req.params;

        const [agents] = await pool.query(`
            SELECT id_agent, agent_name
            FROM agents
            WHERE public_token = ? AND deleted_at IS NULL
            LIMIT 1
        `, [agentToken]);

        if (!agents.length) {
            return res.status(404).json({
                success: false,
                message: "Invalid or inactive agent link"
            });
        }

        const [simTypes] = await pool.query(`
            SELECT id_sim_type, sim_type, description
            FROM sim_types
            ORDER BY id_sim_type ASC
        `);

        const [[stats]] = await pool.query(`
            SELECT COUNT(*) AS registrations
            FROM registrations
            WHERE id_agent=? AND deleted_at IS NULL
        `, [agents[0].id_agent]);

        res.json({
            success: true,
            message: "Registration options retrieved successfully",
            data: {
                agent: agents[0],
                tracking: {
                    registrations: Number(stats.registrations || 0)
                },
                sim_types: simTypes
            }
        });
    } catch (error) {
        console.error("GET /public/registration-options/:agentToken ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};

// =========================
// CREATE CUSTOMER REGISTRATION
// Backend chooses and locks the first available SIM of the requested type.
// The customer never selects an agent or SIM number.
// =========================
const createPublicRegistration = async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const {
            agent_token,
            id_sim_type,
            first_name,
            last_name,
            passport_number,
            nationality,
            date_of_birth,
            passport_expiry_date,
            passport_photo
        } = req.body;

        if (!agent_token) {
            return res.status(400).json({ success: false, message: "Agent link is required" });
        }
        if (!id_sim_type) {
            return res.status(400).json({ success: false, message: "SIM type is required" });
        }
        if (!first_name?.trim()) {
            return res.status(400).json({ success: false, message: "First name is required" });
        }
        if (!last_name?.trim()) {
            return res.status(400).json({ success: false, message: "Last name is required" });
        }
        if (!passport_number?.trim()) {
            return res.status(400).json({ success: false, message: "Passport number is required" });
        }

        await connection.beginTransaction();

        const [agentRows] = await connection.query(`
            SELECT id_agent, agent_name
            FROM agents
            WHERE public_token = ? AND deleted_at IS NULL
            LIMIT 1
        `, [agent_token]);

        if (!agentRows.length) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: "Invalid or inactive agent link" });
        }

        const idAgent = agentRows[0].id_agent;

        // Atomically choose an available SIM and lock it inside this transaction.
        const [simRows] = await connection.query(`
            SELECT
                s.id_sim,
                s.phone_number,
                s.iccid,
                s.imsi,
                s.id_sim_type,
                s.qr_code,
                s.activation_code,
                st.sim_type,
                ss.sim_status
            FROM sim_cards s
            INNER JOIN sim_types st ON s.id_sim_type = st.id_sim_type
            INNER JOIN sim_status ss ON s.id_sim_status = ss.id_sim_status
            WHERE s.id_sim_type = ?
              AND LOWER(ss.sim_status) = 'available'
              AND s.deleted_at IS NULL
            ORDER BY s.id_sim ASC
            LIMIT 1
            FOR UPDATE
        `, [id_sim_type]);

        if (!simRows.length) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({
                success: false,
                message: "No available SIM is currently available for this SIM type"
            });
        }

        const sim = simRows[0];

        // Prevent duplicate pending registrations for the locked SIM.
        const [pendingRows] = await connection.query(`
            SELECT r.id_registration
            FROM registrations r
            INNER JOIN registrations_status rs
                ON r.id_registration_status = rs.id_registration_status
            WHERE r.id_sim = ?
              AND rs.status_name = 'Pending'
              AND r.deleted_at IS NULL
            LIMIT 1
        `, [sim.id_sim]);

        if (pendingRows.length) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({
                success: false,
                message: "This SIM already has a pending registration"
            });
        }

        let customerId;

        const [customerRows] = await connection.query(`
            SELECT id_customer
            FROM customers
            WHERE passport_number = ?
            LIMIT 1
        `, [passport_number.trim()]);

        if (customerRows.length) {
            customerId = customerRows[0].id_customer;

            await connection.query(`
                UPDATE customers
                SET
                    first_name=?,
                    last_name=?,
                    nationality=?,
                    date_of_birth=?,
                    passport_expiry_date=?,
                    passport_photo=COALESCE(?, passport_photo)
                WHERE id_customer=?
            `, [
                first_name.trim(),
                last_name.trim(),
                nationality?.trim() || null,
                date_of_birth || null,
                passport_expiry_date || null,
                passport_photo || null,
                customerId
            ]);
        } else {
            const [customerResult] = await connection.query(`
                INSERT INTO customers (
                    first_name,
                    last_name,
                    passport_number,
                    nationality,
                    date_of_birth,
                    passport_expiry_date,
                    passport_photo
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                first_name.trim(),
                last_name.trim(),
                passport_number.trim(),
                nationality?.trim() || null,
                date_of_birth || null,
                passport_expiry_date || null,
                passport_photo || null
            ]);

            customerId = customerResult.insertId;
        }

        const [statusRows] = await connection.query(`
            SELECT id_registration_status
            FROM registrations_status
            WHERE status_name = 'Pending'
            LIMIT 1
        `);

        if (!statusRows.length) {
            await connection.rollback();
            connection.release();
            return res.status(500).json({
                success: false,
                message: "Pending registration status is not configured"
            });
        }

        const pendingStatusId = statusRows[0].id_registration_status;

        const [registrationResult] = await connection.query(`
            INSERT INTO registrations (
                id_registration_status,
                id_customer,
                id_sim,
                id_agent,
                notes
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            pendingStatusId,
            customerId,
            sim.id_sim,
            idAgent,
            "Customer self registration"
        ]);

        const [reservedStatus] = await connection.query(`
            SELECT id_sim_status
            FROM sim_status
            WHERE LOWER(sim_status) = 'reserved'
            LIMIT 1
        `);

        if (reservedStatus.length) {
            await connection.query(`
                UPDATE sim_cards
                SET id_sim_status=?
                WHERE id_sim=?
            `, [reservedStatus[0].id_sim_status, sim.id_sim]);
        }

        await connection.commit();
        connection.release();

        res.status(201).json({
            success: true,
            message: "Customer registration submitted successfully",
            data: {
                id_registration: registrationResult.insertId,
                id_customer: customerId,
                id_agent: idAgent,
                agent_name: agentRows[0].agent_name,
                sim: {
                    id_sim: sim.id_sim,
                    phone_number: sim.phone_number,
                    iccid: sim.iccid,
                    imsi: sim.imsi,
                    sim_type: sim.sim_type,
                    qr_code: sim.qr_code || null,
                    activation_code: sim.activation_code || null,
                },
                status: "Pending"
            }
        });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        connection.release();

        console.error("POST /public/registrations ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to submit registration"
        });
    }
};

module.exports = {
    getRegistrationOptions,
    createPublicRegistration
};