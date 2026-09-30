const pool = require("../db");
const { createAuditLog } = require("../utils/audit");

const selectRegistrationSql = `
    SELECT
        r.id_registration,
        r.id_registration_status,
        rs.status_name AS registration_status,
        r.id_customer,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
        c.passport_number,
        c.passport_photo,
        r.id_sim,
        s.phone_number,
        s.iccid,
        s.imsi,
        s.qr_code,
        s.activation_code,
        st.sim_type,
        r.id_agent,
        a.agent_name,
        r.registered_at,
        r.reviewed_by,
        u.username AS reviewed_by_username,
        r.reviewed_at,
        r.notes,
        r.created_at,
        r.updated_at
    FROM registrations r
    LEFT JOIN registrations_status rs ON r.id_registration_status=rs.id_registration_status
    LEFT JOIN customers c ON r.id_customer=c.id_customer
    LEFT JOIN sim_cards s ON r.id_sim=s.id_sim
    LEFT JOIN sim_types st ON s.id_sim_type=st.id_sim_type
    LEFT JOIN agents a ON r.id_agent=a.id_agent
    LEFT JOIN users u ON r.reviewed_by=u.id_user
`;

const getAllRegistrations = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            ${selectRegistrationSql}
            WHERE r.deleted_at IS NULL
            ORDER BY r.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("GET ALL REGISTRATIONS ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

const getRegistrationById = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            ${selectRegistrationSql}
            WHERE r.id_registration=? AND r.deleted_at IS NULL
        `, [req.params.id]);

        if (!rows.length) return res.status(404).json({ success: false, message: "Registration not found" });
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error("GET REGISTRATION BY ID ERROR:", error);
        res.status(500).json({ success: false, message: "Database error", error: error.message });
    }
};

const createRegistration = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const {
            id_registration_status=1,
            id_customer,
            id_sim,
            id_agent,
            registered_at,
            reviewed_by,
            reviewed_at,
            notes
        } = req.body;

        if (!id_customer || !id_sim || !id_agent) {
            connection.release();
            return res.status(400).json({ success:false, message:"id_customer, id_sim and id_agent are required" });
        }

        await connection.beginTransaction();

        const [simRows] = await connection.query(`
            SELECT s.id_sim, ss.sim_status
            FROM sim_cards s
            JOIN sim_status ss ON s.id_sim_status=ss.id_sim_status
            WHERE s.id_sim=? AND s.deleted_at IS NULL
            FOR UPDATE
        `, [id_sim]);

        if (!simRows.length) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success:false, message:"SIM card not found" });
        }

        if (!["available", "reserved"].includes(String(simRows[0].sim_status).toLowerCase())) {
            await connection.rollback(); connection.release();
            return res.status(409).json({ success:false, message:`SIM is not available. Current status: ${simRows[0].sim_status}` });
        }

        const [result] = await connection.query(`
            INSERT INTO registrations (
                id_registration_status,id_customer,id_sim,id_agent,registered_at,reviewed_by,reviewed_at,notes
            )
            VALUES (?,?,?,?,?,?,?,?)
        `, [
            id_registration_status,
            id_customer,
            id_sim,
            id_agent,
            registered_at || new Date(),
            reviewed_by || null,
            reviewed_at || null,
            notes || null
        ]);

        await setSimStatus(connection, id_sim, Number(id_registration_status) === 2 ? "Registered" : "Reserved");

        await connection.commit();
        connection.release();

        await createAuditLog({
            req, action:"CREATE", targetEntity:"registrations", targetId:result.insertId,
            metadata:{ id_customer, id_sim, id_agent, id_registration_status }
        }).catch(() => {});

        const [rows] = await pool.query(`${selectRegistrationSql} WHERE r.id_registration=?`, [result.insertId]);
        res.status(201).json({ success:true, message:"Registration created successfully", data:rows[0] });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        connection.release();
        console.error("CREATE REGISTRATION ERROR:", error);
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const updateRegistration = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { id_registration_status, id_customer, id_sim, id_agent, reviewed_by, notes } = req.body;

        if (!id_registration_status || !id_customer || !id_sim || !id_agent) {
            connection.release();
            return res.status(400).json({ success:false, message:"id_registration_status, id_customer, id_sim and id_agent are required" });
        }

        const statusId = Number(id_registration_status);
        if (![1,2,3].includes(statusId)) {
            connection.release();
            return res.status(400).json({ success:false, message:"Invalid registration status" });
        }

        if ([2,3].includes(statusId) && ![1,2].includes(Number(req.user?.id_role))) {
            connection.release();
            return res.status(403).json({ success:false, message:"Only Admin or Staff can approve or reject registrations" });
        }

        await connection.beginTransaction();

        const [existing] = await connection.query(`
            SELECT id_registration,id_sim
            FROM registrations
            WHERE id_registration=? AND deleted_at IS NULL
            FOR UPDATE
        `, [id]);

        if (!existing.length) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success:false, message:"Registration not found" });
        }

        await connection.query(`
            UPDATE registrations
            SET id_registration_status=?,
                id_customer=?,
                id_sim=?,
                id_agent=?,
                reviewed_by=?,
                reviewed_at=CASE WHEN ? IN (2,3) THEN NOW() ELSE reviewed_at END,
                notes=?
            WHERE id_registration=?
        `, [
            statusId, id_customer, id_sim, id_agent,
            reviewed_by || req.user?.id_user || null,
            statusId, notes || null, id
        ]);

        if (statusId === 2) await setSimStatus(connection, id_sim, "Registered");
        else if (statusId === 3) await setSimStatus(connection, id_sim, "Available");
        else await setSimStatus(connection, id_sim, "Reserved");

        await connection.commit();
        connection.release();

        await createAuditLog({
            req,
            action: statusId===2 ? "APPROVE" : statusId===3 ? "REJECT" : "UPDATE",
            targetEntity:"registrations",
            targetId:id,
            metadata:{ id_customer,id_sim,id_agent,id_registration_status:statusId }
        }).catch(() => {});

        const [rows] = await pool.query(`${selectRegistrationSql} WHERE r.id_registration=?`, [id]);
        res.json({ success:true, message:"Registration updated successfully", data:rows[0] });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        connection.release();
        console.error("UPDATE REGISTRATION ERROR:", error);
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const deleteRegistration = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(`
            SELECT id_sim,id_registration_status
            FROM registrations
            WHERE id_registration=? AND deleted_at IS NULL
            FOR UPDATE
        `, [req.params.id]);

        if (!rows.length) {
            await connection.rollback(); connection.release();
            return res.status(404).json({ success:false, message:"Registration not found" });
        }

        await connection.query(`UPDATE registrations SET deleted_at=NOW() WHERE id_registration=?`, [req.params.id]);

        if (Number(rows[0].id_registration_status) !== 2) {
            await setSimStatus(connection, rows[0].id_sim, "Available");
        }

        await connection.commit();
        connection.release();

        await createAuditLog({
            req, action:"DELETE", targetEntity:"registrations", targetId:req.params.id
        }).catch(() => {});

        res.json({ success:true, message:"Registration deleted successfully" });
    } catch (error) {
        try { await connection.rollback(); } catch {}
        connection.release();
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

async function setSimStatus(connection, idSim, statusName) {
    const [rows] = await connection.query(`
        SELECT id_sim_status
        FROM sim_status
        WHERE LOWER(sim_status)=LOWER(?)
        LIMIT 1
    `, [statusName]);

    if (rows.length) {
        await connection.query(`UPDATE sim_cards SET id_sim_status=?, updated_at=NOW() WHERE id_sim=?`, [rows[0].id_sim_status, idSim]);
    }
}

module.exports = {
    getAllRegistrations,
    getRegistrationById,
    createRegistration,
    updateRegistration,
    deleteRegistration
};
