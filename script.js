// Updated verification flow: single step per page, time-limited (1 hour), reset when target changes.
const AD_SCRIPT = "//pl27626803.revenuecpmgate.com/24/e4/33/24e43300238cf9b86a05c918e6b00561.js";
const SOCIAL_BAR_SCRIPT = "//pl27654958.revenuecpmgate.com/cb/63/19/cb6319838ced4608354b54fc6faddb8a.js";
const DEFAULT_REQUIRED_STEPS = 3;
// --- CHANGE: 1 hour (1 * 60 * 60 * 1000) ---
const VERIFICATION_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour 
const STORAGE_PREFIX = "dareloom_verify_v2_"; // per-target storage

// --- ADDED FOR BETTER CTR/CPL CONVERSION ---
const STEP_DESCRIPTIONS = [
    "Step 1: Click 'Verify' to load the content gate and view the sponsor's message for a few seconds.",
    "Step 2: Complete the quick security check presented in the new window to proceed.",
    "Step 3: One final validation! Click 'Verify' to confirm access and prepare to unlock the link."
];
// ------------------------------------------

// Elements
const E = {
  longUrlInput: document.getElementById('longUrlInput'),
  shortenBtn: document.getElementById('shortenBtn'),
  resultContainer: document.getElementById('resultContainer'),
  shortUrlOutput: document.getElementById('shortUrlOutput'),
  copyBtn: document.getElementById('copyBtn'),
  // Verification Elements
  stepTitle: document.getElementById('stepTitle'),
  stepDesc: document.getElementById('stepDesc'),
  currentStepNum: document.getElementById('currentStepNum'),
  verifyBtn: document.getElementById('verifyBtn'),
  continueBtn: document.getElementById('continueBtn'),
  progressBarFill: document.getElementById('fill'),
  progressBarContainer: document.getElementById('progressBarContainer'),
  statusText: document.getElementById('status'),
  completedCount: document.getElementById('completedCount'),
  unlockBtn: document.getElementById('unlock-btn'),
  resetBtn: document.getElementById('reset-btn'),
  requiredStepsLabel: document.getElementById('requiredStepsLabel')
};

/* --- Storage and State Management --- */

function encodeKey(target){
  return STORAGE_PREFIX + btoa(target);
}

function getRequiredSteps() {
  try {
    const url = new URL(window.location.href);
    const stepsParam = parseInt(url.searchParams.get('steps'), 10);
    // Enforce reasonable limits for steps
    if (Number.isInteger(stepsParam) && stepsParam >= 1 && stepsParam <= 5) return stepsParam;
  } catch(e) {}
  return DEFAULT_REQUIRED_STEPS;
}

function getTargetFromURL(){
  try{
    const url = new URL(window.location.href);
    const t = url.searchParams.get('target');
    if(!t) return null;
    return decodeURIComponent(t);
  }catch(e){ return null; }
}

// read per-target state: {count, startedAt}
function readState(target){
  if(!target) return {count:0, startedAt:0};
  try{
    const raw = localStorage.getItem(encodeKey(target));
    if(!raw) return {count:0, startedAt:0};
    const obj = JSON.parse(raw);
    const state = {count: Number(obj.count||0), startedAt: Number(obj.startedAt||0)};
    
    // Check for expiration immediately on read
    if (isExpired(state)) {
        // --- UPDATED: Removed alert to keep UX smooth (reset is silent) ---
        // if(state.count > 0){
        //     alert("Verification time expired! Progress has been reset (1 hour limit). Please start from Step 1.");
        // }
        resetState(target, false); // Reset in storage but don't force UI update yet
        return {count:0, startedAt:0};
    }
    return state;
  }catch(e){ return {count:0, startedAt:0}; }
}

function writeState(target, state){
  if(!target) return;
  const toStore = {count: Number(state.count||0), startedAt: Number(state.startedAt||0)};
  localStorage.setItem(encodeKey(target), JSON.stringify(toStore));
}

function resetState(target, update = true){
  if(!target) return;
  localStorage.removeItem(encodeKey(target));
  if(update) updateUI();
}

function isExpired(state){
  if(!state || !state.startedAt) return true;
  return (Date.now() - state.startedAt) > VERIFICATION_TTL_MS;
}

/* --- Link Shortener --- */

