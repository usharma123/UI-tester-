// AXIOM UI QA Laboratory - Frontend Application

// DOM Elements
const urlForm = document.getElementById("url-form");
const urlInput = document.getElementById("url-input");
const goalsInput = document.getElementById("goals-input");
const submitBtn = document.getElementById("submit-btn");
const btnText = submitBtn.querySelector(".btn-text");
const btnLoading = submitBtn.querySelector(".btn-loading");

const progressSection = document.getElementById("progress-section");
const resultsSection = document.getElementById("results-section");
const errorSection = document.getElementById("error-section");

const logContainer = document.getElementById("log-container");
const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");

// Modal elements
const modal = document.getElementById("screenshot-modal");
const modalImage = document.getElementById("modal-image");
const modalLabel = document.getElementById("modal-label");

// Progress elements
const progressTimer = document.getElementById("progress-timer");
const stepFill = document.getElementById("step-fill");

// State
let currentRunId = null;
let eventSource = null;
let screenshots = [];
let timerInterval = null;
let startTime = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  setupEventListeners();
});

function setupEventListeners() {
  // Form submission
  urlForm.addEventListener("submit", handleSubmit);

  // Retry button
  document.getElementById("retry-btn").addEventListener("click", () => {
    hideError();
    resetForm();
  });

  // Modal close
  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.querySelector(".modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// Timer functions
function startTimer() {
  startTime = Date.now();
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer() {
  if (!startTime) return;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const seconds = (elapsed % 60).toString().padStart(2, "0");
  progressTimer.textContent = `${minutes}:${seconds}`;
}

// Form submission
async function handleSubmit(e) {
  e.preventDefault();

  let url = urlInput.value.trim();

  if (!url) return;

  // Auto-add https:// if missing
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  try {
    // Validate URL
    new URL(url);
  } catch {
    showNotification("Please enter a valid URL", "error");
    return;
  }

  const goals = goalsInput.value.trim();

  // Reset UI
  resetUI();
  setLoading(true);
  showProgress();
  startTimer();

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, goals }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to start test");
    }

    const { runId } = await response.json();
    currentRunId = runId;

    // Connect to SSE stream
    connectSSE(runId);

    // Add to history
    addToHistory({ _id: runId, url, goals, status: "running", startedAt: Date.now() });
  } catch (error) {
    setLoading(false);
    stopTimer();
    showError(error.message);
  }
}

// SSE Connection
let sseRetryCount = 0;
const MAX_SSE_RETRIES = 3;

