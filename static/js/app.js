/**
 * AAFACT 2.0 - Main Frontend Application Logic
 * Lead Python & 3D Geometry Engineer
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize 3D Viewport
  const viewer = new BoneViewer3D('three-canvas');

  // Application State
  const state = {
    currentFile: null,
    patientName: "Ashok",
    laterality: "Right",
    anatomy: "Tibia",
    isStandard: true,
    
    // Alignment Results
    alignedFilename: null,
    alignedMeshUrl: null,
    ttlMm: 375.0,
    
    // Cutting Parameters
    defectStartPct: 20.0,
    defectLengthPct: 25.0,
    corticotomyPct: 75.0,
    sawKerfMm: 0.0,
    
    // Slicing Results
    sliceData: null
  };

  // DOM Elements
  const els = {
    // Stepper Tabs
    tabBtn1: document.getElementById('tab-btn-1'),
    tabBtn2: document.getElementById('tab-btn-2'),
    tabBtn3: document.getElementById('tab-btn-3'),
    tabContent1: document.getElementById('tab-content-1'),
    tabContent2: document.getElementById('tab-content-2'),
    tabContent3: document.getElementById('tab-content-3'),

    // System Status
    matlabStatusDot: document.getElementById('matlab-status-dot'),
    matlabStatusText: document.getElementById('matlab-status-text'),
    activeBoneBadge: document.getElementById('active-bone-badge'),

    // Module 1 Elements
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    sampleAshokBtn: document.getElementById('sample-ashok-btn'),
    sampleBalvirBtn: document.getElementById('sample-balvir-btn'),
    metaCard: document.getElementById('metadata-card'),
    inputPatientName: document.getElementById('input-patient-name'),
    selectAnatomy: document.getElementById('select-anatomy'),
    latOptionRight: document.getElementById('lat-option-right'),
    latOptionLeft: document.getElementById('lat-option-left'),
    standardBadge: document.getElementById('standard-filename-badge'),
    btnRunAlignment: document.getElementById('btn-run-alignment'),
    alignmentCard: document.getElementById('alignment-card'),
    readoutTtl: document.getElementById('readout-ttl'),
    readoutZPlateau: document.getElementById('readout-z-plateau'),
    readoutZDistal: document.getElementById('readout-z-distal'),
    readoutVolume: document.getElementById('readout-volume'),
    btnDownloadAligned: document.getElementById('btn-download-aligned'),
    btnProceedModule2: document.getElementById('btn-proceed-module2'),

    // Module 2 Elements
    presetABtn: document.getElementById('preset-a-btn'),
    presetBBtn: document.getElementById('preset-b-btn'),
    ttlInputModule2: document.getElementById('input-ttl-module2'),
    
    sliderDefectStart: document.getElementById('slider-defect-start'),
    inputDefectStartPct: document.getElementById('input-defect-start-pct'),
    inputDefectStartMm: document.getElementById('input-defect-start-mm'),
    
    sliderDefectLength: document.getElementById('slider-defect-length'),
    inputDefectLengthPct: document.getElementById('input-defect-length-pct'),
    inputDefectLengthMm: document.getElementById('input-defect-length-mm'),
    
    readoutDefectEndPct: document.getElementById('readout-defect-end-pct'),
    readoutDefectEndMm: document.getElementById('readout-defect-end-mm'),
    
    sliderCorticotomy: document.getElementById('slider-corticotomy'),
    inputCorticotomyPct: document.getElementById('input-corticotomy-pct'),
    inputCorticotomyMm: document.getElementById('input-corticotomy-mm'),
    
    inputSawKerfMm: document.getElementById('input-saw-kerf-mm'),
    planeOrderingBadge: document.getElementById('plane-ordering-badge'),
    schematicProximal: document.getElementById('schematic-proximal'),
    schematicTransport: document.getElementById('schematic-transport'),
    schematicDefect: document.getElementById('schematic-defect'),
    schematicDistal: document.getElementById('schematic-distal'),
    btnRunSlicing: document.getElementById('btn-run-slicing'),

    // Module 3 Elements
    segmentCards: document.getElementById('segment-cards-container'),
    btnDownloadZip: document.getElementById('btn-download-zip'),
    btnStartNewCase: document.getElementById('btn-start-new-case'),

    // Overlay
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),

    // Viewport HUD
    transportSliderHud: document.getElementById('transport-slider-hud'),
    transportOffsetSlider: document.getElementById('transport-offset-slider'),
    transportOffsetVal: document.getElementById('transport-offset-val')
  };

  /* ----------------------------------------------------
     STEPPER NAVIGATION
  ---------------------------------------------------- */
  function switchTab(tabIndex) {
    [els.tabBtn1, els.tabBtn2, els.tabBtn3].forEach((btn, idx) => {
      btn.classList.toggle('active', idx + 1 === tabIndex);
    });
    [els.tabContent1, els.tabContent2, els.tabContent3].forEach((content, idx) => {
      content.classList.toggle('active', idx + 1 === tabIndex);
    });

    if (tabIndex === 2) {
      viewer.toggleLayer('planes', true);
      updateCuttingPlanesAndInputs();
    } else if (tabIndex === 3) {
      viewer.toggleLayer('planes', false);
    }
  }

  els.tabBtn1.addEventListener('click', () => switchTab(1));
  els.tabBtn2.addEventListener('click', () => {
    if (!els.tabBtn2.classList.contains('disabled')) switchTab(2);
  });
  els.tabBtn3.addEventListener('click', () => {
    if (!els.tabBtn3.classList.contains('disabled')) switchTab(3);
  });

  /* ----------------------------------------------------
     SYSTEM STATUS CHECK
  ---------------------------------------------------- */
  async function checkSystemStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.matlab_runtime && data.matlab_runtime.installed) {
        els.matlabStatusDot.className = 'status-dot active';
        els.matlabStatusText.textContent = `MATLAB Runtime R2023a (Ready)`;
      } else {
        els.matlabStatusDot.className = 'status-dot warning';
        els.matlabStatusText.textContent = `Native Geometry Engine (Active)`;
      }
    } catch (e) {
      console.warn("Status check warning:", e);
    }
  }
  checkSystemStatus();

  /* ----------------------------------------------------
     FILE UPLOAD & SAMPLE LOADING
  ---------------------------------------------------- */
  function populateMetadata(parsed) {
    state.currentFile = parsed.filename;
    state.patientName = parsed.patient_name || "Ashok";
    state.laterality = parsed.laterality || "Right";
    state.anatomy = parsed.anatomy || "Tibia";
    state.isStandard = parsed.is_standard;

    els.inputPatientName.value = state.patientName;
    els.selectAnatomy.value = state.anatomy;
    setLaterality(state.laterality);

    if (state.isStandard) {
      els.standardBadge.textContent = "Standard Match";
      els.standardBadge.className = "version-pill";
      els.standardBadge.style.color = "#34d399";
      els.standardBadge.style.borderColor = "rgba(52, 211, 153, 0.3)";
    } else {
      els.standardBadge.textContent = "Custom Token Match";
      els.standardBadge.className = "version-pill";
      els.standardBadge.style.color = "#f59e0b";
      els.standardBadge.style.borderColor = "rgba(245, 158, 11, 0.3)";
    }

    els.metaCard.style.display = 'flex';
    els.btnRunAlignment.disabled = false;
    els.activeBoneBadge.textContent = `${state.patientName} (${state.laterality} ${state.anatomy})`;

    // Load mesh into 3D viewer
    showLoading(true, "Loading 3D Mesh...");
    viewer.loadBoneMesh(parsed.mesh_url, (meta) => {
      showLoading(false);
      state.ttlMm = meta.ttl;
      els.readoutTtl.textContent = `${meta.ttl.toFixed(1)} mm`;
      viewer.updateRuler(meta.ttl);
    });
  }

  function setLaterality(lat) {
    state.laterality = lat;
    els.latOptionRight.classList.toggle('active', lat === 'Right');
    els.latOptionLeft.classList.toggle('active', lat === 'Left');
  }

  els.latOptionRight.addEventListener('click', () => setLaterality('Right'));
  els.latOptionLeft.addEventListener('click', () => setLaterality('Left'));
  els.inputPatientName.addEventListener('input', (e) => state.patientName = e.target.value);
  els.selectAnatomy.addEventListener('change', (e) => state.anatomy = e.target.value);

  // Drag and drop
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropzone.classList.add('dragover');
  });
  els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('dragover'));
  els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  });

  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFilesUpload(e.target.files);
    }
  });

  async function handleFilesUpload(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    showLoading(true, "Uploading and parsing STL files...");
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      showLoading(false);
      if (data.success && data.uploaded.length > 0) {
        populateMetadata(data.uploaded[0]);
      } else {
        alert("Upload error: " + (data.error || "No valid STL files"));
      }
    } catch (err) {
      showLoading(false);
      alert("Network error uploading files: " + err);
    }
  }

  // Quick load samples
  async function loadSampleFile(filename) {
    showLoading(true, `Loading sample ${filename}...`);
    try {
      const res = await fetch('/api/samples/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      showLoading(false);
      if (data.success) {
        populateMetadata(data);
      }
    } catch (e) {
      showLoading(false);
      alert("Error loading sample: " + e);
    }
  }

  els.sampleAshokBtn.addEventListener('click', () => loadSampleFile('Ashok_Right_Tibia.stl'));
  els.sampleBalvirBtn.addEventListener('click', () => loadSampleFile('Balvir_Left_Tibia.stl'));

  /* ----------------------------------------------------
     MODULE 1: ALIGNMENT & Z-ORIGIN REGISTRATION
  ---------------------------------------------------- */
  els.btnRunAlignment.addEventListener('click', async () => {
    if (!state.currentFile) return;

    showLoading(true, "Executing AAFACT Alignment & Tibial Plateau Z-Origin Registration...");
    try {
      const res = await fetch('/api/align', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: state.currentFile,
          patient_name: state.patientName,
          laterality: state.laterality,
          anatomy: state.anatomy
        })
      });
      const resp = await res.json();
      showLoading(false);

      if (resp.success) {
        const d = resp.data;
        state.alignedFilename = d.aligned_filename;
        state.alignedMeshUrl = d.mesh_url;
        state.ttlMm = d.ttl_mm;

        // Update readouts
        els.readoutTtl.textContent = `${d.ttl_mm.toFixed(1)} mm`;
        els.readoutZPlateau.textContent = `${d.proximal_z_origin.toFixed(1)} mm`;
        els.readoutZDistal.textContent = `${d.distal_z_end.toFixed(1)} mm`;
        els.readoutVolume.textContent = d.volume_cm3 ? `${d.volume_cm3} cm³` : "Calculated";

        els.alignmentCard.style.display = 'flex';
        els.btnDownloadAligned.href = d.download_url;
        els.btnDownloadAligned.style.display = 'inline-flex';
        els.btnProceedModule2.style.display = 'inline-flex';
        els.tabBtn2.classList.remove('disabled');

        // Re-load aligned mesh in viewer & update ruler
        viewer.loadBoneMesh(d.mesh_url, () => {
          viewer.updateRuler(d.ttl_mm);
        });
      } else {
        alert("Alignment failed: " + resp.error);
      }
    } catch (err) {
      showLoading(false);
      alert("Network error during alignment: " + err);
    }
  });

  els.btnProceedModule2.addEventListener('click', () => {
    switchTab(2);
  });

  /* ----------------------------------------------------
     MODULE 2: CLINICAL PRESETS & BI-DIRECTIONAL INPUTS
  ---------------------------------------------------- */
  function applyPreset(presetType) {
    if (presetType === 'A') {
      // Preset A (Standard 25% Defect)
      state.defectStartPct = 20.0;
      state.defectLengthPct = 25.0;
      state.corticotomyPct = 75.0;
      state.sawKerfMm = 0.0;
      els.presetABtn.classList.add('active');
      els.presetBBtn.classList.remove('active');
    } else if (presetType === 'B') {
      // Preset B (Mid-Shaft Centered 20% Defect)
      // 50% midpoint: start = 40%, end = 60%, size = 20%, Corticotomy = 20%
      state.defectStartPct = 40.0;
      state.defectLengthPct = 20.0;
      state.corticotomyPct = 20.0;
      state.sawKerfMm = 0.0;
      els.presetBBtn.classList.add('active');
      els.presetABtn.classList.remove('active');
    }
    updateCuttingPlanesAndInputs();
  }

  els.presetABtn.addEventListener('click', () => applyPreset('A'));
  els.presetBBtn.addEventListener('click', () => applyPreset('B'));

  function updateCuttingPlanesAndInputs() {
    const ttl = state.ttlMm;
    els.ttlInputModule2.value = ttl.toFixed(1);

    // Defect Start
    els.sliderDefectStart.value = state.defectStartPct;
    els.inputDefectStartPct.value = state.defectStartPct.toFixed(1);
    els.inputDefectStartMm.value = ((state.defectStartPct / 100.0) * ttl).toFixed(1);

    // Defect Length
    els.sliderDefectLength.value = state.defectLengthPct;
    els.inputDefectLengthPct.value = state.defectLengthPct.toFixed(1);
    els.inputDefectLengthMm.value = ((state.defectLengthPct / 100.0) * ttl).toFixed(1);

    // Defect End (Computed)
    const defectEndPct = Math.min(100.0, state.defectStartPct + state.defectLengthPct);
    const defectEndMm = (defectEndPct / 100.0) * ttl;
    els.readoutDefectEndPct.textContent = `${defectEndPct.toFixed(1)}%`;
    els.readoutDefectEndMm.textContent = `${defectEndMm.toFixed(1)} mm`;

    // Corticotomy
    els.sliderCorticotomy.value = state.corticotomyPct;
    els.inputCorticotomyPct.value = state.corticotomyPct.toFixed(1);
    els.inputCorticotomyMm.value = ((state.corticotomyPct / 100.0) * ttl).toFixed(1);

    // Kerf
    els.inputSawKerfMm.value = state.sawKerfMm.toFixed(1);

    // Dynamic Plane Ordering Logic & Schematic
    updateDynamicSchematic(state.defectStartPct, defectEndPct, state.corticotomyPct);

    // Update 3D Viewport Planes
    viewer.updateCuttingPlanes(ttl, state.defectStartPct, state.defectLengthPct, state.corticotomyPct);
  }

  function updateDynamicSchematic(startPct, endPct, cortPct) {
    if (cortPct < startPct) {
      els.planeOrderingBadge.textContent = "Proximal Corticotomy (Corticotomy < Defect Start)";
      els.planeOrderingBadge.style.color = "#38bdf8";

      // 1. Proximal (0 to cort)
      els.schematicProximal.style.width = `${cortPct}%`;
      els.schematicProximal.textContent = `Prox (${cortPct.toFixed(0)}%)`;

      // 2. Transport (cort to start)
      const transW = startPct - cortPct;
      els.schematicTransport.style.width = `${transW}%`;
      els.schematicTransport.textContent = `Transport (${transW.toFixed(0)}%)`;

      // 3. Defect (start to end)
      const defW = endPct - startPct;
      els.schematicDefect.style.width = `${defW}%`;
      els.schematicDefect.textContent = `Defect (${defW.toFixed(0)}%)`;

      // 4. Distal (end to 100)
      const distW = 100 - endPct;
      els.schematicDistal.style.width = `${distW}%`;
      els.schematicDistal.textContent = `Distal (${distW.toFixed(0)}%)`;
    } else {
      els.planeOrderingBadge.textContent = "Distal Corticotomy (Corticotomy > Defect End)";
      els.planeOrderingBadge.style.color = "#f59e0b";

      // 1. Proximal (0 to start)
      els.schematicProximal.style.width = `${startPct}%`;
      els.schematicProximal.textContent = `Prox (${startPct.toFixed(0)}%)`;

      // 2. Defect (start to end)
      const defW = endPct - startPct;
      els.schematicDefect.style.width = `${defW}%`;
      els.schematicDefect.textContent = `Defect (${defW.toFixed(0)}%)`;

      // 3. Transport (end to cort)
      const transW = cortPct - endPct;
      els.schematicTransport.style.width = `${transW}%`;
      els.schematicTransport.textContent = `Transport (${transW.toFixed(0)}%)`;

      // 4. Distal (cort to 100)
      const distW = 100 - cortPct;
      els.schematicDistal.style.width = `${distW}%`;
      els.schematicDistal.textContent = `Distal (${distW.toFixed(0)}%)`;
    }
  }

  // Defect Start Event Listeners
  els.sliderDefectStart.addEventListener('input', (e) => {
    state.defectStartPct = parseFloat(e.target.value);
    updateCuttingPlanesAndInputs();
  });
  els.inputDefectStartPct.addEventListener('change', (e) => {
    state.defectStartPct = Math.max(1, Math.min(95, parseFloat(e.target.value) || 20));
    updateCuttingPlanesAndInputs();
  });
  els.inputDefectStartMm.addEventListener('change', (e) => {
    const mm = parseFloat(e.target.value) || 0;
    state.defectStartPct = Math.max(1, Math.min(95, (mm / state.ttlMm) * 100.0));
    updateCuttingPlanesAndInputs();
  });

  // Defect Length Event Listeners
  els.sliderDefectLength.addEventListener('input', (e) => {
    state.defectLengthPct = parseFloat(e.target.value);
    updateCuttingPlanesAndInputs();
  });
  els.inputDefectLengthPct.addEventListener('change', (e) => {
    state.defectLengthPct = Math.max(1, Math.min(60, parseFloat(e.target.value) || 25));
    updateCuttingPlanesAndInputs();
  });
  els.inputDefectLengthMm.addEventListener('change', (e) => {
    const mm = parseFloat(e.target.value) || 0;
    state.defectLengthPct = Math.max(1, Math.min(60, (mm / state.ttlMm) * 100.0));
    updateCuttingPlanesAndInputs();
  });

  // Corticotomy Event Listeners
  els.sliderCorticotomy.addEventListener('input', (e) => {
    state.corticotomyPct = parseFloat(e.target.value);
    updateCuttingPlanesAndInputs();
  });
  els.inputCorticotomyPct.addEventListener('change', (e) => {
    state.corticotomyPct = Math.max(1, Math.min(99, parseFloat(e.target.value) || 75));
    updateCuttingPlanesAndInputs();
  });
  els.inputCorticotomyMm.addEventListener('change', (e) => {
    const mm = parseFloat(e.target.value) || 0;
    state.corticotomyPct = Math.max(1, Math.min(99, (mm / state.ttlMm) * 100.0));
    updateCuttingPlanesAndInputs();
  });

  // Saw Kerf Listener
  els.inputSawKerfMm.addEventListener('change', (e) => {
    state.sawKerfMm = Math.max(0, parseFloat(e.target.value) || 0);
  });

  // Manual TTL Edit Listener
  els.ttlInputModule2.addEventListener('change', (e) => {
    const newTtl = parseFloat(e.target.value);
    if (newTtl && newTtl > 50 && newTtl < 800) {
      state.ttlMm = newTtl;
      viewer.updateRuler(newTtl);
      updateCuttingPlanesAndInputs();
    }
  });

  /* ----------------------------------------------------
     MODULE 2: EXECUTE WATERTIGHT CORTICOTOMY
  ---------------------------------------------------- */
  els.btnRunSlicing.addEventListener('click', async () => {
    if (!state.alignedFilename) {
      alert("Please execute AAFACT alignment in Module 1 first.");
      return;
    }

    showLoading(true, "Executing Watertight Corticotomy & Manifold Planar Capping...");
    try {
      const res = await fetch('/api/slice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aligned_filename: state.alignedFilename,
          ttl_mm: state.ttlMm,
          defect_start_pct: state.defectStartPct,
          defect_length_pct: state.defectLengthPct,
          corticotomy_pct: state.corticotomyPct,
          saw_kerf_mm: state.sawKerfMm
        })
      });
      const resp = await res.json();
      showLoading(false);

      if (resp.success) {
        state.sliceData = resp.data;
        renderSlicingResults(resp.data);
        switchTab(3);

        // Load 3D segmented meshes
        const meshUrls = {
          proximal: resp.data.segments.proximal.mesh_url,
          transport: resp.data.segments.transport.mesh_url,
          distal: resp.data.segments.distal.mesh_url
        };
        viewer.loadSegmentedMeshes(meshUrls, () => {
          els.transportSliderHud.classList.add('visible');
        });
      } else {
        alert("Slicing failed: " + resp.error);
      }
    } catch (err) {
      showLoading(false);
      alert("Network error executing slicing: " + err);
    }
  });

  /* ----------------------------------------------------
     MODULE 3: RENDER SEGMENT BREAKDOWN & EXPORTS
  ---------------------------------------------------- */
  function renderSlicingResults(data) {
    els.segmentCards.innerHTML = '';

    const segmentsConfig = [
      { key: 'proximal', name: 'Proximal Segment', color: '#10b981', desc: 'Stationary anchor segment containing the tibial plateau joint line' },
      { key: 'transport', name: 'Transport Segment', color: '#0ea5e9', desc: 'Osteotomy bone block distracted across defect during treatment' },
      { key: 'distal', name: 'Distal Segment', color: '#f59e0b', desc: 'Stationary anchor segment extending to distal pilon joint line' }
    ];

    segmentsConfig.forEach(cfg => {
      const seg = data.segments[cfg.key];
      const m = seg.metrics;

      const card = document.createElement('div');
      card.className = 'ui-card';
      card.innerHTML = `
        <div class="card-title" style="color: ${cfg.color}">
          <span>● ${cfg.name}</span>
          <span class="version-pill" style="color: ${cfg.color}; border-color: ${cfg.color}55">${m.length_pct}% TTL</span>
        </div>
        <p style="font-size: 11px; color: var(--text-dim);">${cfg.desc}</p>
        <div class="metric-row">
          <span class="metric-label">Longitudinal Length:</span>
          <span class="metric-val">${m.length_mm} mm</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Z Span:</span>
          <span class="metric-val">${m.z_max} mm to ${m.z_min} mm</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Watertight Solid:</span>
          <span class="metric-val" style="color: ${m.is_watertight ? '#34d399' : '#f59e0b'}">${m.is_watertight ? 'Yes (Solid 3D Printable)' : 'Capped Manifold'}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Volume:</span>
          <span class="metric-val">${m.volume_cm3} cm³</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <a href="${seg.download_url}" class="btn-success" style="flex: 1; text-align: center; justify-content: center;" download>
            Download STL
          </a>
        </div>
      `;
      els.segmentCards.appendChild(card);
    });

    // Defect Void Summary Card
    const defectCard = document.createElement('div');
    defectCard.className = 'ui-card';
    defectCard.innerHTML = `
      <div class="card-title" style="color: #ef4444">
        <span>Resected Defect Void (Deleted Zone)</span>
        <span class="version-pill" style="color: #ef4444; border-color: #ef444455">${data.defect.length_pct}% TTL</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Gap Length:</span>
        <span class="metric-val highlight-rose">${data.defect.length_mm} mm</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Defect Z Span:</span>
        <span class="metric-val">${data.planes.defect_start.z_coord} mm to ${data.planes.defect_end.z_coord} mm</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Excised Bone Volume:</span>
        <span class="metric-val">${data.defect.volume_cm3} cm³</span>
      </div>
    `;
    els.segmentCards.appendChild(defectCard);

    // Setup master zip download button
    els.btnDownloadZip.href = data.zip_archive.download_url;
    els.tabBtn3.classList.remove('disabled');
  }

  els.btnStartNewCase.addEventListener('click', () => {
    switchTab(1);
    els.transportSliderHud.classList.remove('visible');
    viewer.setTransportDisplacement(0.0);
  });

  /* ----------------------------------------------------
     VIEWPORT CONTROLS & HUD
  ---------------------------------------------------- */
  document.getElementById('view-front-btn').addEventListener('click', () => viewer.setView('anterior'));
  document.getElementById('view-side-btn').addEventListener('click', () => viewer.setView('lateral'));
  document.getElementById('view-top-btn').addEventListener('click', () => viewer.setView('proximal'));
  document.getElementById('view-iso-btn').addEventListener('click', () => viewer.setView('iso'));

  document.getElementById('toggle-planes').addEventListener('change', (e) => {
    viewer.toggleLayer('planes', e.target.checked);
  });
  document.getElementById('toggle-ruler').addEventListener('change', (e) => {
    viewer.toggleLayer('ruler', e.target.checked);
  });
  document.getElementById('toggle-wireframe').addEventListener('change', (e) => {
    viewer.toggleLayer('wireframe', e.target.checked);
  });

  // Distraction Osteogenesis Simulation Slider
  els.transportOffsetSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    els.transportOffsetVal.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)} mm`;
    viewer.setTransportDisplacement(val);
  });

  /* ----------------------------------------------------
     LOADING OVERLAY HELPER
  ---------------------------------------------------- */
  function showLoading(show, message = "Processing...") {
    els.loadingText.textContent = message;
    els.loadingOverlay.classList.toggle('active', show);
  }

  // Pre-load default sample on startup for seamless immediate demonstration
  setTimeout(() => {
    loadSampleFile('Ashok_Right_Tibia.stl');
  }, 400);
});
