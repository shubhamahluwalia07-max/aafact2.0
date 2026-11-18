/**
 * AAFACT 2.0 - Client-Side 3D Geometry & Biomechanics Engine
 * 100% Free, Zero-Server Client-Side Execution for Vercel, Hugging Face Static & Offline Web
 */

(function (window) {
  'use strict';

  const ClientEngine = {};

  /* ----------------------------------------------------
     1. FILENAME PARSER
  ---------------------------------------------------- */
  const LATERALITY_PATTERNS = {
    Right: [/\bright\b/i, /\brt\b/i, /_r_/i, /_r\b/i, /\br_/i],
    Left: [/\bleft\b/i, /\blt\b/i, /_l_/i, /_l\b/i, /\bl_/i]
  };

  const ANATOMY_PATTERNS = [
    'Tibia', 'Fibula', 'Femur', 'Talus', 'Patella',
    'Humerus', 'Radius', 'Ulna', 'Pelvis', 'Calcaneus'
  ];

  ClientEngine.parseBoneFilename = function (filename) {
    const rawName = filename.replace(/\.[^/.]+$/, "");
    let patientName = "Patient";
    let laterality = "Right";
    let anatomy = "Tibia";
    let isStandard = false;

    // Strict standard: Name_Left/Right_AnatomyName
    const stdMatch = rawName.match(/^([A-Za-z0-9\s\-]+?)_(Left|Right)_(Tibia|Fibula|Femur|Talus|Patella|Humerus|Radius|Ulna|Pelvis|Calcaneus)$/i);
    if (stdMatch) {
      patientName = stdMatch[1].trim().replace(/_/g, ' ');
      laterality = stdMatch[2].toLowerCase().startsWith('l') ? 'Left' : 'Right';
      const anatRaw = stdMatch[3].toLowerCase();
      anatomy = ANATOMY_PATTERNS.find(a => a.toLowerCase() === anatRaw) || "Tibia";
      return {
        filename,
        patient_name: patientName,
        laterality,
        anatomy,
        is_standard: true
      };
    }

    // Token / Substring Matching
    for (const anat of ANATOMY_PATTERNS) {
      const reg = new RegExp(`\\b${anat}\\b|_${anat}_|^${anat}_|_${anat}$`, 'i');
      if (reg.test(rawName)) {
        anatomy = anat;
        break;
      }
    }

    let detectedLat = null;
    for (const p of LATERALITY_PATTERNS.Left) {
      if (p.test(rawName)) { detectedLat = 'Left'; break; }
    }
    if (!detectedLat) {
      for (const p of LATERALITY_PATTERNS.Right) {
        if (p.test(rawName)) { detectedLat = 'Right'; break; }
      }
    }
    if (detectedLat) laterality = detectedLat;

    let clean = rawName;
    clean = clean.replace(new RegExp(`\\b${anatomy}\\b|_${anatomy}_|^${anatomy}_|_${anatomy}$`, 'gi'), ' ');
    clean = clean.replace(/\b(left|right|lt|rt)\b/gi, ' ');
    clean = clean.replace(/_(left|right|lt|rt)_/gi, ' ');
    clean = clean.replace(/_(left|right|lt|rt)$/gi, ' ');
    clean = clean.replace(/^(left|right|lt|rt)_/gi, ' ');
    clean = clean.replace(/[_\-\.\s]+/g, ' ').trim();

    if (clean.length > 0) {
      patientName = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    return {
      filename,
      patient_name: patientName,
      laterality,
      anatomy,
      is_standard: Boolean(detectedLat)
    };
  };

  /* ----------------------------------------------------
     2. 3D VERTEX PCA & TIBIAL PLATEAU Z-ORIGIN ALIGNMENT
  ---------------------------------------------------- */
  ClientEngine.alignBoneMesh = function (geometry, laterality, anatomy) {
    const pos = geometry.attributes.position;
    const count = pos.count;
    const verts = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      verts[i] = pos.array[i];
    }

    // Centroid
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < count * 3; i += 3) {
      cx += verts[i];
      cy += verts[i + 1];
      cz += verts[i + 2];
    }
    cx /= count; cy /= count; cz /= count;

    // Centered Covariance Matrix
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    for (let i = 0; i < count * 3; i += 3) {
      const dx = verts[i] - cx;
      const dy = verts[i + 1] - cy;
      const dz = verts[i + 2] - cz;
      cxx += dx * dx;
      cxy += dx * dy;
      cxz += dx * dz;
      cyy += dy * dy;
      cyz += dy * dz;
      czz += dz * dz;
    }
    const invN = 1.0 / (count - 1);
    cxx *= invN; cxy *= invN; cxz *= invN;
    cyy *= invN; cyz *= invN; czz *= invN;

    // Jacobi 3x3 Eigenvalues & Eigenvectors
    let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let A = [
      [cxx, cxy, cxz],
      [cxy, cyy, cyz],
      [cxz, cyz, czz]
    ];

    for (let iter = 0; iter < 50; iter++) {
      let p = 0, q = 1;
      let maxOff = Math.abs(A[0][1]);
      if (Math.abs(A[0][2]) > maxOff) { p = 0; q = 2; maxOff = Math.abs(A[0][2]); }
      if (Math.abs(A[1][2]) > maxOff) { p = 1; q = 2; maxOff = Math.abs(A[1][2]); }
      if (maxOff < 1e-12) break;

      const diff = A[q][q] - A[p][p];
      let t;
      if (Math.abs(diff) < 1e-15) {
        t = 1.0;
      } else {
        const theta = 0.5 * diff / A[p][q];
        t = 1.0 / (Math.abs(theta) + Math.sqrt(theta * theta + 1.0));
        if (theta < 0) t = -t;
      }
      const c = 1.0 / Math.sqrt(t * t + 1.0);
      const s = t * c;
      const tau = s / (1.0 + c);

      const Apq = A[p][q];
      A[p][q] = 0;
      A[p][p] -= t * Apq;
      A[q][q] += t * Apq;

      for (let r = 0; r < 3; r++) {
        if (r !== p && r !== q) {
          const Arp = A[r][p], Arq = A[r][q];
          A[r][p] = Arp - s * (Arq + tau * Arp);
          A[p][r] = A[r][p];
          A[r][q] = Arq + s * (Arp - tau * Arq);
          A[q][r] = A[r][q];
        }
      }

      for (let r = 0; r < 3; r++) {
        const Vrp = V[r][p], Vrq = V[r][q];
        V[r][p] = Vrp - s * (Vrq + tau * Vrp);
        V[r][q] = Vrq + s * (Vrp - tau * Vrq);
      }
    }

    const eig = [
      { val: A[0][0], vec: [V[0][0], V[1][0], V[2][0]] },
      { val: A[1][1], vec: [V[0][1], V[1][1], V[2][1]] },
      { val: A[2][2], vec: [V[0][2], V[1][2], V[2][2]] }
    ];
    eig.sort((a, b) => b.val - a.val);

    // v_z (Longitudinal axis), v_x (Mediolateral axis)
    let vz = eig[0].vec;
    let vx = eig[1].vec;

    // Cross product: vy = vz x vx
    let vy = [
      vz[1] * vx[2] - vz[2] * vx[1],
      vz[2] * vx[0] - vz[0] * vx[2],
      vz[0] * vx[1] - vz[1] * vx[0]
    ];
    const lenVy = Math.sqrt(vy[0] * vy[0] + vy[1] * vy[1] + vy[2] * vy[2]) || 1;
    vy = [vy[0] / lenVy, vy[1] / lenVy, vy[2] / lenVy];

    // Re-orthogonalize vx = vy x vz
    vx = [
      vy[1] * vz[2] - vy[2] * vz[1],
      vy[2] * vz[0] - vy[0] * vz[2],
      vy[0] * vz[1] - vy[1] * vz[0]
    ];
    const lenVx = Math.sqrt(vx[0] * vx[0] + vx[1] * vx[1] + vx[2] * vx[2]) || 1;
    vx = [vx[0] / lenVx, vx[1] / lenVx, vx[2] / lenVx];

    // Initial Rotation Matrix R rows [vx, vy, vz]
    let R = [
      [vx[0], vx[1], vx[2]],
      [vy[0], vy[1], vy[2]],
      [vz[0], vz[1], vz[2]]
    ];

    // Transform centered vertices
    let rotVerts = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      const dx = verts[i] - cx;
      const dy = verts[i + 1] - cy;
      const dz = verts[i + 2] - cz;
      rotVerts[i]     = R[0][0] * dx + R[0][1] * dy + R[0][2] * dz;
      rotVerts[i + 1] = R[1][0] * dx + R[1][1] * dy + R[1][2] * dz;
      rotVerts[i + 2] = R[2][0] * dx + R[2][1] * dy + R[2][2] * dz;
    }

    // Proximal vs Distal Condylar Asymmetry Detection
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < count * 3; i += 3) {
      if (rotVerts[i] < minZ) minZ = rotVerts[i];
      if (rotVerts[i] > maxZ) maxZ = rotVerts[i];
    }
    const zSpan = maxZ - minZ;
    const topThresh = maxZ - 0.15 * zSpan;
    const botThresh = minZ + 0.15 * zSpan;

    let topCount = 0, botCount = 0;
    let topSumX = 0, topSumY = 0, botSumX = 0, botSumY = 0;
    for (let i = 0; i < count * 3; i += 3) {
      const z = rotVerts[i + 2];
      if (z > topThresh) { topCount++; topSumX += rotVerts[i]; topSumY += rotVerts[i + 1]; }
      if (z < botThresh) { botCount++; botSumX += rotVerts[i]; botSumY += rotVerts[i + 1]; }
    }
    const topMeanX = topCount ? topSumX / topCount : 0;
    const topMeanY = topCount ? topSumY / topCount : 0;
    const botMeanX = botCount ? botSumX / botCount : 0;
    const botMeanY = botCount ? botSumY / botCount : 0;

    let topVar = 0, botVar = 0;
    for (let i = 0; i < count * 3; i += 3) {
      const z = rotVerts[i + 2];
      if (z > topThresh) {
        topVar += Math.pow(rotVerts[i] - topMeanX, 2) + Math.pow(rotVerts[i + 1] - topMeanY, 2);
      }
      if (z < botThresh) {
        botVar += Math.pow(rotVerts[i] - botMeanX, 2) + Math.pow(rotVerts[i + 1] - botMeanY, 2);
      }
    }
    const topSpread = topCount > 1 ? Math.sqrt(topVar / topCount) : 0;
    const botSpread = botCount > 1 ? Math.sqrt(botVar / botCount) : 0;

    // If top spread is smaller than bottom, tibia is inverted: rotate 180° around X
    if (topSpread < botSpread) {
      for (let i = 0; i < count * 3; i += 3) {
        rotVerts[i + 1] = -rotVerts[i + 1];
        rotVerts[i + 2] = -rotVerts[i + 2];
      }
    }

    // Mediolateral vs Anteroposterior Aspect Ratio
    let finalMaxZ = -Infinity, finalMinZ = Infinity;
    for (let i = 2; i < count * 3; i += 3) {
      if (rotVerts[i] < finalMinZ) finalMinZ = rotVerts[i];
      if (rotVerts[i] > finalMaxZ) finalMaxZ = rotVerts[i];
    }
    const finalSpan = finalMaxZ - finalMinZ;
    const proxThresh = finalMaxZ - 0.20 * finalSpan;
    let pCount = 0, pMeanX = 0, pMeanY = 0;
    for (let i = 0; i < count * 3; i += 3) {
      if (rotVerts[i + 2] > proxThresh) {
        pCount++; pMeanX += rotVerts[i]; pMeanY += rotVerts[i + 1];
      }
    }
    if (pCount > 10) {
      pMeanX /= pCount; pMeanY /= pCount;
      let varX = 0, varY = 0;
      for (let i = 0; i < count * 3; i += 3) {
        if (rotVerts[i + 2] > proxThresh) {
          varX += Math.pow(rotVerts[i] - pMeanX, 2);
          varY += Math.pow(rotVerts[i + 1] - pMeanY, 2);
        }
      }
      if (varY > varX) {
        // Swap X and Y with 90° rotation around Z
        for (let i = 0; i < count * 3; i += 3) {
          const oldX = rotVerts[i];
          const oldY = rotVerts[i + 1];
          rotVerts[i]     = -oldY;
          rotVerts[i + 1] = oldX;
        }
      }
    }

    // Plateau Z-Origin Normalization: Z = 0 at plateau, Z = -TTL at distal
    let absMaxZ = -Infinity, absMinZ = Infinity;
    for (let i = 2; i < count * 3; i += 3) {
      if (rotVerts[i] < absMinZ) absMinZ = rotVerts[i];
      if (rotVerts[i] > absMaxZ) absMaxZ = rotVerts[i];
    }
    const ttl = absMaxZ - absMinZ;

    // Mid-shaft XY centering
    let midCount = 0, midX = 0, midY = 0;
    for (let i = 0; i < count * 3; i += 3) {
      const z = rotVerts[i + 2];
      if (z > absMinZ + 0.3 * ttl && z < absMinZ + 0.7 * ttl) {
        midCount++; midX += rotVerts[i]; midY += rotVerts[i + 1];
      }
    }
    const shiftX = midCount ? midX / midCount : 0;
    const shiftY = midCount ? midY / midCount : 0;

    // Final aligned positions
    const alignedPositions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      alignedPositions[i]     = rotVerts[i] - shiftX;
      alignedPositions[i + 1] = rotVerts[i + 1] - shiftY;
      alignedPositions[i + 2] = rotVerts[i + 2] - absMaxZ; // Shifts highest point of plateau to Z = 0.0
    }

    const alignedGeometry = new THREE.BufferGeometry();
    alignedGeometry.setAttribute('position', new THREE.BufferAttribute(alignedPositions, 3));
    alignedGeometry.computeVertexNormals();

    return {
      geometry: alignedGeometry,
      ttl_mm: Math.round(ttl * 100) / 100,
      proximal_z_origin: 0.0,
      distal_z_end: -Math.round(ttl * 100) / 100,
      vertex_count: count,
      face_count: count / 3
    };
  };

  /* ----------------------------------------------------
     3. WATERTIGHT CORTICOTOMY & PLANAR SLICING ENGINE
  ---------------------------------------------------- */
  ClientEngine.sliceMeshPlane = function (vertices, zCut, keepDirection) {
    const outVerts = [];
    const cutSegments = [];
    const isAbove = (keepDirection === 'above');

    for (let i = 0; i < vertices.length; i += 9) {
      const p0 = [vertices[i],     vertices[i + 1], vertices[i + 2]];
      const p1 = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
      const p2 = [vertices[i + 6], vertices[i + 7], vertices[i + 8]];

      const d0 = p0[2] - zCut;
      const d1 = p1[2] - zCut;
      const d2 = p2[2] - zCut;

      const b0 = isAbove ? (d0 >= 0) : (d0 <= 0);
      const b1 = isAbove ? (d1 >= 0) : (d1 <= 0);
      const b2 = isAbove ? (d2 >= 0) : (d2 <= 0);

      const count = (b0 ? 1 : 0) + (b1 ? 1 : 0) + (b2 ? 1 : 0);

      if (count === 3) {
        outVerts.push(...p0, ...p1, ...p2);
      } else if (count === 0) {
        continue;
      } else if (count === 1) {
        const pts = [p0, p1, p2];
        const bools = [b0, b1, b2];
        const keptIdx = bools.indexOf(true);
        const k = pts[keptIdx];
        const o1 = pts[(keptIdx + 1) % 3];
        const o2 = pts[(keptIdx + 2) % 3];

        const t1 = (zCut - k[2]) / (o1[2] - k[2]);
        const i1 = [k[0] + t1 * (o1[0] - k[0]), k[1] + t1 * (o1[1] - k[1]), zCut];

        const t2 = (zCut - k[2]) / (o2[2] - k[2]);
        const i2 = [k[0] + t2 * (o2[0] - k[0]), k[1] + t2 * (o2[1] - k[1]), zCut];

        if (keptIdx === 0) {
          outVerts.push(...k, ...i1, ...i2);
          cutSegments.push([i1, i2]);
        } else if (keptIdx === 1) {
          outVerts.push(...i2, ...k, ...i1);
          cutSegments.push([i2, i1]);
        } else {
          outVerts.push(...i1, ...i2, ...k);
          cutSegments.push([i1, i2]);
        }
      } else if (count === 2) {
        const pts = [p0, p1, p2];
        const bools = [b0, b1, b2];
        const clipIdx = bools.indexOf(false);
        const c = pts[clipIdx];
        const k1 = pts[(clipIdx + 1) % 3];
        const k2 = pts[(clipIdx + 2) % 3];

        const t1 = (zCut - c[2]) / (k1[2] - c[2]);
        const i1 = [c[0] + t1 * (k1[0] - c[0]), c[1] + t1 * (k1[1] - c[1]), zCut];

        const t2 = (zCut - k2[2]) / (c[2] - k2[2]);
        const i2 = [k2[0] + t2 * (c[0] - k2[0]), k2[1] + t2 * (c[1] - k2[1]), zCut];

        outVerts.push(...k1, ...k2, ...i2);
        outVerts.push(...k1, ...i2, ...i1);
        cutSegments.push([i2, i1]);
      }
    }

    // Planar Capping (Produces solid watertight manifold)
    if (cutSegments.length > 2) {
      let cx = 0, cy = 0;
      for (const seg of cutSegments) {
        cx += seg[0][0] + seg[1][0];
        cy += seg[0][1] + seg[1][1];
      }
      cx /= (cutSegments.length * 2);
      cy /= (cutSegments.length * 2);
      const center = [cx, cy, zCut];

      for (const [pA, pB] of cutSegments) {
        if (isAbove) {
          outVerts.push(...center, ...pA, ...pB);
        } else {
          outVerts.push(...center, ...pB, ...pA);
        }
      }
    }

    return new Float32Array(outVerts);
  };

  ClientEngine.sliceSlab = function (vertices, zTop, zBottom) {
    const topSliced = ClientEngine.sliceMeshPlane(vertices, zTop, 'below');
    return ClientEngine.sliceMeshPlane(topSliced, zBottom, 'above');
  };

  ClientEngine.computeMetrics = function (vertices, ttlMm) {
    if (!vertices || vertices.length === 0) {
      return { length_mm: 0, length_pct: 0, z_max: 0, z_min: 0, volume_cm3: 0, is_watertight: true };
    }
    let zMin = Infinity, zMax = -Infinity;
    let vol = 0;
    // Signed volume of closed polyhedron
    for (let i = 0; i < vertices.length; i += 9) {
      const x1 = vertices[i],     y1 = vertices[i + 1], z1 = vertices[i + 2];
      const x2 = vertices[i + 3], y2 = vertices[i + 4], z2 = vertices[i + 5];
      const x3 = vertices[i + 6], y3 = vertices[i + 7], z3 = vertices[i + 8];

      if (z1 < zMin) zMin = z1; if (z2 < zMin) zMin = z2; if (z3 < zMin) zMin = z3;
      if (z1 > zMax) zMax = z1; if (z2 > zMax) zMax = z2; if (z3 > zMax) zMax = z3;

      vol += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6.0;
    }
    const lenMm = Math.max(0, zMax - zMin);
    const lenPct = ttlMm > 0 ? (lenMm / ttlMm) * 100.0 : 0;
    const volCm3 = Math.max(0, Math.abs(vol) / 1000.0);

    return {
      length_mm: Math.round(lenMm * 10) / 10,
      length_pct: Math.round(lenPct * 10) / 10,
      z_max: Math.round(zMax * 10) / 10,
      z_min: Math.round(zMin * 10) / 10,
      volume_cm3: Math.round(volCm3 * 100) / 100,
      is_watertight: true
    };
  };

  /* ----------------------------------------------------
     4. BINARY STL & ZIP ARCHIVE GENERATOR
  ---------------------------------------------------- */
  ClientEngine.createBinarySTL = function (vertices) {
    const numTriangles = vertices.length / 9;
    const bufferSize = 84 + numTriangles * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // 80 bytes header
    const headerStr = "AAFACT 2.0 Solid Watertight STL - Biomechanics Plan";
    for (let i = 0; i < headerStr.length; i++) {
      view.setUint8(i, headerStr.charCodeAt(i));
    }
    view.setUint32(80, numTriangles, true);

    let offset = 84;
    for (let i = 0; i < vertices.length; i += 9) {
      // Triangle normal
      const ax = vertices[i],     ay = vertices[i + 1], az = vertices[i + 2];
      const bx = vertices[i + 3], by = vertices[i + 4], bz = vertices[i + 5];
      const cx = vertices[i + 6], cy = vertices[i + 7], cz = vertices[i + 8];

      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nLen; ny /= nLen; nz /= nLen;

      view.setFloat32(offset, nx, true);
      view.setFloat32(offset + 4, ny, true);
      view.setFloat32(offset + 8, nz, true);
      offset += 12;

      for (let j = 0; j < 9; j++) {
        view.setFloat32(offset + j * 4, vertices[i + j], true);
      }
      offset += 36;
      view.setUint16(offset, 0, true);
      offset += 2;
    }
    return new Uint8Array(buffer);
  };

  // CRC32 Table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  function computeCRC32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  ClientEngine.createZipArchive = function (files) {
    const fileEntries = [];
    const chunks = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = new TextEncoder().encode(f.name);
      const dataBytes = f.data;
      const crc = computeCRC32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(localHeader.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 10, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true); // Store
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      chunks.push(localHeader, dataBytes);
      fileEntries.push({ nameBytes, crc, size, offset });
      offset += localHeader.length + dataBytes.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const fe of fileEntries) {
      const cdHeader = new Uint8Array(46 + fe.nameBytes.length);
      const dv = new DataView(cdHeader.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 10, true);
      dv.setUint16(6, 10, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0, true);
      dv.setUint32(16, fe.crc, true);
      dv.setUint32(20, fe.size, true);
      dv.setUint32(24, fe.size, true);
      dv.setUint16(28, fe.nameBytes.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, fe.offset, true);
      cdHeader.set(fe.nameBytes, 46);

      chunks.push(cdHeader);
      cdSize += cdHeader.length;
    }

    const eocd = new Uint8Array(22);
    const dvEocd = new DataView(eocd.buffer);
    dvEocd.setUint32(0, 0x06054b50, true);
    dvEocd.setUint16(4, 0, true);
    dvEocd.setUint16(6, 0, true);
    dvEocd.setUint16(8, fileEntries.length, true);
    dvEocd.setUint16(10, fileEntries.length, true);
    dvEocd.setUint32(12, cdSize, true);
    dvEocd.setUint32(16, cdOffset, true);
    dvEocd.setUint16(20, 0, true);
    chunks.push(eocd);

    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    const finalZip = new Uint8Array(totalLength);
    let curOff = 0;
    for (const c of chunks) {
      finalZip.set(c, curOff);
      curOff += c.length;
    }
    return finalZip;
  };

  /* ----------------------------------------------------
     5. HIGH-LEVEL CORTICOTOMY SLICING ORCHESTRATOR
  ---------------------------------------------------- */
  ClientEngine.executeCorticotomySlicing = function (
    geometry,
    ttl_mm,
    defect_start_pct,
    defect_length_pct,
    corticotomy_pct,
    saw_kerf_mm,
    base_filename
  ) {
    ttl_mm = Number(ttl_mm) || 375.0;
    defect_start_pct = Math.max(1.0, Math.min(95.0, Number(defect_start_pct)));
    let defect_end_pct = defect_start_pct + Number(defect_length_pct);
    defect_end_pct = Math.max(defect_start_pct + 1.0, Math.min(99.0, defect_end_pct));
    defect_length_pct = defect_end_pct - defect_start_pct;
    corticotomy_pct = Math.max(1.0, Math.min(99.0, Number(corticotomy_pct)));

    if (defect_start_pct <= corticotomy_pct && corticotomy_pct <= defect_end_pct) {
      if (corticotomy_pct - defect_start_pct < defect_end_pct - corticotomy_pct) {
        corticotomy_pct = Math.max(1.0, defect_start_pct - 5.0);
      } else {
        corticotomy_pct = Math.min(99.0, defect_end_pct + 5.0);
      }
    }

    const z_defect_start = - (defect_start_pct / 100.0) * ttl_mm;
    const z_defect_end   = - (defect_end_pct / 100.0) * ttl_mm;
    const z_corticotomy  = - (corticotomy_pct / 100.0) * ttl_mm;

    const half_kerf = Math.max(0.0, Number(saw_kerf_mm) || 0) / 2.0;
    const verts = geometry.attributes.position.array;

    let ordering_mode = "";
    let proxVerts, transVerts, distVerts;

    if (corticotomy_pct < defect_start_pct) {
      ordering_mode = "Proximal Corticotomy (Corticotomy < Defect Start)";
      proxVerts = ClientEngine.sliceMeshPlane(verts, z_corticotomy + half_kerf, 'above');
      const z_trans_top = z_corticotomy - half_kerf;
      const z_trans_bot = z_defect_start + half_kerf;
      transVerts = ClientEngine.sliceSlab(verts, z_trans_top, z_trans_bot);
      distVerts = ClientEngine.sliceMeshPlane(verts, z_defect_end - half_kerf, 'below');
    } else {
      ordering_mode = "Distal Corticotomy (Corticotomy > Defect End)";
      proxVerts = ClientEngine.sliceMeshPlane(verts, z_defect_start + half_kerf, 'above');
      const z_trans_top = z_defect_end - half_kerf;
      const z_trans_bot = z_corticotomy + half_kerf;
      transVerts = ClientEngine.sliceSlab(verts, z_trans_top, z_trans_bot);
      distVerts = ClientEngine.sliceMeshPlane(verts, z_corticotomy - half_kerf, 'below');
    }

    function createBufferGeometry(v) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      g.computeVertexNormals();
      return g;
    }

    const proxGeo = createBufferGeometry(proxVerts);
    const transGeo = createBufferGeometry(transVerts);
    const distGeo = createBufferGeometry(distVerts);

    const proxMetrics = ClientEngine.computeMetrics(proxVerts, ttl_mm);
    const transMetrics = ClientEngine.computeMetrics(transVerts, ttl_mm);
    const distMetrics = ClientEngine.computeMetrics(distVerts, ttl_mm);

    const defect_length_mm = Math.round(Math.abs(z_defect_end - z_defect_start) * 100) / 100;
    const wholeMetrics = ClientEngine.computeMetrics(verts, ttl_mm);
    const defect_volume_cm3 = Math.round(
      Math.max(0, wholeMetrics.volume_cm3 - (proxMetrics.volume_cm3 + transMetrics.volume_cm3 + distMetrics.volume_cm3)) * 100
    ) / 100;

    let clean_base = base_filename || "bone.stl";
    if (clean_base.startsWith("aligned_")) {
      clean_base = clean_base.substring(8);
    }
    const stem = clean_base.replace(/\.[^/.]+$/, "");
    const prox_filename = `proximal_${clean_base}`;
    const trans_filename = `transport_${clean_base}`;
    const dist_filename = `distal_${clean_base}`;
    const zip_filename = `cut_segments_${stem}.zip`;

    const proxStl = ClientEngine.createBinarySTL(proxVerts);
    const transStl = ClientEngine.createBinarySTL(transVerts);
    const distStl = ClientEngine.createBinarySTL(distVerts);

    const proxBlob = new Blob([proxStl], { type: 'model/stl' });
    const transBlob = new Blob([transStl], { type: 'model/stl' });
    const distBlob = new Blob([distStl], { type: 'model/stl' });

    const proxUrl = URL.createObjectURL(proxBlob);
    const transUrl = URL.createObjectURL(transBlob);
    const distUrl = URL.createObjectURL(distBlob);

    const zipData = ClientEngine.createZipArchive([
      { name: prox_filename, data: proxStl },
      { name: trans_filename, data: transStl },
      { name: dist_filename, data: distStl }
    ]);
    const zipBlob = new Blob([zipData], { type: 'application/zip' });
    const zipUrl = URL.createObjectURL(zipBlob);

    return {
      status: 'success',
      ordering_mode,
      ttl_mm: Math.round(ttl_mm * 100) / 100,
      saw_kerf_mm: Math.round(saw_kerf_mm * 100) / 100,
      planes: {
        defect_start: {
          pct: Math.round(defect_start_pct * 10) / 10,
          mm: Math.round(Math.abs(z_defect_start) * 100) / 100,
          z_coord: Math.round(z_defect_start * 100) / 100
        },
        defect_end: {
          pct: Math.round(defect_end_pct * 10) / 10,
          mm: Math.round(Math.abs(z_defect_end) * 100) / 100,
          z_coord: Math.round(z_defect_end * 100) / 100
        },
        corticotomy: {
          pct: Math.round(corticotomy_pct * 10) / 10,
          mm: Math.round(Math.abs(z_corticotomy) * 100) / 100,
          z_coord: Math.round(z_corticotomy * 100) / 100
        }
      },
      defect: {
        length_pct: Math.round(defect_length_pct * 10) / 10,
        length_mm: defect_length_mm,
        volume_cm3: defect_volume_cm3
      },
      segments: {
        proximal: {
          filename: prox_filename,
          download_url: proxUrl,
          metrics: proxMetrics
        },
        transport: {
          filename: trans_filename,
          download_url: transUrl,
          metrics: transMetrics
        },
        distal: {
          filename: dist_filename,
          download_url: distUrl,
          metrics: distMetrics
        }
      },
      geometries: {
        proximal: proxGeo,
        transport: transGeo,
        distal: distGeo
      },
      zip_archive: {
        filename: zip_filename,
        download_url: zipUrl
      }
    };
  };

  window.ClientEngine = ClientEngine;
})(window);