function connectSSE(runId) {
  if (eventSource) {
    eventSource.close();
  }

  sseRetryCount = 0;
  
  function connect() {
    eventSource = new EventSource(`/api/run/${runId}/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleSSEEvent(data);
      sseRetryCount = 0; // Reset retry count on successful message
    };

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
      eventSource.close();
      
      // Try to reconnect if we haven't exceeded retry limit
      if (sseRetryCount < MAX_SSE_RETRIES) {
        sseRetryCount++;
        log("warn", `Connection lost. Reconnecting... (attempt ${sseRetryCount})`);
        setTimeout(() => connect(), 2000 * sseRetryCount);
      } else {
        log("error", "Connection lost. Please refresh to see results.");
        // Start polling as fallback
        startPolling(runId);
      }
    };
  }
  
  connect();
}

// Fallback polling for when SSE fails
let pollingInterval = null;

function startPolling(runId) {
  if (pollingInterval) return;
  
  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/runs/${runId}`);
      if (!response.ok) return;
      
      const run = await response.json();
      
      if (run.status === "completed" && run.report) {
        stopPolling();
        setLoading(false);
        stopTimer();
        hideProgress();
        
        // Populate screenshots from run
        screenshots = (run.screenshots || []).map((s) => ({
          url: s.url,
          label: s.label,
          stepIndex: s.stepIndex,
        }));
        
        showResults(run.report, run.evidence);
        updateHistoryItem(currentRunId, { status: "completed", score: run.report.score });
        log("info", "Results loaded successfully");
      } else if (run.status === "failed") {
        stopPolling();
        setLoading(false);
        stopTimer();
        showError(run.error || "Test failed");
        updateHistoryItem(currentRunId, { status: "failed" });
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, 5000); // Poll every 5 seconds
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

function handleSSEEvent(event) {
  switch (event.type) {
    case "connected":
      log("info", "Connection established");
      break;

    case "phase_start":
      setPhaseActive(event.phase);
      break;

    case "phase_complete":
      setPhaseComplete(event.phase);
      break;

    case "screenshot":
      screenshots.push({ url: event.url, label: event.label, stepIndex: event.stepIndex });
      log("info", `Captured: ${event.label}`);
      break;

    case "sitemap":
      displaySitemap(event.urls, event.source, event.totalPages);
      log("info", `Discovered ${event.totalPages} pages via ${event.source}`);
      break;

    case "plan_created":
      log("info", `Test plan generated: ${event.totalSteps} steps`);
      document.getElementById("step-total").textContent = event.totalSteps;
      document.querySelector(".step-progress").hidden = false;
      break;

    case "step_start":
      const current = event.stepIndex + 1;
      const total = parseInt(document.getElementById("step-total").textContent, 10);
      document.getElementById("step-current").textContent = current;

      // Update progress bar
      if (total > 0) {
        const percent = (current / total) * 100;
        stepFill.style.width = `${percent}%`;
      }

      log("info", `Step ${current}: ${event.step.type}${event.step.note ? ` - ${event.step.note}` : ""}`);
      break;

    case "step_complete":
      if (event.status === "success") {
        log("info", `Step ${event.stepIndex + 1} complete`);
      } else if (event.status === "failed") {
        log("warn", `Step ${event.stepIndex + 1} failed: ${event.error}`);
      } else if (event.status === "blocked") {
        log("error", `Step ${event.stepIndex + 1} blocked: ${event.error}`);
      }
      break;

    case "complete":
      setLoading(false);
      stopTimer();
      stopPolling();
      hideProgress();
      showResults(event.report, event.evidence);
      updateHistoryItem(currentRunId, { status: "completed", score: event.report.score });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      // Refresh history to get latest data
      loadHistory();
      break;

    case "error":
      setLoading(false);
      stopTimer();
      stopPolling();
      showError(event.message);
      updateHistoryItem(currentRunId, { status: "failed" });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      break;

    case "log":
      log(event.level, event.message);
      break;
  }
}

// Phase management
function setPhaseActive(phase) {
  const phaseEl = document.querySelector(`.phase[data-phase="${phase}"]`);
  if (phaseEl) {
    phaseEl.classList.add("active");
    phaseEl.classList.remove("completed");
  }
}

function setPhaseComplete(phase) {
  const phaseEl = document.querySelector(`.phase[data-phase="${phase}"]`);
  if (phaseEl) {
    phaseEl.classList.remove("active");
    phaseEl.classList.add("completed");
  }
}

function resetPhases() {
  document.querySelectorAll(".phase").forEach((el) => {
    el.classList.remove("active", "completed");
  });
  document.querySelector(".step-progress").hidden = true;
  document.getElementById("step-current").textContent = "0";
  document.getElementById("step-total").textContent = "0";
  stepFill.style.width = "0%";
  progressTimer.textContent = "00:00";
}

// Sitemap display - builds a tree visualization
function displaySitemap(urls, source, totalPages) {
  const sitemapSection = document.getElementById("sitemap-section");
  const sitemapContainer = document.getElementById("sitemap-container");
  const sitemapSource = document.getElementById("sitemap-source");
  const sitemapCount = document.getElementById("sitemap-count");
  
  // Show section
  sitemapSection.hidden = false;
  
  // Update header info
  sitemapSource.textContent = source.toUpperCase();
  sitemapCount.textContent = `${totalPages} pages`;
  
  // Clear existing
  sitemapContainer.innerHTML = "";
  
  // Auth-related path patterns to mark
  const authPatterns = [
    "/login", "/signin", "/signup", "/register",
    "/auth", "/oauth", "/sso",
    "/admin", "/dashboard", "/account", "/profile", "/settings",
    "/api/", "/webhook", "/callback",
    "/logout", "/signout"
  ];
  
  // Build tree structure from URLs
  const tree = { name: "/", children: {}, isPage: true };
  let baseHost = "";
  
  urls.forEach(url => {
    try {
      const parsed = new URL(url.loc);
      if (!baseHost) baseHost = parsed.hostname;
      
      const path = parsed.pathname || "/";
      const parts = path.split("/").filter(Boolean);
      
      let current = tree;
      parts.forEach((part, idx) => {
        if (!current.children[part]) {
          current.children[part] = { 
            name: part, 
            children: {}, 
            isPage: idx === parts.length - 1,
            priority: url.priority,
            isAuth: authPatterns.some(p => ("/" + parts.slice(0, idx + 1).join("/")).toLowerCase().includes(p))
          };
        }
        current = current.children[part];
      });
    } catch {
      // Skip invalid URLs
    }
  });
  
  // Render tree as ASCII diagram
  const treeEl = document.createElement("div");
  treeEl.className = "sitemap-tree";
  
  // Root node
  const rootLine = document.createElement("div");
  rootLine.className = "tree-line root";
  rootLine.innerHTML = `<span class="tree-icon">🌐</span> <span class="tree-host">${baseHost || "site"}</span>`;
  treeEl.appendChild(rootLine);
  
  // Render children recursively
  function renderNode(node, prefix, isLast) {
    const children = Object.values(node.children);
    children.forEach((child, idx) => {
      const isLastChild = idx === children.length - 1;
      const connector = isLastChild ? "└── " : "├── ";
      const line = document.createElement("div");
      line.className = "tree-line" + (child.isAuth ? " auth" : "");
      
      const icon = child.isAuth ? "🔒" : (Object.keys(child.children).length > 0 ? "📁" : "📄");
      const priorityBadge = child.priority ? `<span class="tree-priority">${child.priority.toFixed(1)}</span>` : "";
      
      line.innerHTML = `<span class="tree-prefix">${prefix}${connector}</span><span class="tree-icon">${icon}</span> <span class="tree-name">${child.name}</span>${priorityBadge}`;
      
      if (child.isAuth) {
        line.title = "Auth-required page (will be skipped)";
      }
      
      treeEl.appendChild(line);
      
      // Recurse for children
      const newPrefix = prefix + (isLastChild ? "    " : "│   ");
      renderNode(child, newPrefix, isLastChild);
    });
  }
  
  renderNode(tree, "", true);
  
  sitemapContainer.appendChild(treeEl);
}

// Hide sitemap when resetting
function hideSitemap() {
  const sitemapSection = document.getElementById("sitemap-section");
  sitemapSection.hidden = true;
}

// Logging
function log(level, message) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });

  const msg = document.createElement("span");
  msg.className = "log-message";
  msg.textContent = message;

  entry.appendChild(time);
  entry.appendChild(msg);
  logContainer.appendChild(entry);

  // Auto-scroll
  logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLogs() {
  logContainer.innerHTML = "";
}

