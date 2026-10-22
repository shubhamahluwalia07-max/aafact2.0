# AAFACT 2.0: Bone Alignment & Corticotomy Planning System

Production-ready clinical orthopedic planning application for automated anatomical bone alignment, Tibial Plateau Z-origin registration, defect resection, and corticotomy planning with an interactive Three.js 3D viewport.

---

## 🌟 Key Features

### 1. Robust STL Import & Filename Parser
- Single or batch `.stl` upload.
- Automatic case-insensitive regex & token parser extracting:
  - `patient_name` (e.g., Ashok, Balvir)
  - `laterality` (`Left` or `Right`)
  - `anatomy` (`Tibia`, `Fibula`, `Femur`, `Talus`, etc.)
- Metadata badges and user override dropdowns in UI.
- Strict modern Trimesh loading compliance (no deprecated `.remove_duplicate_faces()`).

### 2. Module 1: AAFACT Alignment & Tibial Plateau Z-Origin Registration
- Invokes compiled `AAFACT.exe` subprocess if present in workspace.
- Seamless fallback to native 3D vertex PCA + morphological condyle/plateau analysis.
- Post-Alignment Coordinate Normalization:
  - Longitudinal mechanical axis aligned strictly along Z-axis.
  - Proximal joint line (Tibial Plateau) registered exactly at **$Z = 0.0\text{ mm}$ (0% TTL)**.
  - Shaft extends downward along negative Z-axis to distal joint line at **$Z = -\text{TTL}\text{ mm}$ (100% TTL)**.
  - Accurately detects and displays Total Tibial Length ($\text{TTL} = z_{\max} - z_{\min}$).
- Actions: "Download Aligned STL" (`aligned_[filename].stl`) and "Proceed to Corticotomy (Module 2)".

### 3. Module 2: Corticotomy & Defect Slicing Engine
- **Clinical Presets**:
  - **Preset A (Standard 25% Defect)**:
    - Defect Start: $20\%$ of TTL from proximal plateau
    - Defect Length: $25\%$ of TTL
    - Defect End: $45\%$ of TTL
    - Corticotomy Cut: $75\%$ of TTL (Distal corticotomy)
  - **Preset B (Mid-Shaft Centered 20% Defect)**:
    - Defect Start: $40\%$ of TTL (centered about $50\%$ midpoint)
    - Defect Size: $20\%$ of TTL
    - Defect End: $60\%$ of TTL
    - Corticotomy Cut: $20\%$ of TTL (Proximal corticotomy) or $80\%$ of TTL
- **Saw Kerf Width**: default $0.0\text{ mm}$ (adjustable in mm, applies offset compensation).
- **Dynamic Plane Ordering Logic**:
  - Auto-sorts planes to prevent sequence errors whether Corticotomy is proximal to Defect Start or distal to Defect End.
- **Watertight Manifold Slicing & Capping**:
  - Employs `trimesh.intersections.slice_mesh_plane(..., cap=True)` with fallback to `manifold3d` planar trimming to produce closed, 3D-printable solid meshes.

### 4. Interactive Three.js 3D Viewport
- Self-contained, offline Three.js r128 with `OrbitControls` and `STLLoader`.
- **Dynamic Cutting Planes**: Live semi-transparent red planes and 3D defect void volume + glowing cyan corticotomy plane updating in real-time as sliders are dragged.
- **Z-Axis Metric Ruler**: Displays ticks and landmark text annotations ($Z=0\text{ mm}$ Plateau, $Z=-\text{TTL}$ Distal).
- **Post-Cut Color-Coded Segments**:
  - Proximal: Emerald Green (`#10b981`)
  - Transport: Electric Blue (`#0ea5e9`)
  - Distal: Amber Gold (`#f59e0b`)
  - Defect Void: Translucent Crimson (`#ef4444`)
- **Bone Transport Distraction Slider**: Animate transport segment distraction across the defect gap.
- **Camera Presets**: AP Front, Lateral, Axial Top, and Isometric.

### 5. Exports & Packaging
- Exports individual STL segments to `outputs/cut_segments/`:
  - `proximal_[filename].stl`
  - `transport_[filename].stl`
  - `distal_[filename].stl`
- Master ZIP download containing all three segments.

---

## 🛠️ System Prerequisites & Setup

### Requirements
- Python 3.10+ (64-bit)
- Windows 10/11 (64-bit)
- Optional: MATLAB Runtime R2023a (v9.14)

### One-Click Launch
Double-click `run_app.bat`:
1. Verifies Python and creates virtual environment (`venv`).
2. Installs dependencies from `requirements.txt`.
3. Verifies MATLAB Runtime R2023a in Windows Registry (triggers silent installer if missing).
4. Launches Flask server on `http://127.0.0.1:5000` and opens default browser.

### Manual Setup
```cmd
python -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python check_matlab_runtime.py
venv\Scripts\python app.py
```

---

## 🧪 Testing

Run the full end-to-end verification suite:
```cmd
venv\Scripts\python test_suite.py
```

---

## 📁 Repository Structure
```
aafact_tool_2.0/
├── app.py                      # Flask Application Server & REST API
├── check_matlab_runtime.py     # Registry & Prerequisite Check Helper
├── check_runtime.bat           # Silent Runtime Installer Trigger
├── run_app.bat                 # One-Click Application Launcher
├── test_suite.py               # Complete Automated Test Suite
├── requirements.txt            # Python Dependencies
├── core/
│   ├── parser.py               # Filename Parser & Token Extractor
│   ├── alignment.py            # AAFACT Subprocess & PCA + Z=0 Normalizer
│   ├── slicing.py              # Corticotomy Engine & Watertight Capping
│   └── sample_generator.py     # Anatomical Test Bones Generator
├── sample_data/                # Template Tibia STLs (Ashok, Balvir)
├── static/
│   ├── css/style.css           # Dark-Themed UI Stylesheet
│   ├── js/app.js               # Frontend Controller & Slider Sync
│   ├── js/viewer3d.js          # Three.js 3D Viewport Controller
│   └── libs/                   # Three.js, STLLoader, OrbitControls
├── templates/
│   └── index.html              # Main HTML5 Interface
└── outputs/
    ├── aligned/                # Exported Aligned STLs (Z=0 at plateau)
    └── cut_segments/           # Exported Proximal, Transport, Distal STLs & ZIPs
```
