const pool = require("../db");

const selectSimSql = `
    SELECT
        s.id_sim,
        s.iccid,
        s.imsi,
        s.qr_code,
        s.activation_code,
        s.phone_number,
        s.id_sim_type,
        st.sim_type,
        s.id_sim_status,
        ss.sim_status,
        s.imported_by,
        u.username AS imported_by_username,
        s.id_file,
        f.file_name,
        f.id_agent,
        a.agent_name,
        s.imported_at,
        s.created_at,
        s.updated_at
    FROM sim_cards s
    LEFT JOIN sim_types st ON s.id_sim_type=st.id_sim_type
    LEFT JOIN sim_status ss ON s.id_sim_status=ss.id_sim_status
    LEFT JOIN users u ON s.imported_by=u.id_user
    LEFT JOIN history_sim_card_file f ON s.id_file=f.id_file
    LEFT JOIN agents a ON f.id_agent=a.id_agent
`;

const getAllSims = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            ${selectSimSql}
            WHERE s.deleted_at IS NULL
            ORDER BY s.id_sim ASC
        `);
        res.json({ success:true, message:"SIM cards retrieved successfully", data:rows });
    } catch (error) {
        console.error("GET /sims ERROR:", error);
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const getSimById = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            ${selectSimSql}
            WHERE s.id_sim=? AND s.deleted_at IS NULL
        `, [req.params.id]);

        if (!rows.length) return res.status(404).json({ success:false, message:"SIM card not found" });
        res.json({ success:true, data:rows[0] });
    } catch (error) {
        console.error("GET /sims/:id ERROR:", error);
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const createSim = async (req, res) => {
    try {
        const {
            iccid, imsi, qr_code, activation_code, phone_number,
            id_sim_type, id_sim_status, imported_by, id_file, imported_at
        } = req.body;

        if (!iccid || !imsi) {
            return res.status(400).json({ success:false, message:"iccid and imsi are required" });
        }

        if (id_file) {
            const [fileRows] = await pool.query(
                `SELECT id_file FROM history_sim_card_file WHERE id_file=?`, [id_file]
            );
            if (!fileRows.length) return res.status(404).json({ success:false, message:"File history not found" });
        }

        const [result] = await pool.query(`
            INSERT INTO sim_cards (
                iccid, imsi, qr_code, activation_code, phone_number,
                id_sim_type, id_sim_status, imported_by, id_file, imported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            iccid, imsi, qr_code || null, activation_code || null, phone_number || null,
            id_sim_type || null, id_sim_status || 1, imported_by || req.user?.id_user || null,
            id_file || null, imported_at || null
        ]);

        const [rows] = await pool.query(`${selectSimSql} WHERE s.id_sim=?`, [result.insertId]);
        res.status(201).json({ success:true, message:"SIM card created successfully", data:rows[0] });
    } catch (error) {
        console.error("POST /sims ERROR:", error);
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success:false, message:"ICCID or IMSI already exists" });
        }
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const updateSim = async (req, res) => {
    try {
        const {
            iccid, imsi, qr_code, activation_code, phone_number,
            id_sim_type, id_sim_status, imported_by, id_file, imported_at
        } = req.body;

        if (!iccid || !imsi) {
            return res.status(400).json({ success:false, message:"iccid and imsi are required" });
        }

        const [result] = await pool.query(`
            UPDATE sim_cards
            SET iccid=?, imsi=?, qr_code=?, activation_code=?, phone_number=?,
                id_sim_type=?, id_sim_status=?, imported_by=?, id_file=?, imported_at=?
            WHERE id_sim=? AND deleted_at IS NULL
        `, [
            iccid, imsi, qr_code || null, activation_code || null, phone_number || null,
            id_sim_type || null, id_sim_status || 1, imported_by || req.user?.id_user || null,
            id_file || null, imported_at || null, req.params.id
        ]);

        if (!result.affectedRows) return res.status(404).json({ success:false, message:"SIM card not found" });

        const [rows] = await pool.query(`${selectSimSql} WHERE s.id_sim=?`, [req.params.id]);
        res.json({ success:true, message:"SIM card updated successfully", data:rows[0] });
    } catch (error) {
        console.error("PUT /sims/:id ERROR:", error);
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ success:false, message:"ICCID or IMSI already exists" });
        }
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const deleteSim = async (req, res) => {
    try {
        const [result] = await pool.query(`
            UPDATE sim_cards SET deleted_at=NOW()
            WHERE id_sim=? AND deleted_at IS NULL
        `, [req.params.id]);

        if (!result.affectedRows) return res.status(404).json({ success:false, message:"SIM card not found" });
        res.json({ success:true, message:"SIM card deleted successfully" });
    } catch (error) {
        console.error("DELETE /sims/:id ERROR:", error);
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

const getAvailableSims = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            ${selectSimSql}
            WHERE s.deleted_at IS NULL
              AND LOWER(ss.sim_status)='available'
            ORDER BY s.id_sim ASC
        `);
        res.json({ success:true, data:rows });
    } catch (error) {
        console.error("GET AVAILABLE SIMS ERROR:", error);
        res.status(500).json({ success:false, message:"Database error", error:error.message });
    }
};

module.exports = {
    getAvailableSims,
    getAllSims,
    getSimById,
    createSim,
    updateSim,
    deleteSim
};