// Results display
function showResults(report, evidence) {
  resultsSection.hidden = false;

  // Score
  const score = report.score;
  const scoreCircle = document.getElementById("score-circle");
  const scoreNumber = document.getElementById("score-number");
  const scoreSummary = document.getElementById("score-summary");

  // Calculate stroke offset (439.82 is circumference of circle with r=70)
  const circumference = 439.82;
  const offset = circumference - (score / 100) * circumference;

  // Animate score
  scoreCircle.style.strokeDashoffset = offset;

  // Animate number
  animateNumber(scoreNumber, 0, score, 1500);

  scoreSummary.textContent = report.summary;

  // Set color class
  scoreCircle.classList.remove("medium", "bad");
  if (score < 50) {
    scoreCircle.classList.add("bad");
  } else if (score < 80) {
    scoreCircle.classList.add("medium");
  }

  // Tested flows
  const flowsList = document.getElementById("flows-list");
  flowsList.innerHTML = report.testedFlows
    .map((flow) => `<li>${escapeHtml(flow)}</li>`)
    .join("");

  // Issues
  const issuesCount = document.getElementById("issues-count");
  const issuesList = document.getElementById("issues-list");

  issuesCount.textContent = report.issues.length;
  issuesList.innerHTML = report.issues
    .map((issue, index) => createIssueCard(issue, index))
    .join("");

  // Add click handlers for issue expansion
  issuesList.querySelectorAll(".issue-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.parentElement.classList.toggle("expanded");
    });
  });

  // Screenshots gallery
  const gallery = document.getElementById("screenshots-gallery");
  gallery.innerHTML = screenshots
    .map(
      (screenshot, index) => `
      <div class="screenshot-card" data-index="${index}">
        <img src="${escapeHtml(screenshot.url)}" alt="${escapeHtml(screenshot.label)}" loading="lazy">
        <div class="screenshot-label">${escapeHtml(screenshot.label)}</div>
      </div>
    `
    )
    .join("");

  // Add click handlers for screenshots
  gallery.querySelectorAll(".screenshot-card").forEach((card) => {
    card.addEventListener("click", () => {
      const index = parseInt(card.dataset.index, 10);
      openModal(screenshots[index].url, screenshots[index].label);
    });
  });
}

