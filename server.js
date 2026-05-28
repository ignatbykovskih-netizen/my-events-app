const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = 'data.json';

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        console.log('Ошибка загрузки:', err.message);
    }
    return {
        users: [],
        events: [],
        eventRequests: [],
        participants: [],
        reviews: [],
        nextUserId: 2,
        nextEventId: 1,
        nextRequestId: 1,
        nextReviewId: 1
    };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.log('Ошибка сохранения:', err.message);
    }
}

let data = loadData();
let users = data.users;
let events = data.events;
let eventRequests = data.eventRequests || [];
let participants = data.participants;
let reviews = data.reviews;
let nextUserId = data.nextUserId;
let nextEventId = data.nextEventId;
let nextRequestId = data.nextRequestId || 1;
let nextReviewId = data.nextReviewId;

if (!users.find(u => u.email === 'admin@event.com')) {
    users.push({ id: nextUserId++, name: 'Админ', surname: 'Системы', phone: '0000000000', email: 'admin@event.com', role: 'admin', is_admin: true });
    saveData({ users, events, eventRequests, participants, reviews, nextUserId, nextEventId, nextRequestId, nextReviewId });
}

function persist() {
    saveData({ users, events, eventRequests, participants, reviews, nextUserId, nextEventId, nextRequestId, nextReviewId });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/events', (req, res) => {
    res.json(events);
});

app.post('/api/events', (req, res) => {
    const { name, description, image_url, added_by_email } = req.body;
    const newEvent = {
        id: nextEventId++,
        name,
        description,
        image_url: image_url || 'https://picsum.photos/id/100/400/200',
        avg_rating: 0,
        added_by_email
    };
    events.push(newEvent);
    persist();
    res.json(newEvent);
});

app.delete('/api/events/:id', (req, res) => {
    const { id } = req.params;
    const { email, isAdmin } = req.body;
    const eventIndex = events.findIndex(e => e.id == id);
    if (eventIndex === -1) return res.status(404).json({ error: 'Мероприятие не найдено' });
    const event = events[eventIndex];
    if (!isAdmin && event.added_by_email !== email) {
        return res.status(403).json({ error: 'Вы можете удалять только свои мероприятия' });
    }
    events.splice(eventIndex, 1);
    participants = participants.filter(p => p.event_id != id);
    reviews = reviews.filter(r => r.event_id != id);
    persist();
    res.json({ success: true });
});

app.post('/api/register', (req, res) => {
    const { name, surname, phone, email, role } = req.body;
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email уже существует' });
    }
    const newUser = {
        id: nextUserId++,
        name, surname, phone, email,
        role: role || 'user',
        is_admin: false
    };
    users.push(newUser);
    persist();
    res.json(newUser);
});

app.post('/api/login', (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
});

app.put('/api/users/:email', (req, res) => {
    const { email } = req.params;
    const { name, surname, phone } = req.body;
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    
    if (name) users[userIndex].name = name;
    if (surname) users[userIndex].surname = surname;
    if (phone) users[userIndex].phone = phone;
    
    persist();
    res.json(users[userIndex]);
});

app.post('/api/participate', (req, res) => {
    const { user_email, user_name, event_id, event_name } = req.body;
    if (participants.find(p => p.user_email === user_email && p.event_id === event_id)) {
        return res.status(400).json({ error: 'Вы уже записаны' });
    }
    participants.push({
        id: participants.length + 1,
        user_email, user_name, event_id, event_name,
        registered_at: new Date()
    });
    persist();
    res.json({ success: true });
});

app.delete('/api/participate/:eventId', (req, res) => {
    const { eventId } = req.params;
    const { user_email } = req.body;
    const index = participants.findIndex(p => p.user_email === user_email && p.event_id == eventId);
    if (index === -1) return res.status(404).json({ error: 'Вы не записаны на это мероприятие' });
    participants.splice(index, 1);
    persist();
    res.json({ success: true });
});

app.get('/api/participants', (req, res) => {
    const { employeeEmail } = req.query;
    const user = users.find(u => u.email === employeeEmail);
    if (!user || (user.role !== 'employee' && !user.is_admin)) {
        return res.status(403).json({ error: 'Доступ только для сотрудников' });
    }
    res.json(participants);
});

app.get('/api/participants/:eventId', (req, res) => {
    res.json(participants.filter(p => p.event_id == req.params.eventId));
});

app.get('/api/my-participations', (req, res) => {
    const { userEmail } = req.query;
    res.json(participants.filter(p => p.user_email === userEmail));
});

app.get('/api/reviews', (req, res) => {
    const { userEmail } = req.query;
    const user = users.find(u => u.email === userEmail);
    if (!user || (user.role !== 'employee' && !user.is_admin)) {
        return res.status(403).json({ error: 'Доступ только для сотрудников' });
    }
    res.json(reviews);
});

app.get('/api/reviews/:eventId', (req, res) => {
    res.json(reviews.filter(r => r.event_id == req.params.eventId));
});

