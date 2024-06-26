const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const https = require("https");

const app = express();
const port = process.env.PORT || 3000;

// Replace with your Upstox access token
const accessToken =
  "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI3VUE0N1QiLCJqdGkiOiI2NjdiN2M1OWExNzU5YzZlNmEwMWFhYjUiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaWF0IjoxNzE5MzY4NzkzLCJpc3MiOiJ1ZGFwaS1nYXRld2F5LXNlcnZpY2UiLCJleHAiOjE3MTk0MzkyMDB9.-jHj0ZeXPkYBa6noef5Z-JP84al_Ki3YOseiQ1PPW0c";

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
      const wsUpstox = new WebSocket(
        finalWebSocketUrl.replace("https", "wss"),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "*/*",
          },
        }
      );

      wsUpstox.on("open", () => {
        console.log("Connected to Upstox WebSocket");

        // Subscribe to the option chain data
        const subscriptionRequest = {
          guid: "someguid", // Replace with your actual GUID
          method: "sub",
          data: {
            mode: "option_chain",
            instrumentKeys: ["NSE_INDEX|Nifty Bank"], // Replace with your actual instrument keys
          },
        };

        wsUpstox.send(JSON.stringify(subscriptionRequest));
      });

      wsUpstox.on("message", (message) => {
        console.log("Received message from Upstox:", message);
        // Forward the message to the connected client
        wsClient.send(message);
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
