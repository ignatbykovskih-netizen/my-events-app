const express = require('express');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// ========== ПОДКЛЮЧЕНИЕ К FIREBASE ==========
// Путь к вашему ключу (файл должен лежать в корне папки my-server)
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ========== API ==========

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- МЕРОПРИЯТИЯ ---
app.get('/api/events', async (req, res) => {
    try {
        const snapshot = await db.collection('events').orderBy('createdAt', 'desc').get();
        const events = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            events.push({ id: doc.id, ...data, avg_rating: data.avg_rating || 0 });
        });
        res.json(events);
    } catch (err) {
        console.error('GET /api/events ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/events', async (req, res) => {
    const { name, description, image_url, added_by_email } = req.body;
    try {
        const newEvent = {
            name,
            description,
            image_url: image_url || 'https://picsum.photos/id/100/400/200',
            avg_rating: 0,
            added_by_email,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('events').add(newEvent);
        res.json({ id: docRef.id, ...newEvent });
    } catch (err) {
        console.error('POST /api/events ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    const { id } = req.params;
    const { email, isAdmin } = req.body;
    try {
        const eventDoc = await db.collection('events').doc(id).get();
        if (!eventDoc.exists) return res.status(404).json({ error: 'Мероприятие не найдено' });
        const eventData = eventDoc.data();
        if (!isAdmin && eventData.added_by_email !== email) {
            return res.status(403).json({ error: 'Вы можете удалять только свои мероприятия' });
        }
        await db.collection('events').doc(id).delete();
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/events ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- ПОЛЬЗОВАТЕЛИ ---
app.post('/api/register', async (req, res) => {
    const { name, surname, phone, email, role } = req.body;
    try {
        const existing = await db.collection('users').where('email', '==', email).get();
        if (!existing.empty) return res.status(400).json({ error: 'Email уже существует' });
        
        const newUser = {
            name, surname, phone, email,
            role: role || 'user',
            is_admin: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('users').add(newUser);
        res.json({ id: docRef.id, ...newUser });
    } catch (err) {
        console.error('POST /api/register ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email } = req.body;
    try {
        const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
        if (snapshot.empty) return res.status(404).json({ error: 'Пользователь не найден' });
        let user = null;
        snapshot.forEach(doc => { user = { id: doc.id, ...doc.data() }; });
        res.json(user);
    } catch (err) {
        console.error('POST /api/login ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:email', async (req, res) => {
    const { email } = req.params;
    const { name, surname, phone } = req.body;
    try {
        const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
        if (snapshot.empty) return res.status(404).json({ error: 'Пользователь не найден' });
        snapshot.forEach(async (doc) => {
            await db.collection('users').doc(doc.id).update({ name, surname, phone });
        });
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/users ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- УЧАСТНИКИ ---
app.post('/api/participate', async (req, res) => {
    const { user_email, user_name, event_id, event_name } = req.body;
    try {
        const existing = await db.collection('participants')
            .where('user_email', '==', user_email)
            .where('event_id', '==', event_id)
            .get();
        if (!existing.empty) return res.status(400).json({ error: 'Вы уже записаны' });
        
        await db.collection('participants').add({
            user_email, user_name, event_id, event_name,
            registered_at: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true });
    } catch (err) {
        console.error('POST /api/participate ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/participate/:eventId', async (req, res) => {
    const { eventId } = req.params;
    const { user_email } = req.body;
    try {
        const snapshot = await db.collection('participants')
            .where('user_email', '==', user_email)
            .where('event_id', '==', eventId)
            .get();
        if (snapshot.empty) return res.status(404).json({ error: 'Вы не записаны на это мероприятие' });
        snapshot.forEach(async (doc) => {
            await db.collection('participants').doc(doc.id).delete();
        });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/participate ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/participants/:eventId', async (req, res) => {
    const { eventId } = req.params;
    try {
        const snapshot = await db.collection('participants')
            .where('event_id', '==', eventId)
            .orderBy('registered_at', 'desc')
            .get();
        const participants = [];
        snapshot.forEach(doc => participants.push({ id: doc.id, ...doc.data() }));
        res.json(participants);
    } catch (err) {
        console.error('GET /api/participants/:eventId ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/participants', async (req, res) => {
    const { employeeEmail } = req.query;
    try {
        const user = await db.collection('users').where('email', '==', employeeEmail).get();
        let isAuthorized = false;
        user.forEach(doc => {
            if (doc.data().role === 'employee' || doc.data().is_admin) isAuthorized = true;
        });
        if (!isAuthorized) return res.status(403).json({ error: 'Доступ только для сотрудников' });
        
        const snapshot = await db.collection('participants').orderBy('registered_at', 'desc').get();
        const participants = [];
        snapshot.forEach(doc => participants.push({ id: doc.id, ...doc.data() }));
        res.json(participants);
    } catch (err) {
        console.error('GET /api/participants ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- ОТЗЫВЫ ---
app.post('/api/reviews', async (req, res) => {
    const { event_id, event_name, user_email, user_name, rating, comment } = req.body;
    try {
        const existing = await db.collection('reviews')
            .where('user_email', '==', user_email)
            .where('event_id', '==', event_id)
            .get();
        if (!existing.empty) return res.status(400).json({ error: 'Вы уже оставили отзыв' });
        
        await db.collection('reviews').add({
            event_id, event_name, user_email, user_name, rating, comment: comment || '',
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true });
    } catch (err) {
        console.error('POST /api/reviews ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reviews/:eventId', async (req, res) => {
    const { eventId } = req.params;
    try {
        const snapshot = await db.collection('reviews')
            .where('event_id', '==', eventId)
            .orderBy('created_at', 'desc')
            .get();
        const reviews = [];
        snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
        res.json(reviews);
    } catch (err) {
        console.error('GET /api/reviews/:eventId ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- АДМИНИСТРИРОВАНИЕ ---
app.get('/api/users', async (req, res) => {
    const { adminEmail } = req.query;
    try {
        const adminUser = await db.collection('users').where('email', '==', adminEmail).where('is_admin', '==', true).get();
        if (adminUser.empty) return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const snapshot = await db.collection('users').where('role', '==', 'user').get();
        const users = [];
        snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        res.json(users);
    } catch (err) {
        console.error('GET /api/users ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/create-employee', async (req, res) => {
    const { adminEmail, name, surname, phone, email } = req.body;
    try {
        const adminUser = await db.collection('users').where('email', '==', adminEmail).where('is_admin', '==', true).get();
        if (adminUser.empty) return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const existing = await db.collection('users').where('email', '==', email).get();
        if (!existing.empty) return res.status(400).json({ error: 'Email уже существует' });
        
        await db.collection('users').add({
            name, surname, phone, email, role: 'employee', is_admin: false, created_by: adminEmail,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true });
    } catch (err) {
        console.error('POST /api/create-employee ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/employees', async (req, res) => {
    const { adminEmail } = req.query;
    try {
        const adminUser = await db.collection('users').where('email', '==', adminEmail).where('is_admin', '==', true).get();
        if (adminUser.empty) return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const snapshot = await db.collection('users').where('role', '==', 'employee').get();
        const employees = [];
        snapshot.forEach(doc => employees.push({ id: doc.id, ...doc.data() }));
        res.json(employees);
    } catch (err) {
        console.error('GET /api/employees ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:email', async (req, res) => {
    const { email } = req.params;
    const { adminEmail } = req.body;
    try {
        const adminUser = await db.collection('users').where('email', '==', adminEmail).where('is_admin', '==', true).get();
        if (adminUser.empty) return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const snapshot = await db.collection('users').where('email', '==', email).where('role', '==', 'employee').get();
        snapshot.forEach(async (doc) => {
            await db.collection('users').doc(doc.id).delete();
        });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/employees ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:email', async (req, res) => {
    const { email } = req.params;
    const { adminEmail } = req.body;
    try {
        const adminUser = await db.collection('users').where('email', '==', adminEmail).where('is_admin', '==', true).get();
        if (adminUser.empty) return res.status(403).json({ error: 'Доступ только для администратора' });
        
        const snapshot = await db.collection('users').where('email', '==', email).where('role', '==', 'user').get();
        snapshot.forEach(async (doc) => {
            await db.collection('users').doc(doc.id).delete();
        });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE /api/users ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- ЗАЯВКИ ---
app.post('/api/event-requests', async (req, res) => {
    const { title, description, author_email, author_name } = req.body;
    try {
        const docRef = await db.collection('event_requests').add({
            title, description, author_email, author_name,
            status: 'pending',
            admin_comment: '',
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ id: docRef.id, success: true });
    } catch (err) {
        console.error('POST /api/event-requests ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/event-requests', async (req, res) => {
    const { userEmail } = req.query;
    try {
        const user = await db.collection('users').where('email', '==', userEmail).get();
        let isAuthorized = false;
        user.forEach(doc => {
            if (doc.data().role === 'employee' || doc.data().is_admin) isAuthorized = true;
        });
        if (!isAuthorized) return res.status(403).json({ error: 'Доступ только для сотрудников' });
        
        const snapshot = await db.collection('event_requests').orderBy('created_at', 'desc').get();
        const requests = [];
        snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
        res.json(requests);
    } catch (err) {
        console.error('GET /api/event-requests ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/my-requests', async (req, res) => {
    const { userEmail } = req.query;
    try {
        const snapshot = await db.collection('event_requests').where('author_email', '==', userEmail).orderBy('created_at', 'desc').get();
        const requests = [];
        snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
        res.json(requests);
    } catch (err) {
        console.error('GET /api/my-requests ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/event-requests/:id', async (req, res) => {
    const { id } = req.params;
    const { status, adminEmail, adminComment } = req.body;
    try {
        const adminUser = await db.collection('users').where('email', '==', adminEmail).where('is_admin', '==', true).get();
        if (adminUser.empty) return res.status(403).json({ error: 'Доступ только для администратора' });
        
        await db.collection('event_requests').doc(id).update({
            status: status,
            admin_comment: adminComment || ''
        });
        res.json({ success: true });
    } catch (err) {
        console.error('PUT /api/event-requests ошибка:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log('База данных: Firebase Firestore');
    console.log('Админ: admin@event.com');
});