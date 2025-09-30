// Updated verification flow: single step per page, time-limited (3 hours), reset when target changes.
const AD_SCRIPT = "//pl27626803.revenuecpmgate.com/24/e4/33/24e43300238cf9b86a05c918e6b00561.js";
const SOCIAL_BAR_SCRIPT = "//pl27654958.revenuecpmgate.com/cb/63/19/cb6319838ced4608354b54fc6faddb8a.js";
const DEFAULT_REQUIRED_STEPS = 3;
const VERIFICATION_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const STORAGE_PREFIX = "dareloom_verify_v2_"; // per-target storage

// Elements
const E = {
  longUrlInput: document.getElementById('longUrlInput'),
  shortenBtn: document.getElementById('shortenBtn'),
  resultContainer: document.getElementById('resultContainer'),
  shortUrlOutput: document.getElementById('shortUrlOutput'),
  copyBtn: document.getElementById('copyBtn'),
  stepTitle: document.getElementById('stepTitle'),
  stepDesc: document.getElementById('stepDesc'),
  verifyBtn: document.getElementById('verifyBtn'),
  continueBtn: document.getElementById('continueBtn'),
  progressBarFill: document.getElementById('fill'),
  statusText: document.getElementById('status'),
  unlockBtn: document.getElementById('unlock-btn'),
  resetBtn: document.getElementById('reset-btn'),
  requiredStepsLabel: document.getElementById('requiredStepsLabel')
};

function encodeKey(target){
  return STORAGE_PREFIX + btoa(target);
}

function getRequiredSteps() {
  try {
    const url = new URL(window.location.href);
    const stepsParam = parseInt(url.searchParams.get('steps'), 10);
    if (Number.isInteger(stepsParam) && stepsParam >= 1 && stepsParam <= 10) return stepsParam;
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
    return {count: Number(obj.count||0), startedAt: Number(obj.startedAt||0)};
  }catch(e){ return {count:0, startedAt:0}; }
}

function writeState(target, state){
  if(!target) return;
  const toStore = {count: Number(state.count||0), startedAt: Number(state.startedAt||0)};
  localStorage.setItem(encodeKey(target), JSON.stringify(toStore));
}

function resetState(target){
  if(!target) return;
  localStorage.removeItem(encodeKey(target));
  updateUI();
}

function isExpired(state){
  if(!state || !state.startedAt) return true;
  return (Date.now() - state.startedAt) > VERIFICATION_TTL_MS;
}

