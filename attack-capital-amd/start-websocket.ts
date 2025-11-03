const { AudioWebSocketServer } = require("./websocket-server");

console.log("🚀 Starting AMD WebSocket Server...");

// Start the server
const audioWebSocketServer = new AudioWebSocketServer(8081);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("🛑 Shutting down WebSocket server...");
  audioWebSocketServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("🛑 Shutting down WebSocket server...");
  audioWebSocketServer.close();
  process.exit(0);
});
