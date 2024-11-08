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

// Map to store unique cells using the Flyweight pattern
const knownTiles = new Map<string, { i: number; j: number }>();

// Set to store unique coins
const coins = new Set<{ i: number; j: number; serial: number }>();

// Update the player’s status display
function refreshStatus() {
  statusElement.innerHTML = `Points: ${score}`;
  inventoryElement.innerHTML = `Inventory: ${inventoryCoins} coins`;
}

// Flyweight pattern: Convert latitude–longitude to grid cells
function getCell(lat: number, lng: number) {
  const i = Math.floor(lat * 1e4); // Scale latitude
  const j = Math.floor(lng * 1e4); // Scale longitude
  const cellKey = `${i}:${j}`;

  // If cell doesn't exist, add it to knownTiles
  if (!knownTiles.has(cellKey)) {
    knownTiles.set(cellKey, { i, j });
  }
  return knownTiles.get(cellKey)!;
}

// Unique identifier for each coin based on cache location
function getCoinID(cell: { i: number; j: number }, serial: number) {
  return `${cell.i}:${cell.j}#${serial}`;
}

// Modified cache creation to generate unique coin objects
function createCache(x: number, y: number) {
  const base = INITIAL_PLAYER_POSITION;
  const cell = getCell(
    base.lat + x * TILE_SIZE_INCREMENT,
    base.lng + y * TILE_SIZE_INCREMENT,
  );
  const areaBounds = leaflet.latLngBounds([
    [base.lat + x * TILE_SIZE_INCREMENT, base.lng + y * TILE_SIZE_INCREMENT],
    [
      base.lat + (x + 1) * TILE_SIZE_INCREMENT,
      base.lng + (y + 1) * TILE_SIZE_INCREMENT,
    ],
  ]);

  const cacheRectangle = leaflet.rectangle(areaBounds).addTo(map);
  const cacheCoins = Math.floor(Math.random() * 5) + 1; // Between 1-5 coins

  // Generate unique coins
  let coinSerial = 0;
  const cacheCoinsList: string[] = [];
  for (let i = 0; i < cacheCoins; i++) {
    const coin = { i: cell.i, j: cell.j, serial: coinSerial++ };
    coins.add(coin);
    cacheCoinsList.push(getCoinID(cell, coin.serial));
  }

  // Setup cache popup details
  cacheRectangle.bindPopup(() => {
    const popupContent = document.createElement("div");
    popupContent.innerHTML = `
      <div>Cache located at (${cell.i},${cell.j})</div>
      <div>Coins:</div>
      <ul id="coinList"></ul>
      <button id="collectBtn">Collect Coins</button>
      <button id="depositBtn">Deposit Coins</button>
    `;

    // Display unique coin IDs in compact format for user readability
    const coinList = popupContent.querySelector("#coinList")!;
    cacheCoinsList.forEach((coinID) => {
      const listItem = document.createElement("li");
      listItem.textContent = `Coin ID: ${coinID}`;
      coinList.appendChild(listItem);
    });

    // Collect coins event
    popupContent.querySelector("#collectBtn")!.addEventListener("click", () => {
      if (cacheCoinsList.length > 0) {
        inventoryCoins += cacheCoinsList.length;
        cacheCoinsList.length = 0; // Clear coins from cache
        refreshStatus();
        coinList.innerHTML = "No coins left.";
      }
    });

    // Deposit coins event
    popupContent.querySelector("#depositBtn")!.addEventListener("click", () => {
      if (inventoryCoins > 0) {
        score += inventoryCoins;
        inventoryCoins = 0;
        refreshStatus();
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
