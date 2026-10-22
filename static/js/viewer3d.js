/**
 * AAFACT 2.0 - Interactive Three.js 3D Viewport Controller
 * Lead Python & 3D Geometry Engineer
 */

class BoneViewer3D {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.stlLoader = null;

    // Groups
    this.boneGroup = new THREE.Group();
    this.planesGroup = new THREE.Group();
    this.rulerGroup = new THREE.Group();
    this.segmentsGroup = new THREE.Group();

    // Current State
    this.ttl = 375.0; // mm
    this.currentMesh = null;
    this.segments = {
      proximal: null,
      transport: null,
      distal: null
    };

    // Layer Visibilities
    this.visibleLayers = {
      bone: true,
      planes: true,
      ruler: true,
      segments: false,
      wireframe: false
    };

    this.transportDisplacement = 0.0; // for distraction osteogenesis animation

    this.initScene();
    this.initLights();
    this.initControls();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a11);

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    this.camera.position.set(220, 260, 180);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.stlLoader = new THREE.STLLoader();

    // Add groups to scene
    this.scene.add(this.boneGroup);
    this.scene.add(this.planesGroup);
    this.scene.add(this.rulerGroup);
    this.scene.add(this.segmentsGroup);

    // Subtle Ground Grid
    const grid = new THREE.GridHelper(500, 25, 0x1e293b, 0x0f172a);
    grid.position.y = -200;
    this.scene.add(grid);
  }

  initLights() {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambientLight);

    // Key Light (Anterior-Superior)
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(150, 300, 200);
    this.scene.add(keyLight);

    // Fill Light (Lateral)
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-200, 100, -100);
    this.scene.add(fillLight);

    // Rim/Back Light (for silhouette edge clarity)
    const rimLight = new THREE.DirectionalLight(0x06b6d4, 0.5);
    rimLight.position.set(0, -250, -250);
    this.scene.add(rimLight);
  }

  initControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 1500;
    this.controls.target.set(0, 0, -180);
  }

  onWindowResize() {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(this.animate);
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ----------------------------------------------------
     LOAD SINGLE BONE MESH (Raw or Aligned)
  ---------------------------------------------------- */
  loadBoneMesh(meshUrl, onLoadedCallback) {
    // Clear previous
    this.clearMeshGroup(this.boneGroup);
    this.clearMeshGroup(this.segmentsGroup);
    this.segmentsGroup.visible = false;
    this.boneGroup.visible = true;

    this.stlLoader.load(
      meshUrl,
      (geometry) => {
        geometry.computeVertexNormals();

        // Anatomical bone material
        const material = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          roughness: 0.35,
          metalness: 0.1,
          wireframe: this.visibleLayers.wireframe,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.currentMesh = mesh;
        this.boneGroup.add(mesh);

        // Calculate bounding box and center camera
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const zMin = bbox.min.z;
        const zMax = bbox.max.z;
        const calculatedTtl = Math.abs(zMax - zMin);

        // Center orbit target around mid-shaft
        const midZ = (zMax + zMin) / 2.0;
        this.controls.target.set(0, 0, midZ);
        this.camera.position.set(160, 220, midZ + 60);

        if (onLoadedCallback) {
          onLoadedCallback({
            zMin,
            zMax,
            ttl: calculatedTtl,
            bbox
          });
        }
      },
      undefined,
      (error) => {
        console.error("Error loading STL:", error);
      }
    );
  }

  /* ----------------------------------------------------
     LOAD 3 CUT SEGMENTS (Proximal, Transport, Distal)
  ---------------------------------------------------- */
  loadSegmentedMeshes(urls, onLoadedCallback) {
    this.clearMeshGroup(this.segmentsGroup);
    this.boneGroup.visible = false;
    this.segmentsGroup.visible = true;
    this.visibleLayers.segments = true;

    const materials = {
      proximal: new THREE.MeshStandardMaterial({
        color: 0x10b981, // Emerald Green
        roughness: 0.3,
        metalness: 0.1,
        wireframe: this.visibleLayers.wireframe,
        side: THREE.DoubleSide
      }),
      transport: new THREE.MeshStandardMaterial({
        color: 0x0ea5e9, // Electric Blue
        roughness: 0.3,
        metalness: 0.1,
        wireframe: this.visibleLayers.wireframe,
        side: THREE.DoubleSide
      }),
      distal: new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // Amber Gold
        roughness: 0.3,
        metalness: 0.1,
        wireframe: this.visibleLayers.wireframe,
        side: THREE.DoubleSide
      })
    };

    let loadedCount = 0;
    const keys = ['proximal', 'transport', 'distal'];

    keys.forEach((key) => {
      this.stlLoader.load(urls[key], (geometry) => {
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, materials[key]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.segments[key] = mesh;
        this.segmentsGroup.add(mesh);

        loadedCount++;
        if (loadedCount === keys.length && onLoadedCallback) {
          onLoadedCallback();
        }
      });
    });
  }

  /* ----------------------------------------------------
     INTERACTIVE CUTTING PLANES & DEFECT VOID
  ---------------------------------------------------- */
  updateCuttingPlanes(ttl, defectStartPct, defectLengthPct, corticotomyPct) {
    this.ttl = ttl || this.ttl;
    this.clearMeshGroup(this.planesGroup);

    if (!this.visibleLayers.planes) return;

    const defectEndPct = Math.min(100.0, defectStartPct + defectLengthPct);

    // Z Coordinates (Proximal plateau at Z = 0, Distal joint at Z = -TTL)
    const zDefectStart = - (defectStartPct / 100.0) * this.ttl;
    const zDefectEnd = - (defectEndPct / 100.0) * this.ttl;
    const zCorticotomy = - (corticotomyPct / 100.0) * this.ttl;

    const planeSize = 90;

    // Helper: Create a glowing planar disc/square
    const createPlane = (zPos, colorHex, opacity = 0.45) => {
      const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);
      const planeMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.position.set(0, 0, zPos);

      // Glowing Wireframe border
      const edgeGeo = new THREE.EdgesGeometry(planeGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2 });
      const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
      planeMesh.add(edgeLine);

      return planeMesh;
    };

    // 1. Defect Start Plane (Crimson Red)
    const pStart = createPlane(zDefectStart, 0xef4444, 0.4);
    this.planesGroup.add(pStart);

    // 2. Defect End Plane (Crimson Red)
    const pEnd = createPlane(zDefectEnd, 0xef4444, 0.4);
    this.planesGroup.add(pEnd);

    // 3. Defect Void Box/Slab (Semi-transparent red highlighting resected block)
    const voidHeight = Math.abs(zDefectStart - zDefectEnd);
    if (voidHeight > 0.5) {
      const voidGeo = new THREE.BoxGeometry(planeSize * 0.95, planeSize * 0.95, voidHeight);
      const voidMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const voidBox = new THREE.Mesh(voidGeo, voidMat);
      voidBox.position.set(0, 0, (zDefectStart + zDefectEnd) / 2.0);
      this.planesGroup.add(voidBox);
    }

    // 4. Corticotomy Plane (Cyan)
    const pCort = createPlane(zCorticotomy, 0x06b6d4, 0.55);
    this.planesGroup.add(pCort);
  }

  /* ----------------------------------------------------
     Z-AXIS ANATOMICAL RULER & METRIC TICKS
  ---------------------------------------------------- */
  updateRuler(ttl) {
    this.ttl = ttl || this.ttl;
    this.clearMeshGroup(this.rulerGroup);

    if (!this.visibleLayers.ruler) return;

    const rulerX = -55; // Offset to the medial/lateral side
    const rulerY = 0;

    // Main vertical axis line: from Z = 0 down to Z = -TTL
    const points = [
      new THREE.Vector3(rulerX, rulerY, 5),
      new THREE.Vector3(rulerX, rulerY, -this.ttl - 5)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    const mainLine = new THREE.Line(lineGeo, lineMat);
    this.rulerGroup.add(mainLine);

    // Major Ticks (Every 10% TTL)
    for (let pct = 0; pct <= 100; pct += 10) {
      const z = - (pct / 100.0) * this.ttl;
      const tickLength = (pct === 0 || pct === 50 || pct === 100) ? 14 : 8;

      const tickPoints = [
        new THREE.Vector3(rulerX, rulerY, z),
        new THREE.Vector3(rulerX - tickLength, rulerY, z)
      ];
      const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
      const tickMat = new THREE.LineBasicMaterial({
        color: (pct === 0 || pct === 100) ? 0x10b981 : 0x64748b
      });
      this.rulerGroup.add(new THREE.Line(tickGeo, tickMat));

      // Text Sprites for Landmarks
      if (pct === 0) {
        this.addTextSprite(rulerX - 20, rulerY, z, "0% (Plateau: Z=0.0mm)", "#34d399");
      } else if (pct === 100) {
        this.addTextSprite(rulerX - 20, rulerY, z, `100% (Distal: -${Math.round(this.ttl)}mm)`, "#f59e0b");
      } else if (pct % 20 === 0) {
        this.addTextSprite(rulerX - 16, rulerY, z, `${pct}% (-${Math.round((pct/100)*this.ttl)}mm)`, "#94a3b8");
      }
    }
  }

  addTextSprite(x, y, z, text, colorHex = "#ffffff") {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = colorHex;
    ctx.fillText(text, 10, 38);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x - 25, y, z);
    sprite.scale.set(38, 9.5, 1);
    this.rulerGroup.add(sprite);
  }

  /* ----------------------------------------------------
     BONE TRANSPORT DISTRACTION SLIDER (EXPLODED VIEW)
  ---------------------------------------------------- */
  setTransportDisplacement(offsetMm) {
    this.transportDisplacement = offsetMm;
    if (this.segments.transport) {
      this.segments.transport.position.z = offsetMm;
    }
  }

  /* ----------------------------------------------------
     CAMERA VIEW PRESETS
  ---------------------------------------------------- */
  setView(preset) {
    const targetZ = -this.ttl / 2.0;
    const dist = 320;
    this.controls.target.set(0, 0, targetZ);

    switch (preset) {
      case 'anterior': // Front (AP view)
        this.camera.position.set(0, dist, targetZ);
        this.camera.up.set(0, 0, 1);
        break;
      case 'lateral': // Side view
        this.camera.position.set(dist, 0, targetZ);
        this.camera.up.set(0, 0, 1);
        break;
      case 'proximal': // Top-down view looking down Z-axis
        this.camera.position.set(0, 0, 150);
        this.camera.up.set(0, 1, 0);
        break;
      case 'iso':
      default:
        this.camera.position.set(180, 240, targetZ + 80);
        this.camera.up.set(0, 0, 1);
        break;
    }
    this.camera.lookAt(0, 0, targetZ);
    this.controls.update();
  }

  /* ----------------------------------------------------
     LAYER VISIBILITY TOGGLES
  ---------------------------------------------------- */
  toggleLayer(layerKey, isVisible) {
    this.visibleLayers[layerKey] = isVisible;
    if (layerKey === 'bone') this.boneGroup.visible = isVisible;
    if (layerKey === 'planes') this.planesGroup.visible = isVisible;
    if (layerKey === 'ruler') this.rulerGroup.visible = isVisible;
    if (layerKey === 'segments') this.segmentsGroup.visible = isVisible;
    if (layerKey === 'wireframe') {
      const setWf = (obj) => {
        if (obj && obj.material) obj.material.wireframe = isVisible;
        if (obj && obj.children) obj.children.forEach(setWf);
      };
      setWf(this.boneGroup);
      setWf(this.segmentsGroup);
    }
  }

  toggleSegment(segKey, isVisible) {
    if (this.segments[segKey]) {
      this.segments[segKey].visible = isVisible;
    }
  }

  clearMeshGroup(group) {
    while (group.children.length > 0) {
      const obj = group.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
      group.remove(obj);
    }
  }
}

window.BoneViewer3D = BoneViewer3D;
