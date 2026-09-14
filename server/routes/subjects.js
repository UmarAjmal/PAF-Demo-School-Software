const router = require('express').Router();
const pool = require('../db');

// ==========================================
// SUBJECTS API
// ==========================================

// Get Active Terms for Subjects Dropdown
router.get('/terms', async (req, res) => {
    try {
        let activeYearRes = await pool.query(
            "SELECT id, year_name FROM academic_years WHERE is_active = true OR status = 'active' ORDER BY id DESC LIMIT 1"
        );
        if (activeYearRes.rows.length === 0) {
            activeYearRes = await pool.query(
                "SELECT id, year_name FROM academic_years ORDER BY id DESC LIMIT 1"
            );
        }
        if (activeYearRes.rows.length === 0) {
            return res.json([]);
        }

        const activeYearId = activeYearRes.rows[0].id;
        let result = await pool.query(`
            SELECT t.id, t.term_name, t.academic_year_id, y.year_name, y.is_active
            FROM academic_terms t
            JOIN academic_years y ON t.academic_year_id = y.id
            WHERE y.id = $1
            ORDER BY t.id ASC
        `, [activeYearId]);

        if (result.rows.length === 0) {
            for (const tName of ['First Term', 'Mid Term', 'Final Term']) {
                await pool.query(
                    `INSERT INTO academic_terms (academic_year_id, term_name) VALUES ($1, $2)`,
                    [activeYearId, tName]
                );
            }
            result = await pool.query(`
                SELECT t.id, t.term_name, t.academic_year_id, y.year_name, y.is_active
                FROM academic_terms t
                JOIN academic_years y ON t.academic_year_id = y.id
                WHERE y.id = $1
                ORDER BY t.id ASC
            `, [activeYearId]);
        }
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error" });
    }
});

// List All Subjects
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                sub.subject_id, sub.subject_name, sub.subject_code, sub.section_id, sub.term_id,
                s.section_name, 
                s.class_id,
                c.class_name,
                COALESCE(t.term_name, 'General / All Terms') AS term_name
            FROM subjects sub
            JOIN sections s ON sub.section_id = s.section_id
            JOIN classes c ON s.class_id = c.class_id
            LEFT JOIN academic_terms t ON sub.term_id = t.id
            ORDER BY COALESCE(t.id, 0) ASC, c.class_name, s.section_name, sub.subject_name
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// Create Subject (Supports Multiple Sections & Term Selection)
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const { subject_name, subject_code, section_ids, term_id } = req.body; 
        
        if (!section_ids || !Array.isArray(section_ids) || section_ids.length === 0) {
            return res.status(400).json({ error: "Please select at least one section" });
        }

        await client.query('BEGIN');

        const insertedSubjects = [];

        for (const section_id of section_ids) {
            const text = `
                INSERT INTO subjects (subject_name, subject_code, section_id, term_id) 
                VALUES ($1, $2, $3, $4) 
                ON CONFLICT (section_id, subject_name, term_id) DO NOTHING
                RETURNING *
            `;
            const dbRes = await client.query(text, [subject_name, subject_code, section_id, term_id ? parseInt(term_id) : null]);
            if (dbRes.rows[0]) insertedSubjects.push(dbRes.rows[0]);
        }

        await client.query('COMMIT');
        
        res.json({ message: "Subjects processed", count: insertedSubjects.length, data: insertedSubjects });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    } finally {
        client.release();
    }
});

// Update Subject
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { subject_name, subject_code, section_id, term_id } = req.body;
        
        await pool.query(
            `UPDATE subjects 
             SET subject_name = $1, subject_code = $2, section_id = $3, term_id = $4
             WHERE subject_id = $5`,
            [subject_name, subject_code, section_id, term_id ? parseInt(term_id) : null, id]
        );
        
        res.json("Subject updated");
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: "Subject Name already exists in this section for this term" });
        }
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

// Delete Subject
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM subjects WHERE subject_id = $1", [id]);
        res.json("Subject deleted");
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error: " + err.message });
    }
});

module.exports = router;
