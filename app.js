// My Workout Tracker - Main App Logic
// Handles workout logging, API calls, and offline sync

// ========== CONFIGURATION ==========

// ⚠️ IMPORTANT: Replace this with your Google Apps Script Web App URL
const API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
// Example: 'https://script.google.com/macros/s/AKfycby...xyz123.../exec'

// ========== GLOBAL STATE ==========

let currentUserEmail = null;
let offlineManager = null;
let exerciseCounter = 0;
let setCounters = {};

// ========== INITIALIZATION ==========

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize offline manager
    offlineManager = new OfflineManager(API_URL);
    
    // Register service worker
    registerServiceWorker();
    
    // Check authentication
    checkAuthentication();
    
    // Setup PWA install prompt
    setupInstallPrompt();
});

// ========== SERVICE WORKER REGISTRATION ==========

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('[PWA] Service Worker registered:', registration);
            })
            .catch(error => {
                console.error('[PWA] Service Worker registration failed:', error);
            });
    }
}

// ========== AUTHENTICATION ==========

async function checkAuthentication() {
    try {
        const response = await offlineManager.apiCall('checkUserAccess');
        
        if (response.approved) {
            currentUserEmail = response.email;
            showScreen('mainAppScreen');
            initializeApp();
        } else {
            document.getElementById('deniedUserEmail').textContent = response.email || 'Unknown';
            showScreen('accessDeniedScreen');
        }
    } catch (error) {
        console.error('[Auth] Error:', error);
        // If offline, show access denied
        showScreen('accessDeniedScreen');
        document.getElementById('deniedUserEmail').textContent = 'Unable to verify (offline)';
    }
}

function showScreen(screenId) {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.remove('active'));
    
    // Show selected screen
    const selectedScreen = document.getElementById(screenId);
    if (selectedScreen) {
        selectedScreen.classList.add('active');
    }
}

// ========== APP INITIALIZATION ==========

function initializeApp() {
    // Set today's date as default
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
    
    // Load saved name from localStorage
    const savedName = localStorage.getItem('myWorkoutTrackerName');
    const nameInput = document.getElementById('name');
    if (savedName && nameInput) {
        nameInput.value = savedName;
    }
    
    // Add first exercise by default
    addExercise();
    
    // Setup event listeners
    document.getElementById('addExerciseBtn').addEventListener('click', addExercise);
    document.getElementById('workoutForm').addEventListener('submit', handleFormSubmit);
    
    // Load exercise database
    loadExerciseDatabase();
}

// ========== EXERCISE MANAGEMENT ==========

// Load exercise-muscle group mappings from localStorage
function getExerciseMuscleMap() {
    const stored = localStorage.getItem('exerciseMuscleMap');
    return stored ? JSON.parse(stored) : {};
}

// Save exercise-muscle group mapping
function saveExerciseMuscleMapping(exerciseName, muscleGroup) {
    const map = getExerciseMuscleMap();
    map[exerciseName.toLowerCase().trim()] = muscleGroup;
    localStorage.setItem('exerciseMuscleMap', JSON.stringify(map));
}

// Get muscle group for an exercise
function getMuscleGroupForExercise(exerciseName) {
    const map = getExerciseMuscleMap();
    return map[exerciseName.toLowerCase().trim()] || '';
}