function shortenLink(){
  const longUrl = E.longUrlInput.value.trim();
  if(!longUrl) { alert('Please enter a valid URL'); return; }
  let normalized = longUrl;
  if(!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
  try{
    new URL(normalized);
  }catch(e){ alert('Invalid URL format'); return; }
  
  const encodedTarget = encodeURIComponent(normalized);
  const base = window.location.origin + window.location.pathname;
  // Always include steps=N for clarity, and start at step=1
  const steps = getRequiredSteps();
  const shortUrl = `${base}?target=${encodedTarget}&steps=${steps}&step=1`;
  
  E.shortUrlOutput.value = shortUrl;
  E.resultContainer.style.display = 'flex';
  E.longUrlInput.value = '';
}

function copyLink(){
  E.shortUrlOutput.select();
  E.shortUrlOutput.setSelectionRange(0, 99999); // For mobile devices
  document.execCommand('copy');
  E.copyBtn.textContent = 'Copied! ✅';
  setTimeout(()=>E.copyBtn.textContent='Copy Link', 2000);
}

/* --- Verification UI and Logic --- */

function updateUI(){
  const target = getTargetFromURL();
  const req = getRequiredSteps();
  E.requiredStepsLabel.textContent = req;
  
  // State is read and expiration check is performed
  const state = readState(target); 
  const count = state.count;

  // Update Progress Bar
  const pct = Math.min(100, Math.round((count / req) * 100));
  E.progressBarFill.style.width = pct + '%';
  E.progressBarContainer.setAttribute('aria-valuenow', count);
  E.completedCount.textContent = count;
  E.statusText.textContent = `${count} / ${req} steps completed`;
  
  // Unlock button visibility
  const unlocked = count >= req;
  E.unlockBtn.disabled = !unlocked;
  // Add a class for better styling
  if(unlocked) {
      E.unlockBtn.classList.add('ready');
      E.unlockBtn.style.display = 'inline-block';
  } else {
      E.unlockBtn.classList.remove('ready');
      E.unlockBtn.style.display = 'none';
  }
}

// Inject ad script and increment count for current target
function injectAdAndCountFor(target){
  if(!target) return false;
  
  // 1. Open blank popup to improve popunder chance (may be blocked by browser)
  let popup = null;
  // Opening the popup here ensures that the ad script uses the new tab/window for redirection.
  try{ popup = window.open('about:blank', '_blank', 'noopener'); }catch(e){ popup = null; }
  
  // 2. Inject Ad Script
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.src = AD_SCRIPT;
  s.async = true;
  document.body.appendChild(s);
  
  // 3. Update State
  const state = readState(target);
  const req = getRequiredSteps();
  if(!state.startedAt) state.startedAt = Date.now(); // Start timer on first verification attempt
  
  if(state.count < req){
    state.count++;
    writeState(target, state);
  }
  
  // 4. Close popup (The ad script usually redirects this blank page) - Best to keep this if the ad network expects it
  if(popup && !popup.closed){
    // We try to close it, allowing the ad script injected by the popunder to take over the 'about:blank' page.
    try{ setTimeout(() => popup.close(), 100); }catch(e){} // Added a slight delay for safety
  }
  
  updateUI();
  return true;
}

// Get current step index from URL (1-based)
function getCurrentStepIndex(){
  try{
    const url = new URL(window.location.href);
    const s = parseInt(url.searchParams.get('step'), 10);
    // Ensure step is within valid range (1 to required steps)
    const req = getRequiredSteps();
    return (Number.isInteger(s) && s >= 1 && s <= req) ? s : 1;
  }catch(e){ return 1; }
}

function navigateToStep(step){
  const url = new URL(window.location.href);
  url.searchParams.set('step', String(step));
  window.location.href = url.toString();
}

// Unlock (open target)
function unlockLinkFor(target){
  if(!target) { alert('No target specified for unlock'); return; }
  
  // Add a quick visual indicator that the link is opening
  E.unlockBtn.textContent = 'Redirecting...';
  E.unlockBtn.disabled = true;

  // Open the link in a new tab for a better UX
  const opened = window.open(target, '_blank', 'noopener,noreferrer');
  
  if(!opened){
    // Fallback if browser blocked the popup (rare for a user-initiated click)
    window.location.href = target;
  } else {
      // Once opened, reset the verification progress to prevent link sharing
      resetState(getTargetFromURL(), false); 
  }
}

/* --- Initialization --- */

document.addEventListener('DOMContentLoaded', ()=>{
  // Attach shortener events
  if(E.shortenBtn) E.shortenBtn.addEventListener('click', shortenLink);
  if(E.copyBtn) E.copyBtn.addEventListener('click', copyLink);

  const target = getTargetFromURL();
  const req = getRequiredSteps();
  const currentStep = getCurrentStepIndex();

  // Shortener-only view
  if(!target){
    updateUI();
    return;
  }
  
  // Verification view setup
  
  updateUI(); // Initial UI update based on stored state

  // Setup social bar script for verification pages (for impressions/clicks)
  const socialScript = document.createElement('script');
  socialScript.type = 'text/javascript';
  socialScript.src = SOCIAL_BAR_SCRIPT;
  socialScript.async = true;
  document.body.appendChild(socialScript);

  // Prepare single-step UI
  const totalSteps = req;
  const stepLabel = `Step ${currentStep}`;
  if(E.stepTitle) E.stepTitle.textContent = stepLabel;
  if(E.currentStepNum) E.currentStepNum.textContent = currentStep;
  
  // --- UPDATED: Use descriptive text for better engagement (CPL/CTR) ---
  const customDesc = STEP_DESCRIPTIONS[currentStep - 1] || `You must complete the task for ${stepLabel} to continue.`;
  if(E.stepDesc) E.stepDesc.textContent = customDesc;

  // Get current state
  const curState = readState(target);
  const count = curState.count;
  const alreadyDoneSteps = Math.min(count, totalSteps);

  // Verification button logic
  const verifyBtn = E.verifyBtn;
  const continueBtn = E.continueBtn;
  const unlockBtn = E.unlockBtn;
  const resetBtn = E.resetBtn;
  
  const DELAY_SECONDS = 10;

  function showContinueWithDelay(){
    verifyBtn.style.display = 'none';
    continueBtn.style.display = 'inline-block';
    continueBtn.disabled = true;
    let timer = DELAY_SECONDS;
    continueBtn.textContent = `Continue (${timer}s)`;
    const id = setInterval(()=>{
      timer--;
      continueBtn.textContent = timer>0 ? `Continue (${timer}s)` : 'Continue';
      if(timer<=0){
        continueBtn.disabled = false;
        clearInterval(id);
      }
    }, 1000);
  }

  // Check if current step is already completed
  if(alreadyDoneSteps >= currentStep){
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Completed ✅';
    verifyBtn.classList.add('completed'); // Add class for styling

    // If not the last step, show continue (enabled after delay)
    if(currentStep < totalSteps){
      showContinueWithDelay();
    } else {
      // Last step done -> enable unlock
      unlockBtn.style.display = 'inline-block';
      unlockBtn.disabled = false;
      unlockBtn.classList.add('ready');
    }
  } else {
    // Not completed: show verify button, hide continue
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify';
    continueBtn.style.display = 'none';
    verifyBtn.classList.remove('completed');
  }

  // Event Listeners for Verification
  
  // Verify button action
  verifyBtn.addEventListener('click', ()=>{
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Loading Gate...';
    
    // Perform ad injection + count
    const ok = injectAdAndCountFor(target);
    if(ok){
      verifyBtn.textContent = 'Completed ✅';
      verifyBtn.classList.add('completed');
      
      // After injection, show continue with delay (or unlock if last)
      if(currentStep < totalSteps){
        showContinueWithDelay();
      } else {
        // Last step completed -> show unlock button
        unlockBtn.style.display = 'inline-block';
        unlockBtn.disabled = false;
        unlockBtn.classList.add('ready');
      }
    } else {
      // Show failure message if injectAdAndCountFor returns false
      alert('Verification failed. Please try again.');
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify';
    }
  });

  // Continue button moves to next step when clicked
  continueBtn.addEventListener('click', ()=>{
    const next = currentStep + 1;
    if(next <= totalSteps){
      navigateToStep(next);
    } else {
      // If somehow next > totalSteps, navigate to final step URL without step param
      const url = new URL(window.location.href);
      url.searchParams.delete('step');
      window.location.href = url.toString();
    }
  });

  // Unlock button opens link (final)
  unlockBtn.addEventListener('click', ()=>{
    const finalState = readState(target);
    if(finalState.count >= totalSteps){
      unlockLinkFor(target);
    } else {
      alert('You have not completed all verification steps. Please complete the remaining steps.');
    }
  });

  // Reset button clears verification for this target
  resetBtn.addEventListener('click', ()=>{
    if(confirm('Are you sure you want to reset all verification progress for this link?')){
      resetState(target);
      // Navigate back to step 1
      navigateToStep(1);
    }
  });
});
    
