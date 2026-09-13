const router = require('express').Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');

// POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Fetch user with role info, permissions, and incharge info
        const result = await pool.query(`
            SELECT 
                u.id, u.username, u.password_hash, u.full_name, u.email, u.is_active, u.role_id,
                r.role_name, r.role_level,
                MAX(e.employee_id) as employee_id,
                MAX(
                    (SELECT json_build_object('class_id', tca.class_id, 'section_id', tca.section_id)
                     FROM teacher_class_assignment tca
                     WHERE tca.employee_id = e.employee_id AND tca.is_class_teacher = true
                     LIMIT 1)::text
                ) AS incharge_class,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'module_name', p.module_name,
                            'can_read', p.can_read,
                            'can_write', p.can_write,
                            'can_delete', p.can_delete
                        )
                    ) FILTER (WHERE p.module_name IS NOT NULL),
                    '[]'
                ) AS permissions
            FROM app_users u
            LEFT JOIN app_roles r ON u.role_id = r.id
            LEFT JOIN role_permissions p ON r.id = p.role_id
            LEFT JOIN employees e ON u.id = e.app_user_id
            WHERE u.username = $1
            GROUP BY u.id, u.username, u.password_hash, u.full_name, u.email, u.is_active, u.role_id, r.role_name, r.role_level
        `, [username]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = result.rows[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({ message: 'Your account is disabled. Please contact the administrator.' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash || '');
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // Return user data (no password_hash)
        const { password_hash, ...safeUser } = user;
        if (safeUser.incharge_class && typeof safeUser.incharge_class === 'string') {
            try {
                safeUser.incharge_class = JSON.parse(safeUser.incharge_class);
            } catch(e) {}
        }
        
        if (safeUser.id) {
            try {
                const sCheck = await pool.query('SELECT student_id, family_id FROM students WHERE user_id = $1 LIMIT 1', [safeUser.id]);
                if (sCheck.rows.length > 0) {
                    safeUser.student_id = sCheck.rows[0].student_id;
                    safeUser.family_id = sCheck.rows[0].family_id;
                }
            } catch (e) {}
        }
        res.json(safeUser);

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
