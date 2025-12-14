// Offline Storage and Sync Management
// Handles IndexedDB storage and syncing to Google Apps Script backend

class OfflineManager {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.dbName = 'MyWorkoutTrackerDB';
    this.dbVersion = 1;
    this.db = null;
    this.isOnline = navigator.onLine;
    
    this.init();
  }
  
  async init() {
    await this.openDB();
    this.setupNetworkListeners();
    this.setupSyncListener();
    
    // Try to sync on startup if online
    if (this.isOnline) {
      setTimeout(() => this.syncPendingWorkouts(), 1000);
    }
  }
  
  // Open IndexedDB database
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('workouts')) {
          const workoutStore = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
          workoutStore.createIndex('synced', 'synced', { unique: false });
          workoutStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('exerciseCache')) {
          db.createObjectStore('exerciseCache', { keyPath: 'id' });
        }
      };
    });
  }
  
  // Setup network status listeners
  setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('[Offline] Back online!');
      this.isOnline = true;
      this.updateUI(true);
      this.syncPendingWorkouts();
    });
    
    window.addEventListener('offline', () => {
      console.log('[Offline] Gone offline');
      this.isOnline = false;
      this.updateUI(false);
    });
  }
  
  // Setup service worker sync listener
  setupSyncListener() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_WORKOUTS') {
          this.syncPendingWorkouts();
        }
      });
    }
  }
  
  // Update UI based on online/offline status
  updateUI(isOnline) {
    const statusEl = document.getElementById('onlineStatus');
    if (statusEl) {
      if (isOnline) {
        statusEl.innerHTML = '✅ Online';
        statusEl.className = 'status-online';
      } else {
        statusEl.innerHTML = '🔴 Offline Mode';
        statusEl.className = 'status-offline';
      }
    }
  }
  
  // Save workout (offline or online)
  async saveWorkout(workoutData) {
    const workout = {
      ...workoutData,
      timestamp: new Date().toISOString(),
      synced: false
    };
    
    if (this.isOnline) {
      // Try to save directly to backend
      try {
        await this.sendToBackend(workout);
        workout.synced = true;
        // Still save to IndexedDB as backup
        await this.saveToIndexedDB(workout);
        return { success: true, synced: true };
      } catch (error) {
        console.error('[Offline] Failed to sync, saving locally:', error);
        // Save locally if backend fails
        await this.saveToIndexedDB(workout);
        return { success: true, synced: false, message: 'Saved locally, will sync later' };
      }
    } else {
      // Offline - save to IndexedDB
      await this.saveToIndexedDB(workout);
      return { success: true, synced: false, message: 'Saved offline, will sync when online' };
    }
  }
  
  // Save to IndexedDB
  saveToIndexedDB(workout) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['workouts'], 'readwrite');
      const store = transaction.objectStore('workouts');
      const request = store.add(workout);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  // Send workout to Google Apps Script backend
  async sendToBackend(workout) {
    const response = await fetch(`${this.apiUrl}?action=submitWorkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workout)
    });
    
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }
    
    return await response.json();
  }
  
  // Get all pending (unsynced) workouts
getPendingWorkouts() {
  return new Promise((resolve, reject) => {
    const transaction = this.db.transaction(['workouts'], 'readonly');
    const store = transaction.objectStore('workouts');
    const index = store.index('synced');
    
    // Use IDBKeyRange for the boolean value
    const request = index.getAll(IDBKeyRange.only(false));
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
  
  // Sync all pending workouts
  async syncPendingWorkouts() {
    if (!this.isOnline) {
      console.log('[Offline] Cannot sync - offline');
      return;
    }
    
    const pending = await this.getPendingWorkouts();
    
    if (pending.length === 0) {
      console.log('[Offline] No pending workouts to sync');
      this.showSyncStatus('All synced! ✅');
      return;
    }
    
    console.log(`[Offline] Syncing ${pending.length} pending workouts...`);
    this.showSyncStatus(`Syncing ${pending.length} workouts...`);
    
    let synced = 0;
    let failed = 0;
    
    for (const workout of pending) {
      try {
        await this.sendToBackend(workout);
        await this.markAsSynced(workout.id);
        synced++;
      } catch (error) {
        console.error('[Offline] Failed to sync workout:', error);
        failed++;
      }
    }
    
    if (failed === 0) {
      this.showSyncStatus(`✅ All ${synced} workouts synced!`);
    } else {
      this.showSyncStatus(`⚠️ Synced ${synced}, failed ${failed}`);
    }
  }
  
  // Mark workout as synced
  markAsSynced(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['workouts'], 'readwrite');
      const store = transaction.objectStore('workouts');
      const request = store.get(id);
      
      request.onsuccess = () => {
        const workout = request.result;
        if (workout) {
          workout.synced = true;
          const updateRequest = store.put(workout);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  // Show sync status message
  showSyncStatus(message) {
    const statusEl = document.getElementById('syncStatus');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.display = 'block';
      
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 3000);
    }
  }
  
  // Get pending count
  async getPendingCount() {
    const pending = await this.getPendingWorkouts();
    return pending.length;
  }
  
  // API call wrapper with offline handling
  async apiCall(action, data = {}) {
    if (!this.isOnline) {
      throw new Error('Offline - cannot make API call');
    }
    
    const response = await fetch(`${this.apiUrl}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  }
  
  // Cache exercise database
  async cacheExercises(exercises) {
    const transaction = this.db.transaction(['exerciseCache'], 'readwrite');
    const store = transaction.objectStore('exerciseCache');
    
    await store.clear();
    await store.add({ id: 'exercises', data: exercises, timestamp: Date.now() });
  }
  
  // Get cached exercises
  async getCachedExercises() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['exerciseCache'], 'readonly');
      const store = transaction.objectStore('exerciseCache');
      const request = store.get('exercises');
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          resolve([]);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}

// Export for use in main app
window.OfflineManager = OfflineManager;
