const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ========== ПОДКЛЮЧЕНИЕ К SUPABASE ==========
// ЗАМЕНИТЕ НА ВАШУ СТРОКУ ПОДКЛЮЧЕНИЯ
const SUPABASE_CONNECTION_STRING = 'postgresql://postgres:NqFNd6E3m3vWMM52@db.rvzyrhzacvbyitkckwhn.supabase.co:5432/postgres';

const pool = new Pool({
    connectionString: SUPABASE_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
});

// ========== API ==========

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/events', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM events ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/events:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/events', async (req, res) => {
    const { name, description, image_url, added_by_email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO events (name, description, image_url, added_by_email) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, description, image_url || 'https://picsum.photos/id/100/400/200', added_by_email]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка POST /api/events:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    const { id } = req.params;
    const { email, isAdmin } = req.body;
    try {
        if (isAdmin) {
            await pool.query('DELETE FROM events WHERE id = $1', [id]);
        } else {
            const event = await pool.query('SELECT added_by_email FROM events WHERE id = $1', [id]);
            if (event.rows[0]?.added_by_email !== email) {
                return res.status(403).json({ error: 'Вы можете удалять только свои мероприятия' });
            }
            await pool.query('DELETE FROM events WHERE id = $1', [id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка DELETE /api/events:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { name, surname, phone, email, role } = req.body;
    try {
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email уже существует' });
        }
        const result = await pool.query(
            'INSERT INTO users (name, surname, phone, email, role, is_admin) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, surname, phone, email, role || 'user', false]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка POST /api/register:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка POST /api/login:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:email', async (req, res) => {
    const { email } = req.params;
    const { name, surname, phone } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET name = $1, surname = $2, phone = $3 WHERE email = $4 RETURNING *',
            [name, surname, phone, email]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка PUT /api/users:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/participate', async (req, res) => {
    const { user_email, user_name, event_id, event_name } = req.body;
    try {
        const existing = await pool.query(
            'SELECT * FROM participants WHERE user_email = $1 AND event_id = $2',
            [user_email, event_id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Вы уже записаны' });
        }
        await pool.query(
            'INSERT INTO participants (user_email, user_name, event_id, event_name) VALUES ($1, $2, $3, $4)',
            [user_email, user_name, event_id, event_name]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка POST /api/participate:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/participate/:eventId', async (req, res) => {
    const { eventId } = req.params;
    const { user_email } = req.body;
    try {
        await pool.query('DELETE FROM participants WHERE user_email = $1 AND event_id = $2', [user_email, eventId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка DELETE /api/participate:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/participants', async (req, res) => {
    const { employeeEmail } = req.query;
    try {
        const user = await pool.query('SELECT role, is_admin FROM users WHERE email = $1', [employeeEmail]);
        if (user.rows.length === 0 || (user.rows[0].role !== 'employee' && !user.rows[0].is_admin)) {
            return res.status(403).json({ error: 'Доступ только для сотрудников' });
        }
        const result = await pool.query('SELECT * FROM participants ORDER BY registered_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/participants:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/participants/:eventId', async (req, res) => {
    const { eventId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM participants WHERE event_id = $1 ORDER BY registered_at DESC', [eventId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/participants/:eventId:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reviews', async (req, res) => {
    const { event_id, event_name, user_email, user_name, rating, comment } = req.body;
    try {
        const existing = await pool.query(
            'SELECT * FROM reviews WHERE user_email = $1 AND event_id = $2',
            [user_email, event_id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Вы уже оставили отзыв' });
        }
        await pool.query(
            'INSERT INTO reviews (event_id, event_name, user_email, user_name, rating, comment) VALUES ($1, $2, $3, $4, $5, $6)',
            [event_id, event_name, user_email, user_name, rating, comment || '']
        );
        const avgResult = await pool.query('SELECT AVG(rating) as avg FROM reviews WHERE event_id = $1', [event_id]);
        const avgRating = avgResult.rows[0].avg || 0;
        await pool.query('UPDATE events SET avg_rating = $1 WHERE id = $2', [avgRating, event_id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка POST /api/reviews:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reviews/:eventId', async (req, res) => {
    const { eventId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM reviews WHERE event_id = $1 ORDER BY created_at DESC', [eventId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/reviews/:eventId:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/event-requests', async (req, res) => {
    const { title, description, author_email, author_name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO event_requests (title, description, author_email, author_name) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, description, author_email, author_name]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка POST /api/event-requests:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/event-requests', async (req, res) => {
    const { userEmail } = req.query;
    try {
        const user = await pool.query('SELECT role, is_admin FROM users WHERE email = $1', [userEmail]);
        if (user.rows.length === 0 || (user.rows[0].role !== 'employee' && !user.rows[0].is_admin)) {
            return res.status(403).json({ error: 'Доступ только для сотрудников' });
        }
        const result = await pool.query('SELECT * FROM event_requests ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/event-requests:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/my-requests', async (req, res) => {
    const { userEmail } = req.query;
    try {
        const result = await pool.query('SELECT * FROM event_requests WHERE author_email = $1 ORDER BY created_at DESC', [userEmail]);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/my-requests:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/event-requests/:id', async (req, res) => {
    const { id } = req.params;
    const { status, adminEmail, adminComment } = req.body;
    try {
        const admin = await pool.query('SELECT is_admin FROM users WHERE email = $1', [adminEmail]);
        if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        await pool.query(
            'UPDATE event_requests SET status = $1, admin_comment = $2 WHERE id = $3',
            [status, adminComment || '', id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка PUT /api/event-requests:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/employees', async (req, res) => {
    const { adminEmail } = req.query;
    try {
        const admin = await pool.query('SELECT is_admin FROM users WHERE email = $1', [adminEmail]);
        if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        const result = await pool.query("SELECT * FROM users WHERE role = 'employee' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/employees:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/create-employee', async (req, res) => {
    const { adminEmail, name, surname, phone, email } = req.body;
    try {
        const admin = await pool.query('SELECT is_admin FROM users WHERE email = $1', [adminEmail]);
        if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email уже существует' });
        }
        const result = await pool.query(
            'INSERT INTO users (name, surname, phone, email, role, is_admin, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, surname, phone, email, 'employee', false, adminEmail]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка POST /api/create-employee:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:email', async (req, res) => {
    const { email } = req.params;
    const { adminEmail } = req.body;
    try {
        const admin = await pool.query('SELECT is_admin FROM users WHERE email = $1', [adminEmail]);
        if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        await pool.query("DELETE FROM users WHERE email = $1 AND role = 'employee'", [email]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка DELETE /api/employees:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    const { adminEmail } = req.query;
    try {
        const admin = await pool.query('SELECT is_admin FROM users WHERE email = $1', [adminEmail]);
        if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        const result = await pool.query("SELECT * FROM users WHERE role = 'user' ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка GET /api/users:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:email', async (req, res) => {
    const { email } = req.params;
    const { adminEmail } = req.body;
    try {
        const admin = await pool.query('SELECT is_admin FROM users WHERE email = $1', [adminEmail]);
        if (admin.rows.length === 0 || !admin.rows[0].is_admin) {
            return res.status(403).json({ error: 'Доступ только для администратора' });
        }
        await pool.query('DELETE FROM users WHERE email = $1', [email]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка DELETE /api/users:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`База данных: Supabase`);
    console.log(`Админ: admin@event.com`);
});