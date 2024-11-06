// Import necessary libraries and styles
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

// Constants for game configuration
const TILE_SIZE_INCREMENT = 1e-4; // Defines tile size
const AREA_RADIUS = 8; // Defines cache spawn radius around player
const CACHE_PROBABILITY = 0.1; // Probability for cache generation
const INITIAL_PLAYER_POSITION = leaflet.latLng(36.9895, -122.0628); // Starting point
let score = 0; // Player score
let inventoryCoins = 0; // Player's collected coins

// Initialize the map with specific options
const map = leaflet.map("map", {
  center: INITIAL_PLAYER_POSITION,
  zoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Tile layer using OpenStreetMap
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
}).addTo(map);

// Add player marker to starting location
const _playerMarker = leaflet.marker(INITIAL_PLAYER_POSITION).addTo(map);

// Get status and inventory panels for updating
const statusElement = document.querySelector("#statusPanel")!;
const inventoryElement = document.querySelector("#inventory")!;

// Update the player’s status display
function refreshStatus() {
  statusElement.innerHTML = `Points: ${score}`;
  inventoryElement.innerHTML = `Inventory: ${inventoryCoins} coins`;
}

// Spawn caches around player within a specified area radius
function createCache(x: number, y: number) {
  const base = INITIAL_PLAYER_POSITION;
  const areaBounds = leaflet.latLngBounds([
    [base.lat + x * TILE_SIZE_INCREMENT, base.lng + y * TILE_SIZE_INCREMENT],
    [
      base.lat + (x + 1) * TILE_SIZE_INCREMENT,
      base.lng + (y + 1) * TILE_SIZE_INCREMENT,
    ],
  ]);

  const cacheRectangle = leaflet.rectangle(areaBounds).addTo(map);
  let cacheAmount = Math.floor(Math.random() * 5) + 1; // Generate between 1-5 coins

  // Setup cache popup details
  cacheRectangle.bindPopup(() => {
    const popupContent = document.createElement("div");
    popupContent.innerHTML = `
      <div>Cache located at (${x},${y})</div>
      <div>Coins: <span id="coinDisplay">${cacheAmount}</span></div>
      <button id="collectBtn">Collect Coins</button>
      <button id="depositBtn">Deposit Coins</button>
    `;

    // Collect coins event
    popupContent.querySelector("#collectBtn")!.addEventListener("click", () => {
      if (cacheAmount > 0) {
        inventoryCoins += cacheAmount;
        cacheAmount = 0;
        refreshStatus();
        popupContent.querySelector("#coinDisplay")!.textContent = "0";
      }
    });

    // Deposit coins event
    popupContent.querySelector("#depositBtn")!.addEventListener("click", () => {
      if (inventoryCoins > 0) {
        cacheAmount += inventoryCoins;
        score += inventoryCoins;
        inventoryCoins = 0;
        refreshStatus();
        popupContent.querySelector("#coinDisplay")!.textContent =
          `${cacheAmount}`;
      }
    });

    return popupContent; // Return generated popup content
  });
}

// Populate neighborhood area with random caches
for (let x = -AREA_RADIUS; x <= AREA_RADIUS; x++) {
  for (let y = -AREA_RADIUS; y <= AREA_RADIUS; y++) {
    if (Math.random() < CACHE_PROBABILITY) {
      createCache(x, y); // Place cache if random probability is met
    }
  }
}

// Event listener for resetting player state
document.querySelector("#resetGame")!.addEventListener("click", () => {
  score = 0; // Reset score
  inventoryCoins = 0; // Clear inventory
  refreshStatus(); // Update the UI
});