// Shortener
function shortenLink(){
  const longUrl = E.longUrlInput.value.trim();
  if(!longUrl) { alert('Please enter a URL'); return; }
  let normalized = longUrl;
  if(!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
  try{
    new URL(normalized);
  }catch(e){ alert('Invalid URL'); return; }
  const encodedTarget = encodeURIComponent(normalized);
  const base = window.location.origin + window.location.pathname;
  const shortUrl = `${base}?target=${encodedTarget}`;
  E.shortUrlOutput.value = shortUrl;
  E.resultContainer.style.display = 'flex';
  E.longUrlInput.value = '';
  // store the target in a friendly place too (optional)
  localStorage.setItem('dareloom_target', normalized);
}

function copyLink(){
  E.shortUrlOutput.select();
  document.execCommand('copy');
  E.copyBtn.textContent = 'Copied! ✓';
  setTimeout(()=>E.copyBtn.textContent='Copy Link', 2000);
}

// UI updates for progress
function updateUI(){
  const target = getTargetFromURL();
  const req = getRequiredSteps();
  E.requiredStepsLabel.textContent = req;
  const state = target ? readState(target) : {count:0, startedAt:0};
  // if expired, reset state
  if(target && isExpired(state)){
    writeState(target, {count:0, startedAt:0});
  }
  const count = (target ? readState(target).count : 0);
  const pct = Math.min(100, Math.round((count / req) * 100));
  E.progressBarFill.style.width = pct + '%';
  E.statusText.textContent = `${count} / ${req} completed`;
  // unlock button visibility
  const unlocked = count >= req;
  E.unlockBtn.disabled = !unlocked;
  E.unlockBtn.style.display = unlocked ? 'inline-block' : 'none';
}

// inject ad script and increment for current target
function injectAdAndCountFor(target){
  if(!target) return false;
  // open blank popup to improve popunder chance (may be blocked)
  let popup = null;
  try{ popup = window.open('about:blank', '_blank'); }catch(e){ popup = null; }
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.src = AD_SCRIPT;
  s.async = true;
  document.body.appendChild(s);
  // update state
  const state = readState(target);
  const req = getRequiredSteps();
  if(!state.startedAt) state.startedAt = Date.now();
  if(state.count < req){
    state.count++;
    writeState(target, state);
  }
  // close popup if possible
  if(popup && !popup.closed){
    try{ popup.close(); }catch(e){}
  }
  updateUI();
  return true;
}

// get current step index from URL (1-based)
function getCurrentStepIndex(){
  try{
    const url = new URL(window.location.href);
    const s = parseInt(url.searchParams.get('step'), 10);
    return (Number.isInteger(s) && s >= 1) ? s : 1;
  }catch(e){ return 1; }
}

function navigateToStep(step){
  const url = new URL(window.location.href);
  url.searchParams.set('step', String(step));
  window.location.href = url.toString();
}

// Unlock (open target)
function unlockLinkFor(target){
  if(!target) { alert('No target specified'); return; }
  const opened = window.open(target, '_blank', 'noopener,noreferrer');
  if(!opened) window.location.href = target;
}

// Initialization
document.addEventListener('DOMContentLoaded', ()=>{
  // Attach shortener events
  if(E.shortenBtn) E.shortenBtn.addEventListener('click', shortenLink);
  if(E.copyBtn) E.copyBtn.addEventListener('click', copyLink);

  const urlObj = new URL(window.location.href);
  const target = getTargetFromURL();
  const req = getRequiredSteps();
  const currentStep = getCurrentStepIndex();
  E.requiredStepsLabel.textContent = req;

  // If no target in URL, show normal shortener page; show verification card but disabled
  if(!target){
    // nothing more to do
    updateUI();
    return;
  }

  // When target changes (different encoded URL), we operate per-target via storage key so progress doesn't carry over.
  // If the stored verification is expired, reset it.
  const state = readState(target);
  if(isExpired(state)){
    writeState(target, {count:0, startedAt:0});
  }

  updateUI();

  // Setup social bar script only on verification pages
  const socialScript = document.createElement('script');
  socialScript.type = 'text/javascript';
  socialScript.src = SOCIAL_BAR_SCRIPT;
  socialScript.async = true;
  document.body.appendChild(socialScript);

  // Prepare single-step UI
  const totalSteps = req;
  const stepLabel = `Step ${currentStep}`;
  if(document.getElementById('stepTitle')) document.getElementById('stepTitle').textContent = stepLabel;
  if(document.getElementById('stepDesc')) document.getElementById('stepDesc').textContent = `Complete verification for ${stepLabel}. Click Verify to proceed.`;

  // Show/Hide buttons based on state and step
  const curState = readState(target);
  const count = curState.count;
  const alreadyDoneSteps = Math.min(count, totalSteps);

  // If we've already completed this step (i.e., count >= currentStep), show Continue immediately (unless last)
  const verifyBtn = document.getElementById('verifyBtn');
  const continueBtn = document.getElementById('continueBtn');
  const unlockBtn = document.getElementById('unlock-btn');
  const resetBtn = document.getElementById('reset-btn');

  function showContinueWithDelay(){
    continueBtn.style.display = 'inline-block';
    continueBtn.disabled = true;
    let timer = 10;
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

  // If this step already completed
  if(alreadyDoneSteps >= currentStep){
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Done ✓';
    // if not last step, show continue (enabled after 10s)
    if(currentStep < totalSteps){
      showContinueWithDelay();
    } else {
      // last step done -> show unlock
      unlockBtn.style.display = 'inline-block';
      unlockBtn.disabled = false;
    }
  } else {
    // Not completed: show verify button, hide continue
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify';
    continueBtn.style.display = 'none';
  }

  // Verify button action
  verifyBtn.addEventListener('click', ()=>{
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    // perform ad injection + count
    const ok = injectAdAndCountFor(target);
    if(ok){
      // after injection, show continue with delay (or unlock if last)
      if(currentStep < totalSteps){
        showContinueWithDelay();
      } else {
        // last step completed -> show unlock button
        unlockBtn.style.display = 'inline-block';
        unlockBtn.disabled = false;
      }
    } else {
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
      // If somehow next > totalSteps, just refresh UI
      updateUI();
    }
  });

  // Unlock button opens link (final)
  unlockBtn.addEventListener('click', ()=>{
    const finalState = readState(target);
    if(finalState.count >= totalSteps){
      unlockLinkFor(target);
    } else {
      alert('You have not completed all verification steps.');
    }
  });

  // Reset button clears verification for this target
  resetBtn.addEventListener('click', ()=>{
    if(confirm('Reset verification progress for this short URL?')){
      resetState(target);
      // reload to reflect reset (will show verify again)
      location.reload();
    }
  });

  // Update UI once more
  updateUI();
});