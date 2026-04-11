const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 3000 });

const clients = new Map(); // username -> { ws, isAlive }

// Heartbeat для поддержания соединения
function heartbeat() {
  this.isAlive = true;
}

server.on('connection', (ws) => {
  let username = null;
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch(message.type) {
        case 'login':
          username = message.username;
          clients.set(username, { ws, isAlive: true });
          ws.username = username;
          
          // Отправляем список онлайн пользователей
          const onlineUsers = Array.from(clients.keys());
          ws.send(JSON.stringify({ 
            type: 'users_list', 
            users: onlineUsers 
          }));
          
          // Оповещаем всех о новом пользователе
          broadcastUserStatus(username, true, clients);
          break;
          
        case 'call_offer':
        case 'call_answer':
        case 'ice_candidate':
        case 'call_end':
        case 'message':
          const target = clients.get(message.to);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({ 
              ...message, 
              from: username 
            }));
          }
          break;
      }
    } catch(e) {
      console.error('Error parsing message:', e);
    }
  });
  
  ws.on('close', () => {
    if (username) {
      clients.delete(username);
      broadcastUserStatus(username, false, clients);
    }
  });
});

// Ping all clients every 30 seconds to keep connections alive
const interval = setInterval(() => {
  clients.forEach((client, username) => {
    if (client.ws.isAlive === false) {
      clients.delete(username);
      broadcastUserStatus(username, false, clients);
      return client.ws.terminate();
    }
    client.ws.isAlive = false;
    client.ws.ping();
  });
}, 30000);

server.on('close', () => {
  clearInterval(interval);
});

function broadcastUserStatus(username, isOnline, clientsMap) {
  const statusMsg = JSON.stringify({
    type: isOnline ? 'user_online' : 'user_offline',
    username: username
  });
  
  clientsMap.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(statusMsg);
    }
  });
}

console.log(`Signaling server running on port ${process.env.PORT || 3000}`);