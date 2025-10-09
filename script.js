// Updated verification flow: single step per page, time-limited (1 hour), reset when target changes.
const AD_SCRIPT = "//pl27626803.revenuecpmgate.com/24/e4/33/24e43300238cf9b86a05c918e6b00561.js";
const SOCIAL_BAR_SCRIPT = "//pl27654958.revenuecpmgate.com/cb/63/19/cb6319838ced4608354b54fc6faddb8a.js";
const DEFAULT_REQUIRED_STEPS = 1; // Changed to 1 since HTML suggests single-step click
const VERIFICATION_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour 
const STORAGE_PREFIX = "dareloom_verify_v2_"; // per-target storage

// Elements
const E = {
  // Shortener Elements
  shortenerContainer: document.getElementById('shortener-container'),
  longUrlInput: document.getElementById('longUrlInput'),
  shortenBtn: document.getElementById('shortenBtn'),
  resultContainer: document.getElementById('resultContainer'),
  shortUrlOutput: document.getElementById('shortUrlOutput'),
  copyBtn: document.getElementById('copyBtn'),
  
  // Verification Elements
  verificationUI: document.querySelector('#verification-ui'), // Corrected selector for ID
  verifyBar: document.getElementById('floating-verify-bar'),
  unlockBtn: document.getElementById('unlock-btn'), // Corrected to 'unlock-btn' based on HTML ID
  
  // Simple HTML Timer/Instruction elements
  timerText: document.getElementById('timer-text'),
  timerCount: document.getElementById('timer-count'),
  instructionStep1: document.getElementById('instruction-step-1'),
  instructionStep2: document.getElementById('instruction-step-2'),
  adSpace1: document.getElementById('ad-space-1'),
  targetLinkDisplay: document.getElementById('target-link-display') // Added to show target link
};

/* --- Storage and State Management --- */

function encodeKey(target){
  return STORAGE_PREFIX + btoa(target);
}