app.post('/api/reviews', (req, res) => {
    const { event_id, event_name, user_email, user_name, rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Оценка от 1 до 5' });
    }
    if (!participants.find(p => p.user_email === user_email && p.event_id === event_id)) {
        return res.status(403).json({ error: 'Отзыв только для участников' });
    }
    if (reviews.find(r => r.user_email === user_email && r.event_id === event_id)) {
        return res.status(400).json({ error: 'Вы уже оставили отзыв' });
    }
    const newReview = {
        id: nextReviewId++,
        event_id, event_name, user_email, user_name,
        rating, comment: comment || '',
        created_at: new Date()
    };
    reviews.push(newReview);
    const eventReviews = reviews.filter(r => r.event_id === event_id);
    const avgRating = eventReviews.length ? eventReviews.reduce((s, r) => s + r.rating, 0) / eventReviews.length : 0;
    const event = events.find(e => e.id === event_id);
    if (event) event.avg_rating = avgRating;
    persist();
    res.json(newReview);
});

app.delete('/api/reviews/:id', (req, res) => {
    const { id } = req.params;
    const { userEmail } = req.body;
    const user = users.find(u => u.email === userEmail);
    if (!user || (user.role !== 'employee' && !user.is_admin)) {
        return res.status(403).json({ error: 'Доступ только для сотрудников' });
    }
    const index = reviews.findIndex(r => r.id == id);
    if (index === -1) return res.status(404).json({ error: 'Отзыв не найден' });
    const review = reviews[index];
    reviews.splice(index, 1);
    const eventReviews = reviews.filter(r => r.event_id === review.event_id);
    const avgRating = eventReviews.length ? eventReviews.reduce((s, r) => s + r.rating, 0) / eventReviews.length : 0;
    const event = events.find(e => e.id === review.event_id);
    if (event) event.avg_rating = avgRating;
    persist();
    res.json({ success: true });
});

app.get('/api/event-requests', (req, res) => {
    const { userEmail } = req.query;
    const user = users.find(u => u.email === userEmail);
    if (!user || (user.role !== 'employee' && !user.is_admin)) {
        return res.status(403).json({ error: 'Доступ только для сотрудников' });
    }
    res.json(eventRequests);
});

app.get('/api/my-requests', (req, res) => {
    const { userEmail } = req.query;
    const myRequests = eventRequests.filter(r => r.author_email === userEmail);
    res.json(myRequests);
});

app.post('/api/event-requests', (req, res) => {
    const { title, description, author_email, author_name } = req.body;
    if (!title || !description) {
        return res.status(400).json({ error: 'Заполните название и описание' });
    }
    const newRequest = {
        id: nextRequestId++,
        title,
        description,
        author_email,
        author_name,
        status: 'pending',
        created_at: new Date(),
        admin_comment: ''
    };
    eventRequests.push(newRequest);
    persist();
    res.json(newRequest);
});

app.put('/api/event-requests/:id', (req, res) => {
    const { id } = req.params;
    const { status, adminEmail, adminComment } = req.body;
    const admin = users.find(u => u.email === adminEmail);
    if (!admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Доступ только для администратора' });
    }
    const requestIndex = eventRequests.findIndex(r => r.id == id);
    if (requestIndex === -1) return res.status(404).json({ error: 'Заявка не найдена' });
    
    eventRequests[requestIndex].status = status;
    if (adminComment) eventRequests[requestIndex].admin_comment = adminComment;
    persist();
    res.json({ success: true });
});

app.get('/api/employees', (req, res) => {
    const { adminEmail } = req.query;
    const admin = users.find(u => u.email === adminEmail);
    if (!admin || !admin.is_admin) return res.status(403).json({ error: 'Доступ только для администратора' });
    res.json(users.filter(u => u.role === 'employee'));
});

app.post('/api/create-employee', (req, res) => {
    const { adminEmail, name, surname, phone, email } = req.body;
    const admin = users.find(u => u.email === adminEmail);
    if (!admin || !admin.is_admin) return res.status(403).json({ error: 'Доступ только для администратора' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email уже существует' });
    users.push({ id: nextUserId++, name, surname, phone, email, role: 'employee', is_admin: false, created_by: adminEmail });
    persist();
    res.json({ success: true });
});

app.delete('/api/employees/:email', (req, res) => {
    const { email } = req.params;
    const { adminEmail } = req.body;
    const admin = users.find(u => u.email === adminEmail);
    if (!admin || !admin.is_admin) return res.status(403).json({ error: 'Доступ только для администратора' });
    const index = users.findIndex(u => u.email === email && u.role === 'employee');
    if (index !== -1) users.splice(index, 1);
    persist();
    res.json({ success: true });
});

app.get('/api/users', (req, res) => {
    const { adminEmail } = req.query;
    const admin = users.find(u => u.email === adminEmail);
    if (!admin || !admin.is_admin) return res.status(403).json({ error: 'Доступ только для администратора' });
    res.json(users.filter(u => u.role === 'user'));
});

app.delete('/api/users/:email', (req, res) => {
    const { email } = req.params;
    const { adminEmail } = req.body;
    const admin = users.find(u => u.email === adminEmail);
    if (!admin || !admin.is_admin) return res.status(403).json({ error: 'Доступ только для администратора' });
    const index = users.findIndex(u => u.email === email);
    if (index !== -1) {
        participants = participants.filter(p => p.user_email !== email);
        reviews = reviews.filter(r => r.user_email !== email);
        users.splice(index, 1);
        persist();
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log('Данные сохраняются в файл data.json');
    console.log('Админ: admin@event.com');
});