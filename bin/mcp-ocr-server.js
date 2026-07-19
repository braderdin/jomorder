// Start: Custom OCR MCP Server (stdio)
// Minimal MCP server exposing an "ocr_image" tool using node-tesseract-ocr.
// Usage: node bin/mcp-ocr-server.js  (spawned by Cline via mcp.json)
const readline = require("readline");

// Lazy require tesseract; if not installed we still respond with a clear error.
let Tesseract = null;
try {
  Tesseract = require("node-tesseract-ocr");
} catch (e) {
  Tesseract = null;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, crlfDelay: Infinity });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// MCP handshake: respond to initialize + tools/list
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "ocr", version: "1.0.0" } } });
  } else if (msg.method === "tools/list") {
    send({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "ocr_image", description: "Extract text from an image file path using Tesseract OCR", inputSchema: { type: "object", properties: { image_path: { type: "string" }, lang: { type: "string" } }, required: ["image_path"] } }] } });
  } else if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params || {};
    if (name === "ocr_image") {
      if (!Tesseract) {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "ERROR: node-tesseract-ocr not installed. Run: npm i node-tesseract-ocr" }] } });
        return;
      }
      const lang = args.lang || "eng+msa";
      Tesseract.recognize(args.image_path, { lang, oem: 1, psm: 3 })
        .then((text) => send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: text || "(no text found)" }] } }))
        .catch((e) => send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "OCR_ERROR: " + e.message }] } }));
    } else {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "unknown tool" } });
    }
  }
});

// End: Custom OCR MCP Server