function getRequiredSteps() {
  try {
    const url = new URL(window.location.href);
    const stepsParam = parseInt(url.searchParams.get('steps'), 10);
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

function readState(target){
  if(!target) return {count:0, startedAt:0};
  try{
    const raw = localStorage.getItem(encodeKey(target));
    if(!raw) return {count:0, startedAt:0};
    const obj = JSON.parse(raw);
    const state = {count: Number(obj.count||0), startedAt: Number(obj.startedAt||0)};
    
    if (isExpired(state)) {
        resetState(target, false); 
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
  const steps = DEFAULT_REQUIRED_STEPS; 
  const shortUrl = `${base}?target=${encodedTarget}&steps=${steps}`;
  
  E.shortUrlOutput.value = shortUrl;
  E.resultContainer.style.display = 'flex';
}

function copyLink(){
  E.shortUrlOutput.select();
  E.shortUrlOutput.setSelectionRange(0, 99999); 
  // document.execCommand('copy'); // Deprecated, using modern API
  navigator.clipboard.writeText(E.shortUrlOutput.value).then(() => {
    E.copyBtn.textContent = 'Copied! ✅';
    setTimeout(()=>E.copyBtn.textContent='Copy Link', 2000);
  }).catch(err => {
    console.error('Could not copy text: ', err);
    alert('Failed to copy link. Please copy it manually.');
  });
}

/* --- Verification UI and Logic --- */

function updateUI(){
  const target = getTargetFromURL();
  
  // Show Shortener or Verification UI
  if(!target) {
    if(E.shortenerContainer) E.shortenerContainer.style.display = 'block';
    if(E.verificationUI) E.verificationUI.style.display = 'none';
    return;
  }

  // Show Verification UI
  if(E.shortenerContainer) E.shortenerContainer.style.display = 'none';
  if(E.verificationUI) E.verificationUI.style.display = 'block';

  // Display the target link for user visibility (debug info)
  if(E.targetLinkDisplay) E.targetLinkDisplay.textContent = target.length > 50 ? target.substring(0, 47) + '...' : target;

  const req = getRequiredSteps();
  const state = readState(target); 
  const count = state.count;
  const unlocked = count >= req;
  
  // Control Visibility of Floating Bar and Unlock Button
  if (unlocked) {
      if(E.verifyBar) E.verifyBar.style.display = 'none';
      if(E.unlockBtn) {
        E.unlockBtn.style.display = 'inline-block';
        E.unlockBtn.classList.add('ready'); // Add neon pulsing class
        E.unlockBtn.textContent = 'GET YOUR LINK NOW!';
      }
      if(E.instructionStep2) E.instructionStep2.style.display = 'block';
  } else {
      if(E.verifyBar) E.verifyBar.style.display = 'block';
      if(E.unlockBtn) {
        E.unlockBtn.style.display = 'none';
        E.unlockBtn.classList.remove('ready');
        E.unlockBtn.textContent = 'Get Your Link'; // Reset text
      }
      if(E.instructionStep2) E.instructionStep2.style.display = 'none';
  }
}

// Inject ad script and increment count for current target
function injectAdAndCountFor(target){
  if(!target) return false;
  
  // 1. Open blank popup
  let popup = null;
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
  if(!state.startedAt) state.startedAt = Date.now(); 
  
  if(state.count < req){
    state.count++;
    writeState(target, state);
  }
  
  // 4. Close popup 
  if(popup && !popup.closed){
    try{ setTimeout(() => popup.close(), 100); }catch(e){} 
  }
  
  return true;
}

// Unlock (open target)
function unlockLinkFor(target){
  if(!target) { alert('No target specified for unlock'); return; }
  
  if(E.unlockBtn){
      E.unlockBtn.textContent = 'Redirecting...';
      E.unlockBtn.disabled = true;
  }

  const opened = window.open(target, '_blank', 'noopener,noreferrer');
  
  if(!opened){
    // If popup is blocked, redirect the main window
    window.location.href = target;
  } else {
      // If successful, reset state and close the current tab (optional, but good practice)
      resetState(getTargetFromURL(), false); 
      // window.close(); // You might want to remove this if you want the user to stay on your site
  }
}

/* --- Initialization --- */

document.addEventListener('DOMContentLoaded', ()=>{
  const target = getTargetFromURL();
  const req = getRequiredSteps();

  // Attach shortener events
  if(E.shortenBtn) E.shortenBtn.addEventListener('click', shortenLink);
  if(E.copyBtn) E.copyBtn.addEventListener('click', copyLink);

  // Initial UI update: decides if shortener or verification UI is shown
  updateUI(); 

  // --- Verification View Setup ---
  if(target){
      // Setup social bar script for verification pages
      const socialScript = document.createElement('script');
      socialScript.type = 'text/javascript';
      socialScript.src = SOCIAL_BAR_SCRIPT;
      socialScript.async = true;
      document.body.appendChild(socialScript);

      const curState = readState(target);
      const unlocked = curState.count >= req;
      
      // Verification (Floating Bar) Button Logic
      if(E.verifyBar && !unlocked){
          E.verifyBar.addEventListener('click', ()=>{
              
              // 1. Show Instructions/Ads
              if(E.instructionStep1) E.instructionStep1.style.display = 'block';
              if(E.adSpace1) E.adSpace1.style.display = 'block';

              // 2. Inject Ad/Count (Core action)
              const ok = injectAdAndCountFor(target);
              
              if(ok){
                  E.verifyBar.textContent = 'Verification in Progress... Please Wait!';
                  E.verifyBar.style.backgroundColor = '#f39c12';
                  
                  // 3. Start Timer
                  const DELAY_SECONDS = 7;
                  if(E.timerText) E.timerText.style.display = 'block';
                  let timer = DELAY_SECONDS;
                  
                  const id = setInterval(()=>{
                      timer--;
                      if(E.timerCount) E.timerCount.textContent = timer;
                      
                      if(timer <= 0){
                          clearInterval(id);
                          // 4. Final UI Update after timer
                          updateUI(); // This will hide the bar and show the unlock button
                      }
                  }, 1000);
              } else {
                  alert('Verification failed. Please try again.');
                  E.verifyBar.textContent = '✅ I am not a Robot, Click Here to Proceed (Essential Step)';
              }
          });
      }

      // Unlock button opens link
      if(E.unlockBtn){
          E.unlockBtn.addEventListener('click', ()=>{
              const finalState = readState(target);
              if(finalState.count >= req){
                  unlockLinkFor(target);
              } else {
                  alert('You have not completed the essential step. Please click the bar above.');
              }
          });
      }
  }
});
                                