function animateNumber(element, start, end, duration) {
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * easeOut);

    element.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function createIssueCard(issue, index) {
  return `
    <div class="issue-card">
      <div class="issue-header">
        <span class="severity-badge ${issue.severity}">${issue.severity}</span>
        <span class="category-badge">${issue.category}</span>
        <span class="issue-title">${escapeHtml(issue.title)}</span>
        <span class="issue-toggle">&#9660;</span>
      </div>
      <div class="issue-details">
        <h4>Reproduction Steps</h4>
        <ul>
          ${issue.reproSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
        </ul>

        <h4>Expected</h4>
        <p>${escapeHtml(issue.expected)}</p>

        <h4>Actual</h4>
        <p>${escapeHtml(issue.actual)}</p>

        <h4>Suggested Fix</h4>
        <p>${escapeHtml(issue.suggestedFix)}</p>

        ${
          issue.evidence && issue.evidence.length > 0
            ? `
          <h4>Evidence</h4>
          <div class="issue-evidence">
            ${issue.evidence
              .map(
                (url) => `
              <img src="${escapeHtml(url)}" class="evidence-thumb" onclick="openModal('${escapeHtml(url)}', 'Issue evidence')">
            `
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    </div>
  `;
}

// Modal
function openModal(src, label) {
  modalImage.src = src;
  modalLabel.textContent = label;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}

// Notification (simple alert replacement)
function showNotification(message, type = "info") {
  // For now, just log to console. Could be replaced with a toast notification
  console.log(`[${type.toUpperCase()}] ${message}`);
  if (type === "error") {
    log("error", message);
  }
}

// History management
async function loadHistory() {
  try {
    const response = await fetch("/api/runs");
    const { runs } = await response.json();

    if (runs && runs.length > 0) {
      const emptyState = historyList.querySelector(".history-empty");
      if (emptyState) {
        emptyState.remove();
      }

      historyList.innerHTML = runs.map(createHistoryItem).join("");
      historyCount.textContent = runs.length;
      setupHistoryClickHandlers();
    }
  } catch (error) {
    console.error("Failed to load history:", error);
  }
}

function createHistoryItem(run) {
  const date = new Date(run.startedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
  const scoreClass = run.score >= 80 ? "good" : run.score >= 50 ? "medium" : "bad";

  let hostname = "";
  try {
    hostname = new URL(run.url).hostname;
  } catch {
    hostname = run.url;
  }

  let statusHtml = "";
  if (run.status === "running") {
    statusHtml = `<span class="history-status running">ACTIVE</span>`;
  } else if (run.status === "failed") {
    statusHtml = `<span class="history-status failed">FAILED</span>`;
  } else if (run.score !== undefined) {
    statusHtml = `<span class="history-score ${scoreClass}">${run.score}</span>`;
  }

  return `
    <div class="history-item" data-run-id="${run._id}">
      <div class="history-url">${escapeHtml(hostname)}</div>
      <div class="history-meta">
        <span>${date}</span>
        ${statusHtml}
      </div>
    </div>
  `;
}

function setupHistoryClickHandlers() {
  historyList.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", () => loadRun(item.dataset.runId));
  });
}

function addToHistory(run) {
  const emptyMsg = historyList.querySelector(".history-empty");
  if (emptyMsg) {
    emptyMsg.remove();
  }

  const newItem = document.createElement("div");
  newItem.innerHTML = createHistoryItem(run);
  historyList.insertBefore(newItem.firstElementChild, historyList.firstChild);

  // Update count
  const currentCount = parseInt(historyCount.textContent, 10) || 0;
  historyCount.textContent = currentCount + 1;

  setupHistoryClickHandlers();
}

function updateHistoryItem(runId, updates) {
  const item = historyList.querySelector(`[data-run-id="${runId}"]`);
  if (item) {
    const metaEl = item.querySelector(".history-meta");
    const statusEl = metaEl.querySelector(".history-status, .history-score");

    if (statusEl) {
      statusEl.remove();
    }

    if (updates.status === "failed") {
      metaEl.insertAdjacentHTML("beforeend", `<span class="history-status failed">FAILED</span>`);
    } else if (updates.score !== undefined) {
      const scoreClass = updates.score >= 80 ? "good" : updates.score >= 50 ? "medium" : "bad";
      metaEl.insertAdjacentHTML(
        "beforeend",
        `<span class="history-score ${scoreClass}">${updates.score}</span>`
      );
    }
  }
}

async function loadRun(runId) {
  try {
    const response = await fetch(`/api/runs/${runId}`);
    if (!response.ok) throw new Error("Run not found");

    const run = await response.json();

    resetUI();

    if (run.status === "completed" && run.report) {
      // Populate screenshots from run
      screenshots = (run.screenshots || []).map((s) => ({
        url: s.url,
        label: s.label,
        stepIndex: s.stepIndex,
      }));

      showResults(run.report, run.evidence);

      // Highlight active item
      historyList.querySelectorAll(".history-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.runId === runId);
      });
    } else if (run.status === "failed") {
      showError(run.error || "Test failed");
    }
  } catch (error) {
    console.error("Failed to load run:", error);
  }
}

// UI State management
function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;

  // Update status indicator
  const statusDot = document.querySelector(".status-dot");
  const statusText = document.querySelector(".status-text");

  if (loading) {
    statusDot.style.background = "var(--cyan)";
    statusDot.style.boxShadow = "var(--glow-cyan)";
    statusText.style.color = "var(--cyan)";
    statusText.textContent = "SCANNING";
  } else {
    statusDot.style.background = "var(--success)";
    statusDot.style.boxShadow = "var(--glow-success)";
    statusText.style.color = "var(--success)";
    statusText.textContent = "SYSTEM READY";
  }
}

function showProgress() {
  progressSection.hidden = false;
  resultsSection.hidden = true;
  errorSection.hidden = true;
}

function hideProgress() {
  progressSection.hidden = true;
  hideSitemap();
}

function showError(message) {
  errorSection.hidden = false;
  progressSection.hidden = true;
  resultsSection.hidden = true;
  hideSitemap();
  document.getElementById("error-message").textContent = message;
}

function hideError() {
  errorSection.hidden = true;
}

function resetUI() {
  clearLogs();
  resetPhases();
  screenshots = [];
  resultsSection.hidden = true;
  errorSection.hidden = true;
  progressSection.hidden = true;

  // Clear active history items
  historyList.querySelectorAll(".history-item").forEach((item) => {
    item.classList.remove("active");
  });
}

function resetForm() {
  urlInput.value = "";
  urlInput.focus();
}

// Utilities
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Make openModal available globally for inline onclick handlers
window.openModal = openModal;