// Function to add a new exercise block
function addExercise() {
    exerciseCounter++;
    const exercisesContainer = document.getElementById('exercisesContainer');
    
    const exerciseItem = document.createElement('div');
    exerciseItem.className = 'exercise-item';
    exerciseItem.id = `exercise-${exerciseCounter}`;
    exerciseItem.dataset.exerciseId = exerciseCounter;
    
    exerciseItem.innerHTML = `
        <div class="exercise-header">
            <div>
                <span class="exercise-number">Exercise ${exerciseCounter}</span>
                <button type="button" class="remove-exercise-btn" onclick="removeExercise(${exerciseCounter})">Remove</button>
            </div>
        </div>
        
        <div class="exercise-inputs">
            <label>Exercise Name</label>
            <input type="text" name="exercise-${exerciseCounter}" class="exercise-name-input" list="exercise-list-${exerciseCounter}" required placeholder="e.g., Bench Press, Squats">
            <datalist id="exercise-list-${exerciseCounter}" class="exercise-datalist">
                <!-- Exercise options will be loaded here -->
            </datalist>
            
            <label>Muscle Group</label>
            <select name="muscleGroup-${exerciseCounter}" class="muscle-group-select" required>
                <option value="">Select muscle group</option>
                <option value="Warmup">Warmup</option>
                <option value="Chest">Chest</option>
                <option value="Back">Back</option>
                <option value="Shoulders">Shoulders</option>
                <option value="Biceps">Biceps</option>
                <option value="Triceps">Triceps</option>
                <option value="Legs">Legs</option>
                <option value="Quads">Quads</option>
                <option value="Hamstrings">Hamstrings</option>
                <option value="Glutes">Glutes</option>
                <option value="Calves">Calves</option>
                <option value="Core">Core</option>
                <option value="Abs">Abs</option>
                <option value="Cardio">Cardio</option>
            </select>
            
            <label>Weight Unit</label>
            <select name="weightUnit-${exerciseCounter}" class="weight-unit-select" required>
                <option value="lbs">LBS</option>
                <option value="kg">KG</option>
            </select>
        </div>
        
        <div class="sets-container-wrapper">
            <span class="sets-label">Sets</span>
            <div class="sets-container" id="sets-container-${exerciseCounter}">
                <!-- Sets will be added here -->
            </div>
            <button type="button" class="add-set-btn" onclick="addSet(${exerciseCounter})">+ Add Set</button>
        </div>
    `;
    
    exercisesContainer.appendChild(exerciseItem);
    
    // Add first set automatically
    addSet(exerciseCounter);
    
    // Add event listener for exercise name input to auto-fill muscle group
    const exerciseInput = exerciseItem.querySelector('.exercise-name-input');
    const muscleGroupSelect = exerciseItem.querySelector('.muscle-group-select');
    
    exerciseInput.addEventListener('blur', function() {
        const exerciseName = this.value.trim();
        if (exerciseName) {
            const savedMuscleGroup = getMuscleGroupForExercise(exerciseName);
            if (savedMuscleGroup && !muscleGroupSelect.value) {
                muscleGroupSelect.value = savedMuscleGroup;
            }
        }
    });
    
    // Add event listener for weight unit changes to update all set labels
    const weightUnitSelect = exerciseItem.querySelector('.weight-unit-select');
    weightUnitSelect.addEventListener('change', function() {
        updateWeightLabels(exerciseCounter, this.value);
    });
}

// Function to remove an exercise
window.removeExercise = function(exerciseId) {
    const exerciseItem = document.getElementById(`exercise-${exerciseId}`);
    if (exerciseItem) {
        exerciseItem.remove();
        renumberExercises();
    }
}

// Function to renumber exercises after removal
function renumberExercises() {
    const exerciseItems = document.querySelectorAll('.exercise-item');
    exerciseItems.forEach((item, index) => {
        const exerciseNumber = item.querySelector('.exercise-number');
        exerciseNumber.textContent = `Exercise ${index + 1}`;
    });
}

// ========== SET MANAGEMENT ==========

