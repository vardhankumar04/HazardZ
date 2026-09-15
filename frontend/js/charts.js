/**
 * Analytics & City Road Health Index Visualizer
 */

function updateAnalyticsUI(data) {
  if (!data) return;

  // 1. City Road Health Index Circular Gauge
  const healthPercentElem = document.getElementById('kpi-health-percent');
  const healthBar = document.getElementById('health-circle-bar');
  const healthStatusText = document.getElementById('health-status-text');

  const healthScore = data.road_health_index || 82;

  if (healthPercentElem) healthPercentElem.textContent = `${healthScore}%`;

  if (healthBar) {
    healthBar.setAttribute('stroke-dasharray', `${healthScore}, 100`);

    if (healthScore >= 75) {
      healthBar.style.stroke = 'var(--color-emerald)';
      if (healthStatusText) {
        healthStatusText.textContent = 'Good Condition';
        healthStatusText.className = 'health-status-badge good';
      }
    } else if (healthScore >= 50) {
      healthBar.style.stroke = '#f59e0b';
      if (healthStatusText) {
        healthStatusText.textContent = 'Degraded Sections';
        healthStatusText.className = 'health-status-badge warning';
      }
    } else {
      healthBar.style.stroke = '#ef4444';
      if (healthStatusText) {
        healthStatusText.textContent = 'Critical Hazard Alert';
        healthStatusText.className = 'health-status-badge critical';
      }
    }
  }

  // 2. Metrics Strip
  const critCount = document.getElementById('kpi-critical-count');
  const totHazards = document.getElementById('kpi-total-hazards');
  const resCount = document.getElementById('kpi-resolved-count');
  const actBuses = document.getElementById('kpi-active-buses');
  const covKm = document.getElementById('kpi-coverage-km');

  if (critCount) critCount.textContent = data.critical_unresolved;
  if (totHazards) totHazards.textContent = data.total_hazards;
  if (resCount) resCount.textContent = data.resolved_count;
  if (actBuses) actBuses.innerHTML = `${data.active_buses} <span class="kpi-unit">Units</span>`;
  if (covKm) covKm.innerHTML = `${data.total_coverage_km} <span class="kpi-unit">km</span>`;

  // 3. Mini Audit Activity Feed
  const auditContainer = document.getElementById('audit-feed-container');
  if (auditContainer && data.recent_logs) {
    auditContainer.innerHTML = '';
    data.recent_logs.slice(0, 5).forEach(log => {
      const timeStr = new Date(log.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const item = document.createElement('div');
      item.className = 'audit-item';
      item.innerHTML = `
        <span><strong class="audit-item-actor">${log.actor}:</strong> ${log.details}</span>
        <span style="font-family: var(--font-mono); color: var(--text-muted); font-size: 10px; flex-shrink: 0;">${timeStr}</span>
      `;
      auditContainer.appendChild(item);
    });
  }
}
