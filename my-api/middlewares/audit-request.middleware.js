const { createAuditLog } = require("../utils/audit");

const auditRequest = (req, res, next) => {
    res.on("finish", () => {
        if (!req.user) return;
        if (req.path.startsWith("/audit-logs")) return;
        if (req.method === "OPTIONS") return;

        createAuditLog({
            req,
            action: `${req.method} ${req.path}`,
            targetEntity: req.path.split("/")[1] || null,
            targetId: req.params?.id || null,
            metadata: {
                status_code: res.statusCode,
                query: req.query || {}
            }
        }).catch((error) => {
            console.error("AUDIT REQUEST ERROR:", error.message);
        });
    });

    next();
};

module.exports = auditRequest;