// Function to add a set to an exercise
window.addSet = function(exerciseId) {
    if (!setCounters[exerciseId]) {
        setCounters[exerciseId] = 0;
    }
    setCounters[exerciseId]++;
    
    const setsContainer = document.getElementById(`sets-container-${exerciseId}`);
    const setId = setCounters[exerciseId];
    
    // Get previous set data if it exists
    let previousWeight = '';
    let previousReps = '';
    let previousDifficulty = '';
    
    if (setCounters[exerciseId] > 1) {
        const previousSetId = setCounters[exerciseId] - 1;
        const previousWeightInput = document.querySelector(`input[name="weight-${exerciseId}-${previousSetId}"]`);
        const previousRepsInput = document.querySelector(`input[name="reps-${exerciseId}-${previousSetId}"]`);
        const previousDifficultySelect = document.querySelector(`select[name="difficulty-${exerciseId}-${previousSetId}"]`);
        
        if (previousWeightInput) previousWeight = previousWeightInput.value;
        if (previousRepsInput) previousReps = previousRepsInput.value;
        if (previousDifficultySelect) previousDifficulty = previousDifficultySelect.value;
    }
    
    // Get weight unit for this exercise
    const exerciseItem = document.getElementById(`exercise-${exerciseId}`);
    const weightUnitSelect = exerciseItem.querySelector('.weight-unit-select');
    const weightUnit = weightUnitSelect ? weightUnitSelect.value : 'lbs';
    
    const setItem = document.createElement('div');
    setItem.className = 'set-item';
    setItem.id = `set-${exerciseId}-${setId}`;
    
    setItem.innerHTML = `
        <div class="set-header">
            <div>
                <span class="set-number">Set ${setId}</span>
                <button type="button" class="remove-set-btn" onclick="removeSet(${exerciseId}, ${setId})">Remove</button>
            </div>
        </div>
        <div class="set-inputs">
            <div class="set-input-group">
                <label>Weight (<span class="weight-unit-label">${weightUnit}</span>)</label>
                <input type="number" name="weight-${exerciseId}-${setId}" step="0.5" min="0" placeholder="135" value="${previousWeight}" required>
            </div>
            <div class="set-input-group">
                <label>Reps</label>
                <input type="number" name="reps-${exerciseId}-${setId}" min="1" placeholder="10" value="${previousReps}" required>
            </div>
            <div class="set-input-group">
                <label>Difficulty</label>
                <select name="difficulty-${exerciseId}-${setId}" required>
                    <option value="">Select</option>
                    <option value="Easy" ${previousDifficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                    <option value="Moderate" ${previousDifficulty === 'Moderate' ? 'selected' : ''}>Moderate</option>
                    <option value="Hard" ${previousDifficulty === 'Hard' ? 'selected' : ''}>Hard</option>
                    <option value="Max Effort" ${previousDifficulty === 'Max Effort' ? 'selected' : ''}>Max Effort</option>
                </select>
            </div>
        </div>
    `;
    
    setsContainer.appendChild(setItem);
}

// Function to remove a set
window.removeSet = function(exerciseId, setId) {
    const setItem = document.getElementById(`set-${exerciseId}-${setId}`);
    if (setItem) {
        setItem.remove();
        renumberSets(exerciseId);
    }
}

// Function to renumber sets after removal
function renumberSets(exerciseId) {
    const setsContainer = document.getElementById(`sets-container-${exerciseId}`);
    const setItems = setsContainer.querySelectorAll('.set-item');
    setItems.forEach((item, index) => {
        const setNumber = item.querySelector('.set-number');
        setNumber.textContent = `Set ${index + 1}`;
    });
}

// Function to update weight labels when unit changes
function updateWeightLabels(exerciseId, unit) {
    const exerciseItem = document.getElementById(`exercise-${exerciseId}`);
    const weightLabels = exerciseItem.querySelectorAll('.weight-unit-label');
    weightLabels.forEach(label => {
        label.textContent = unit;
    });
}

// ========== EXERCISE DATABASE ==========

async function loadExerciseDatabase() {
    try {
        // Try to load from API
        const response = await offlineManager.apiCall('getExerciseDatabase');
        if (response.exercises) {
            await offlineManager.cacheExercises(response.exercises);
            populateExerciseLists(response.exercises);
        }
    } catch (error) {
        console.log('[Exercise DB] Loading from cache (offline)');
        // Load from cache if offline
        const cached = await offlineManager.getCachedExercises();
        if (cached.length > 0) {
            populateExerciseLists(cached);
        }
    }
}

function populateExerciseLists(exercises) {
    const datalists = document.querySelectorAll('.exercise-datalist');
    datalists.forEach(datalist => {
        datalist.innerHTML = exercises.map(ex => `<option value="${ex}">`).join('');
    });
}

