const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Создаем HTTP сервер для обслуживания HTML страницы
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

// Создаем WebSocket сервер
const wss = new WebSocket.Server({ server });

// Хранилище бронирований
let bookings = [];
let bookingIdCounter = 1;

wss.on('connection', (ws) => {
    console.log('Новое подключение к WebSocket');

    // Отправляем приветственное сообщение
    ws.send(JSON.stringify({
        type: 'connection',
        message: 'Подключение к серверу бронирования установлено',
        status: 'success'
    }));

    // Отправляем текущие бронирования
    ws.send(JSON.stringify({
        type: 'bookings_update',
        bookings: bookings
    }));

    // Обработка сообщений от клиента
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Получено сообщение:', data);

            switch (data.type) {
                case 'new_booking':
                    handleNewBooking(ws, data);
                    break;
                    
                case 'get_bookings':
                    ws.send(JSON.stringify({
                        type: 'bookings_list',
                        bookings: bookings
                    }));
                    break;
                    
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Неизвестный тип сообщения'
                    }));
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Ошибка обработки запроса'
            }));
        }
    });

    // Обработка отключения клиента
    ws.on('close', () => {
        console.log('Клиент отключился');
    });

    ws.on('error', (error) => {
        console.error('WebSocket ошибка:', error);
    });
});

function handleNewBooking(ws, data) {
    // Валидация данных
    if (!data.restaurant || !data.date || !data.time || !data.guests || !data.name || !data.phone) {
        ws.send(JSON.stringify({
            type: 'booking_confirmation',
            success: false,
            message: 'Не все обязательные поля заполнены'
        }));
        return;
    }

    // Создаем новую бронь
    const newBooking = {
        id: `BK${bookingIdCounter++}`,
        restaurant: data.restaurant,
        date: data.date,
        time: data.time,
        guests: parseInt(data.guests),
        name: data.name,
        phone: data.phone,
        specialRequests: data.specialRequests || '',
        status: 'pending', // pending, confirmed, cancelled
        createdAt: new Date().toISOString(),
        confirmedAt: null
    };

    // Добавляем бронь в хранилище
    bookings.push(newBooking);

    // Отправляем подтверждение клиенту
    ws.send(JSON.stringify({
        type: 'booking_confirmation',
        success: true,
        bookingId: newBooking.id,
        message: `Бронь #${newBooking.id} успешно создана! Ожидайте подтверждения от ресторана.`
    }));

    // Имитируем подтверждение от ресторана через 3 секунды
    setTimeout(() => {
        newBooking.status = 'confirmed';
        newBooking.confirmedAt = new Date().toISOString();
        
        // Отправляем обновление статуса всем подключенным клиентам
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'booking_status_update',
                    bookingId: newBooking.id,
                    status: 'confirmed',
                    message: `Ресторан подтвердил вашу бронь #${newBooking.id}`
                }));
            }
        });
    }, 3000);

    // Рассылаем обновление списка бронирований всем клиентам
    broadcastBookingsUpdate();
}

function broadcastBookingsUpdate() {
    const updateMessage = JSON.stringify({
        type: 'bookings_update',
        bookings: bookings
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(updateMessage);
        }
    });
}

// Запускаем сервер
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; // Важно!

server.listen(PORT, HOST, () => {
    console.log(`🎯 Сервер бронирования запущен!`);
    console.log(`📍 Локальный доступ: http://localhost:${PORT}`);
    console.log(`🌐 Сетевой доступ: http://ваш-ip:${PORT}`);
    console.log(`📱 Телефон: http://ваш-ip:${PORT}`);
});