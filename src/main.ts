import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

// Constants and variables
const TILE_DEGREES = 1e-4; // Tile size increment
const NEIGHBORHOOD_SIZE = 8; // Size of area for cache generation
const CACHE_SPAWN_PROBABILITY = 0.1; // Chance of spawning a cache
const NULL_ISLAND = L.latLng(0, 0); // Null Island as a geodetic datum reference point
const _PLAYER_START = L.latLng(36.9895, -122.0628);
let playerPoints = 0; // Player's score
let playerInventory = 0; // Player's coin count

// Initialize map
const map = L.map("map", {
  center: NULL_ISLAND,
  zoom: 19,
  zoomControl: true,
  scrollWheelZoom: true,
});

// Add OpenStreetMap tiles
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
}).addTo(map);

// Status and Inventory updates
const statusPanel = document.querySelector("#statusPanel");
const inventoryPanel = document.querySelector("#inventory");

const playerMarker = L.marker(NULL_ISLAND).addTo(map);
playerMarker.bindTooltip("That's you!");

// Function to update status display
function updateStatus() {
  if (statusPanel) statusPanel.innerHTML = `Points: ${playerPoints}`;
  if (inventoryPanel) {
    inventoryPanel.innerHTML = `Inventory: ${playerInventory} coins`;
  }
}

// Location Factory using Flyweight Pattern
class LocationFactory {
  private locations: { [key: string]: L.LatLng } = {};

  getLocation(lat: number, lng: number): L.LatLng {
    const key = `${lat},${lng}`;
    if (!this.locations[key]) {
      this.locations[key] = L.latLng(lat, lng);
    }
    return this.locations[key];
  }
}

const locationFactory = new LocationFactory(); // Instantiate the factory

// Coin as a non-fungible token representation
type Coin = { i: number; j: number; serial: number }; // Unique ID based on cache coordinates and serial
let coinIdCounter = 0; // Global counter to ensure unique coin serials

// Cache Memento class to store the state
class CacheMemento {
  constructor(public cacheCoins: Coin[]) {}
}

class Cache {
  private coins: Coin[] = [];
  public memento?: CacheMemento;

  constructor(public i: number, public j: number) {}

  saveState(): CacheMemento {
    this.memento = new CacheMemento([...this.coins]);
    return this.memento;
  }

  restoreState(memento: CacheMemento) {
    this.coins = memento.cacheCoins;
  }

  addCoins(coins: Coin[]) {
    this.coins.push(...coins);
  }

  collectCoins() {
    const collectedCoins = this.coins.length;
    this.coins = [];
    return collectedCoins;
  }

  get coinCount() {
    return this.coins.length;
  }
}

const cacheMap: Map<string, Cache> = new Map();

function spawnCache(i: number, j: number) {
  const key = `${i},${j}`;
  const cache = new Cache(i, j);
  cacheMap.set(key, cache);

  const cacheCoins = Array.from(
    { length: Math.floor(Math.random() * 5) + 1 },
    (_, serial) => ({ i, j, serial }),
  );
  cache.addCoins(cacheCoins);

  const origin = NULL_ISLAND;
  const lat = origin.lat + i * TILE_DEGREES;
  const lng = origin.lng + j * TILE_DEGREES;

  const bounds = L.latLngBounds([
    locationFactory.getLocation(lat, lng),
    locationFactory.getLocation(lat + TILE_DEGREES, lng + TILE_DEGREES),
  ]);

  const rect = L.rectangle(bounds).addTo(map);
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at (${i},${j})</div>
      <div>Coins available: <span id="coinCount">${cache.coinCount}</span></div>
      <button id="collectCoins">Collect</button>
      <button id="depositCoins">Deposit</button>
    `;

    popupDiv.querySelector("#collectCoins")?.addEventListener("click", () => {
      if (cache.coinCount > 0) {
        playerInventory += cache.collectCoins();
        updateStatus();
        popupDiv.querySelector("#coinCount")!.textContent = "0";
      }
    });

    popupDiv.querySelector("#depositCoins")?.addEventListener("click", () => {
      if (playerInventory > 0) {
        const depositCoins = Array.from(
          { length: playerInventory },
          (_, _serial) => ({ i, j, serial: coinIdCounter++ }),
        );
        cache.addCoins(depositCoins);
        playerPoints += playerInventory;
        playerInventory = 0;
        updateStatus();
        popupDiv.querySelector("#coinCount")!.textContent =
          `${cache.coinCount}`;
      }
    });

    return popupDiv;
  });
}

function movePlayer(dx: number, dy: number) {
  const newLat = playerMarker.getLatLng().lat + dy;
  const newLng = playerMarker.getLatLng().lng + dx;
  const newPos = locationFactory.getLocation(newLat, newLng);
  playerMarker.setLatLng(newPos);

  regenerateCachesAround(newPos);
  map.panTo(newPos);
}

function regenerateCachesAround(playerPos: L.LatLng) {
  map.eachLayer((layer: L.Layer) => {
    if (layer instanceof L.Rectangle) {
      map.removeLayer(layer);
    }
  });

  const playerI = Math.floor((playerPos.lat - NULL_ISLAND.lat) / TILE_DEGREES);
  const playerJ = Math.floor((playerPos.lng - NULL_ISLAND.lng) / TILE_DEGREES);

  for (
    let i = playerI - NEIGHBORHOOD_SIZE;
    i <= playerI + NEIGHBORHOOD_SIZE;
    i++
  ) {
    for (
      let j = playerJ - NEIGHBORHOOD_SIZE;
      j <= playerJ + NEIGHBORHOOD_SIZE;
      j++
    ) {
      const key = `${i},${j}`;

      if (cacheMap.has(key)) {
        const cache = cacheMap.get(key)!;
        if (cache.memento) {
          cache.restoreState(cache.memento);
        }
        spawnCache(i, j);
      } else if (Math.random() < CACHE_SPAWN_PROBABILITY) {
        spawnCache(i, j);
      }
    }
  }

  cacheMap.forEach((cache, key) => {
    const cacheLatLng = locationFactory.getLocation(
      NULL_ISLAND.lat + cache.i * TILE_DEGREES,
      NULL_ISLAND.lng + cache.j * TILE_DEGREES,
    );
    if (
      playerPos.distanceTo(cacheLatLng) > TILE_DEGREES * NEIGHBORHOOD_SIZE * 2
    ) {
      cache.saveState();
      cacheMap.delete(key);
    }
  });
}

// Event listeners for movement buttons
document.querySelector("#moveUp")?.addEventListener(
  "click",
  () => movePlayer(0, TILE_DEGREES),
);
document.querySelector("#moveDown")?.addEventListener(
  "click",
  () => movePlayer(0, -TILE_DEGREES),
);
document.querySelector("#moveLeft")?.addEventListener(
  "click",
  () => movePlayer(-TILE_DEGREES, 0),
);
document.querySelector("#moveRight")?.addEventListener(
  "click",
  () => movePlayer(TILE_DEGREES, 0),
);

// Initial cache generation
for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
    if (Math.random() < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}

// Reset game
document.querySelector("#resetGame")?.addEventListener("click", () => {
  playerPoints = 0;
  playerInventory = 0;
  updateStatus();
});