// ========== FORM SUBMISSION ==========

async function handleFormSubmit(e) {
    e.preventDefault();
    
    // Collect basic form data
    const formData = {
        name: document.getElementById('name').value,
        date: document.getElementById('date').value,
        workoutGroup: document.getElementById('workoutGroup').value,
        notes: document.getElementById('notes').value,
        exercises: [],
        timestamp: new Date().toISOString()
    };
    
    // Collect all exercises data
    const exerciseItems = document.querySelectorAll('.exercise-item');
    exerciseItems.forEach((exerciseItem) => {
        const exerciseId = exerciseItem.dataset.exerciseId;
        const muscleGroup = exerciseItem.querySelector('.muscle-group-select').value;
        const exerciseName = exerciseItem.querySelector('.exercise-name-input').value;
        const weightUnit = exerciseItem.querySelector('.weight-unit-select').value;
        
        // Save the exercise-muscle mapping for future auto-fill
        saveExerciseMuscleMapping(exerciseName, muscleGroup);
        
        const exerciseData = {
            muscleGroup: muscleGroup,
            exerciseName: exerciseName,
            weightUnit: weightUnit,
            sets: []
        };
        
        // Collect all sets for this exercise
        const setItems = exerciseItem.querySelectorAll('.set-item');
        setItems.forEach((setItem) => {
            const inputs = setItem.querySelectorAll('input, select');
            const setData = {};
            
            inputs.forEach(input => {
                const nameParts = input.name.split('-');
                const fieldName = nameParts[0]; // 'weight', 'reps', or 'difficulty'
                setData[fieldName] = input.value;
            });
            
            exerciseData.sets.push(setData);
        });
        
        formData.exercises.push(exerciseData);
    });
    
    // Save name to localStorage
    localStorage.setItem('myWorkoutTrackerName', formData.name);
    
    // Show loading state
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Logging...';
    submitBtn.disabled = true;
    document.querySelector('.container').classList.add('loading');
    
    // Hide any previous messages
    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
    
    try {
        // Save workout (handles online/offline)
        const result = await offlineManager.saveWorkout(formData);
        
        // Show success message
        const successMsg = document.getElementById('successMessage');
        if (result.synced) {
            successMsg.textContent = 'Workout logged successfully! 🎉';
        } else {
            successMsg.textContent = 'Workout saved offline! Will sync when online 📱';
        }
        successMsg.style.display = 'block';
        
        // Reset form (except name and date)
        document.getElementById('workoutGroup').value = '';
        document.getElementById('notes').value = '';
        
        // Reset exercises
        document.getElementById('exercisesContainer').innerHTML = '';
        exerciseCounter = 0;
        setCounters = {};
        addExercise();
        
        // Hide success message after 3 seconds
        setTimeout(() => {
            successMsg.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('[Submit] Error:', error);
        document.getElementById('errorMessage').textContent = 'Error: ' + error.message;
        document.getElementById('errorMessage').style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('errorMessage').style.display = 'none';
        }, 5000);
    } finally {
        // Reset button
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        document.querySelector('.container').classList.remove('loading');
    }
}

// ========== PWA INSTALL PROMPT ==========

let deferredPrompt = null;

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show custom install prompt after 30 seconds
        setTimeout(() => {
            showInstallPrompt();
        }, 30000);
    });
    
    // Setup install button
    document.getElementById('installBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log('[PWA] Install outcome:', outcome);
            deferredPrompt = null;
            hideInstallPrompt();
        }
    });
    
    // Setup dismiss button
    document.getElementById('dismissBtn').addEventListener('click', () => {
        hideInstallPrompt();
    });
}

function showInstallPrompt() {
    const prompt = document.getElementById('installPrompt');
    if (prompt && deferredPrompt) {
        prompt.classList.add('show');
    }
}

function hideInstallPrompt() {
    const prompt = document.getElementById('installPrompt');
    if (prompt) {
        prompt.classList.remove('show');
    }
}
