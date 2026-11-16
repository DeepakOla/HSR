/**
 * PESO GCT Portal Copilot — Content Script
 * Auto-fills and validates CNG cylinder hydro test readings directly into PESO GCT portal forms.
 * Enforces Rule 35 safety invariants (Permanent expansion <= 10%, Weight loss <= 5%).
 */

(function initPesoCopilot() {
  console.log('[HSR PESO Copilot] Initialized on', window.location.href);

  // Create floating trigger widget on the PESO portal
  const widget = document.createElement('div');
  widget.id = 'hsr-peso-copilot-widget';
  widget.innerHTML = `
    <div style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #0a1128;
      color: #ffffff;
      border: 2px solid #0284c7;
      border-radius: 12px;
      padding: 14px 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      min-width: 280px;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #38bdf8; font-size: 14px;">⚡ HSR PESO Copilot</strong>
        <span style="font-size: 10px; background: #0284c7; padding: 2px 6px; border-radius: 4px;">Rule 35</span>
      </div>
      <p style="margin: 0 0 10px; color: #cbd5e1; font-size: 11px;">
        Click below to paste and auto-fill validated cylinder readings from HSR testing bay clipboard.
      </p>
      <button id="btn-paste-hsr-payload" style="
        width: 100%;
        background: #ea580c;
        color: #ffffff;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.15s;
      ">
        📋 Paste HSR Test Payload
      </button>
      <div id="hsr-validation-alert" style="margin-top: 8px; font-size: 11px; display: none;"></div>
    </div>
  `;
  document.body.appendChild(widget);

  const pasteBtn = document.getElementById('btn-paste-hsr-payload');
  const alertDiv = document.getElementById('hsr-validation-alert');

  if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          showAlert('Clipboard does not contain valid JSON payload. Copy from HSR Staff Portal first.', '#ef4444');
          return;
        }

        if (!payload.serialNumber && !payload.cylinders) {
          showAlert('Payload is missing cylinder test data.', '#ef4444');
          return;
        }

        const cyl = Array.isArray(payload.cylinders) ? payload.cylinders[0] : payload;

        // Perform Statutory Verification Checks
        const totalExpansion = parseFloat(cyl.totalExpansionCc || 0);
        const permExpansion = parseFloat(cyl.permanentExpansionCc || 0);
        let permRatio = 0;
        if (totalExpansion > 0) {
          permRatio = (permExpansion / totalExpansion) * 100;
        }

        if (permRatio > 10.0) {
          showAlert(`⚠️ CRITICAL SAFETY FAILURE: Permanent Expansion is ${permRatio.toFixed(2)}% (Max allowed is 10.0%). Cylinder must be CONDEMNED under Gas Cylinders Rules!`, '#dc2626');
          return;
        }

        const tareWeight = parseFloat(cyl.tareWeightKg || 0);
        const originalTare = parseFloat(cyl.originalTareWeightKg || 0);
        if (originalTare > 0 && tareWeight > 0) {
          const wtLoss = ((originalTare - tareWeight) / originalTare) * 100;
          if (wtLoss > 5.0) {
            showAlert(`⚠️ CRITICAL: Weight loss is ${wtLoss.toFixed(2)}% (Max allowed is 5.0%). Excessive wall erosion.`, '#dc2626');
            return;
          }
        }

        // Map and populate into PESO form inputs
        let filledCount = 0;
        filledCount += setInputValue(['txtSerialNo', 'serial_no', 'cylinder_serial', 'serialNo'], cyl.serialNumber);
        filledCount += setInputValue(['txtWorkingPressure', 'working_pressure', 'wp'], cyl.workingPressure || '200');
        filledCount += setInputValue(['txtTestPressure', 'test_pressure', 'tp'], cyl.testPressure || '300');
        filledCount += setInputValue(['txtWaterCapacity', 'water_capacity', 'capacity'], cyl.waterCapacityLiters);
        filledCount += setInputValue(['txtTareWeight', 'tare_weight', 'actual_tare'], cyl.tareWeightKg);
        filledCount += setInputValue(['txtTotalExp', 'total_expansion', 'te'], cyl.totalExpansionCc);
        filledCount += setInputValue(['txtPermExp', 'permanent_expansion', 'pe'], cyl.permanentExpansionCc);
        filledCount += setInputValue(['txtPermRatio', 'expansion_ratio'], permRatio.toFixed(2));

        showAlert(`✅ Auto-filled ${filledCount} fields! Statutary checks passed (PE/TE: ${permRatio.toFixed(2)}%). Ready for submission.`, '#22c55e');
      } catch (err) {
        showAlert('Error reading clipboard: ' + err.message, '#ef4444');
      }
    });
  }

  function setInputValue(possibleNames, value) {
    if (!value) return 0;
    for (const name of possibleNames) {
      const el = document.querySelector(`input[name*="${name}" i], input[id*="${name}" i]`);
      if (el) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.style.backgroundColor = '#ecfdf5';
        el.style.border = '1px solid #10b981';
        return 1;
      }
    }
    return 0;
  }

  function showAlert(msg, color) {
    if (!alertDiv) return;
    alertDiv.style.display = 'block';
    alertDiv.style.color = color;
    alertDiv.textContent = msg;
  }
})();
