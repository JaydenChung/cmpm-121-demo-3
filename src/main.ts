import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

import luck from "./luck.ts";

// Constants and variables
const TILE_DEGREES = 1e-4; // Tile size increment
const NEIGHBORHOOD_SIZE = 8; // Size of area for cache generation
const CACHE_SPAWN_PROBABILITY = 0.1; // Chance of spawning a cache
const NULL_ISLAND = leaflet.latLng(0, 0); // Null Island as a geodetic datum reference point
const _PLAYER_START = leaflet.latLng(36.9895, -122.0628);
let playerPoints = 0; // Player's score
let playerInventory = 0; // Player's coin count

// Initialize map
const map = leaflet.map("map", {
  center: NULL_ISLAND,
  zoom: 19,
  zoomControl: true,
  scrollWheelZoom: true,
});

// Add OpenStreetMap tiles
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
}).addTo(map);

// Status and Inventory updates
const inventoryPanel = document.querySelector("#inventory");

const playerMarker = leaflet.marker(NULL_ISLAND).addTo(map);
playerMarker.bindTooltip("That's you!");

// Function to update status display 111
function updateStatus() {
  if (inventoryPanel) {
    inventoryPanel.innerHTML = `Inventory: ${playerInventory} coins`;
  }
}

// Location Factory using Flyweight Pattern
class LocationFactory {
  private locations: { [key: string]: leaflet.LatLng } = {};

  getLocation(lat: number, lng: number): leaflet.LatLng {
    const key = `${lat},${lng}`;
    if (!this.locations[key]) {
      this.locations[key] = leaflet.latLng(lat, lng);
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

class CacheManager {
  private cacheMap: Map<string, Cache> = new Map();

  constructor(
    private map: leaflet.Map,
    private locationFactory: LocationFactory,
    private tileDegrees: number,
    private spawnProbability: number,
  ) {}

  public spawnCache(i: number, j: number): void {
    const key = `${i},${j}`;
    const cache = new Cache(i, j);
    this.cacheMap.set(key, cache);

    const cacheCoins = Array.from(
      { length: Math.floor(Math.random() * 5) + 1 },
      (_, serial) => ({ i, j, serial }),
    );
    cache.addCoins(cacheCoins);

    const origin = NULL_ISLAND;
    const lat = origin.lat + i * this.tileDegrees;
    const lng = origin.lng + j * this.tileDegrees;

    const bounds = leaflet.latLngBounds([
      this.locationFactory.getLocation(lat, lng),
      this.locationFactory.getLocation(
        lat + this.tileDegrees,
        lng + this.tileDegrees,
      ),
    ]);

    const rect = leaflet.rectangle(bounds).addTo(this.map);
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

  public regenerateCachesAround(playerPos: leaflet.LatLng): void {
    this.cleanupOldCaches();

    const playerI = Math.floor(
      (playerPos.lat - NULL_ISLAND.lat) / this.tileDegrees,
    );
    const playerJ = Math.floor(
      (playerPos.lng - NULL_ISLAND.lng) / this.tileDegrees,
    );

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

        if (this.cacheMap.has(key)) {
          const cache = this.cacheMap.get(key)!;
          if (cache.memento) {
            cache.restoreState(cache.memento);
          }
        } else if (Math.random() < this.spawnProbability) {
          this.spawnCache(i, j);
        }
      }
    }

    // Save states and delete caches far from the player
    this.cacheMap.forEach((cache, key) => {
      const cacheLatLng = this.locationFactory.getLocation(
        NULL_ISLAND.lat + cache.i * this.tileDegrees,
        NULL_ISLAND.lng + cache.j * this.tileDegrees,
      );
      if (
        playerPos.distanceTo(cacheLatLng) >
          this.tileDegrees * NEIGHBORHOOD_SIZE * 2
      ) {
        cache.saveState();
        this.cacheMap.delete(key);
      }
    });
  }

  public cleanupOldCaches(): void {
    this.map.eachLayer((layer: L.Layer) => {
      if (layer instanceof leaflet.Rectangle) {
        this.map.removeLayer(layer);
      }
    });
  }
}

// Instantiate CacheManager
const cacheManager = new CacheManager(
  map,
  locationFactory,
  TILE_DEGREES,
  CACHE_SPAWN_PROBABILITY,
);

// Update movePlayer to use CacheManager
function movePlayer(dx: number, dy: number): void {
  const newLat = playerMarker.getLatLng().lat + dy;
  const newLng = playerMarker.getLatLng().lng + dx;
  const newPos = locationFactory.getLocation(newLat, newLng);
  playerMarker.setLatLng(newPos);

  cacheManager.regenerateCachesAround(newPos); // Delegate responsibility
  map.panTo(newPos);
}

// Use CacheManager initially to spawn caches
cacheManager.regenerateCachesAround(_PLAYER_START);

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

  const bounds = leaflet.latLngBounds([
    locationFactory.getLocation(lat, lng),
    locationFactory.getLocation(lat + TILE_DEGREES, lng + TILE_DEGREES),
  ]);

  const rect = leaflet.rectangle(bounds).addTo(map);
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

// function regenerateCachesAround(playerPos: leaflet.LatLng) {
//   map.eachLayer((layer: L.Layer) => {
//     if (layer instanceof leaflet.Rectangle) {
//       map.removeLayer(layer);
//     }
//   });

//   const playerI = Math.floor((playerPos.lat - NULL_ISLAND.lat) / TILE_DEGREES);
//   const playerJ = Math.floor((playerPos.lng - NULL_ISLAND.lng) / TILE_DEGREES);

//   for (
//     let i = playerI - NEIGHBORHOOD_SIZE;
//     i <= playerI + NEIGHBORHOOD_SIZE;
//     i++
//   ) {
//     for (
//       let j = playerJ - NEIGHBORHOOD_SIZE;
//       j <= playerJ + NEIGHBORHOOD_SIZE;
//       j++
//     ) {
//       const key = `${i},${j}`;

//       if (cacheMap.has(key)) {
//         const cache = cacheMap.get(key)!;
//         if (cache.memento) {
//           cache.restoreState(cache.memento);
//         }
//         spawnCache(i, j);
//       } else if (Math.random() < CACHE_SPAWN_PROBABILITY) {
//         spawnCache(i, j);
//       }
//     }
//   }

//   cacheMap.forEach((cache, key) => {
//     const cacheLatLng = locationFactory.getLocation(
//       NULL_ISLAND.lat + cache.i * TILE_DEGREES,
//       NULL_ISLAND.lng + cache.j * TILE_DEGREES,
//     );
//     if (
//       playerPos.distanceTo(cacheLatLng) > TILE_DEGREES * NEIGHBORHOOD_SIZE * 2
//     ) {
//       cache.saveState();
//       cacheMap.delete(key);
//     }
//   });
// }

// Button definitions for controlling movement

// Add a marker to represent the player
const savedPosition = localStorage.getItem("playerPosition");
let _playerPosI: number;
let _playerPosJ: number;
if (savedPosition) {
  // If a position was saved in localStorage, use it to update the player's position
  const position = JSON.parse(savedPosition);
  _playerPosI = position.lat;
  _playerPosJ = position.lng;
} else {
  _playerPosI = _PLAYER_START.lat;
  _playerPosJ = _PLAYER_START.lng;
}

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
document.querySelector("#teleport")?.addEventListener(
  "click",
  () =>
    navigator.geolocation.getCurrentPosition(onLocationFound, onLocationError),
);

document.querySelector("#reset")?.addEventListener(
  "click",
  () => {
    if (confirm("Are you sure you want to reset all progress?")) {
      localStorage.setItem(
        "playerPosition",
        JSON.stringify({ lat: _PLAYER_START.lat, lng: _PLAYER_START.lng }),
      );
      _playerPosI = _PLAYER_START.lat;
      _playerPosJ = _PLAYER_START.lng;
      playerMarker.setLatLng(
        leaflet.latLng(_PLAYER_START.lat, _PLAYER_START.lng),
      );
      map.panTo(leaflet.latLng(_PLAYER_START.lat, _PLAYER_START.lng));
      updateNeighborhood(leaflet.latLng(_PLAYER_START.lat, _PLAYER_START.lng));
      playerPoints = 0;
    }
    for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
      for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
        if (Math.random() < CACHE_SPAWN_PROBABILITY) {
          spawnCache(i, j);
        }
      }
    }
  },
);

