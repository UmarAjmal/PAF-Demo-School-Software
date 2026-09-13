const router = require('express').Router();
const pool = require('../db');

// ==========================================
// SUBJECTS API
// ==========================================

// Get Active Terms for Subjects Dropdown
router.get('/terms', async (req, res) => {
    try {
        const query = `
            SELECT t.id, t.term_name, t.academic_year_id, y.year_name, y.is_active
            FROM academic_terms t
            JOIN academic_years y ON t.academic_year_id = y.id
            WHERE y.is_active = true OR y.status = 'active'
            ORDER BY t.id ASC
        `;
        let result = await pool.query(query);
        if (result.rows.length === 0) {
            result = await pool.query(`
                SELECT t.id, t.term_name, t.academic_year_id, y.year_name, y.is_active
                FROM academic_terms t
                LEFT JOIN academic_years y ON t.academic_year_id = y.id
                ORDER BY t.id ASC
            `);
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
