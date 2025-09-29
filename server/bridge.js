import express from "express";
import { WebSocketServer } from "ws";
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

// === CONFIG ===
const SERIAL_PORT = "COM7";   // change to match your Arduino
const SERIAL_BAUD = 9600;
const WS_PORT = 3000;

// === SERIAL SETUP ===
const port = new SerialPort({ path: SERIAL_PORT, baudRate: SERIAL_BAUD });
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

port.on("open", () => {
  console.log(`🔌 Serial connected on ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
});

port.on("error", (err) => {
  console.error("❌ Serial error:", err.message);
});

// === WEBSOCKET SETUP ===
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`🧠 WebSocket running on ws://localhost:${WS_PORT}`);

function broadcast(msg) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

// Forward serial → WebSocket
parser.on("data", (line) => {
  const clean = line.trim();
  if (!clean) return;
  console.log("📦 From Arduino:", clean);
  broadcast(clean);
});

// === EXPRESS SERVER (optional test) ===
const app = express();
app.get("/", (_, res) => res.send("✅ Vibrasense bridge running"));
app.listen(WS_PORT + 1, () =>
  console.log(`🌐 HTTP server at http://localhost:${WS_PORT + 1}`)
);