function onLocationFound(position: GeolocationPosition) {
  playerMarker.setLatLng(
    leaflet.latLng(position.coords.latitude, position.coords.longitude),
  );
  _playerPosI = position.coords.latitude;
  _playerPosJ = position.coords.longitude;
  map.panTo(
    leaflet.latLng(position.coords.latitude, position.coords.longitude),
  );
  updateNeighborhood(
    leaflet.latLng(position.coords.latitude, position.coords.longitude),
  );
}

function onLocationError() {
  alert(`can't find location`);
}

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

updateNeighborhood(_PLAYER_START);

function updateNeighborhood(center: leaflet.LatLng) {
  cleanupOldCaches(); //Wipe caches first
  // Define a new neighborhood area around the player
  const new_i = Math.floor((center.lat - _PLAYER_START.lat) * 10000);
  const new_j = Math.floor((center.lng - _PLAYER_START.lng) * 10000);

  // Define a new neighborhood area around the player
  const newNeighborhood = new Set<string>(); // Store grid coordinates of new caches

  // Spawn new caches in the player's neighborhood (around the new coordinates)
  for (let i = new_i - NEIGHBORHOOD_SIZE; i <= new_i + NEIGHBORHOOD_SIZE; i++) {
    for (
      let j = new_j - NEIGHBORHOOD_SIZE;
      j <= new_j + NEIGHBORHOOD_SIZE;
      j++
    ) {
      if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(i, j); // Call function to spawn a cache in this grid cell
      }
      newNeighborhood.add(`${i},${j}`);
    }
  }
}

function cleanupOldCaches() {
  map.eachLayer(function (layer: leaflet.layer) {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer);
    }
  });
}
