const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const https = require("https");
const { v4: uuidv4 } = require("uuid");
const protobuf = require("protobufjs");
const { MarketData } = require("google-protobuf/google/protobuf/descriptor_pb");

const app = express();
const port = process.env.PORT || 3000;

// Replace with your Upstox access token
const accessToken =
  "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI3VUE0N1QiLCJqdGkiOiI2NjdjZWY0N2ExNzU5YzZlNmEwMjU1NjkiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaWF0IjoxNzE5NDYzNzUxLCJpc3MiOiJ1ZGFwaS1nYXRld2F5LXNlcnZpY2UiLCJleHAiOjE3MTk1MjU2MDB9.rIYGxVOoGQlX2g6TzsyM50BZ2gff_DS-pplzCGivmsk";

// The initial WebSocket URL
const initialWebSocketUrl = "wss://api.upstox.com/v2/feed/market-data-feed";

// Function to handle HTTP/HTTPS requests
function makeHttpRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers }, (res) => {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        resolve(res.headers.location);
      } else {
        reject(new Error(`Failed to get redirect URL: ${res.statusCode}`));
      }
    });

    req.on("error", (err) => {
      reject(err);
    });
  });
}

// Create a WebSocket server that listens on the specified port
const wss = new WebSocket.Server({ server: app.listen(port) });

wss.on("connection", (wsClient) => {
  console.log("Client connected");

  // First, make an HTTP request to get the final WebSocket URL
  makeHttpRequest(initialWebSocketUrl.replace("wss", "https"), {
    Authorization: `Bearer ${accessToken}`,
    Accept: "*/*",
  })
    .then((finalWebSocketUrl) => {
      console.log("Redirecting to:", finalWebSocketUrl);

      // Create a WebSocket connection to the final URL
      const wsUpstox = new WebSocket(finalWebSocketUrl.replace("https", "wss"), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "*/*",
        },
      });

      wsUpstox.on("open", () => {
        console.log("Connected to Upstox WebSocket");

        // Subscribe to the option chain data
        const guid = uuidv4();
        const subscriptionRequest = {
          guid: guid,
          method: "sub",
          data: {
            mode: "full",
            instrumentKeys: ["NSE_EQ|HDFCBANK"],
          },
        };

        wsUpstox.send(JSON.stringify(subscriptionRequest));
      });

      wsUpstox.on("message", (message) => {
        console.log("Received message from Upstox:", message);

        // Decode protobuf message
        try {
          const decodedMessage = MarketData.decode(message);
          console.log("Decoded message:", decodedMessage);
          // Forward the message to the connected client
          wsClient.send(JSON.stringify(decodedMessage));
        } catch (error) {
          console.error("Error decoding protobuf message:", error);
        }
      });

      wsUpstox.on("error", (error) => {
        console.error("WebSocket error:", error);
      });

      wsUpstox.on("close", () => {
        console.log("Upstox WebSocket connection closed");
      });

      wsClient.on("close", () => {
        console.log("Client disconnected");
        wsUpstox.close();
      });

      wsClient.on("error", (error) => {
        console.error("Client WebSocket error:", error);
      });
    })
    .catch((error) => {
      console.error("HTTP request error:", error);
      wsClient.close();
    });
});

console.log(`Server listening on port ${port}`);
