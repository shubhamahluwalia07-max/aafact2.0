"""
AAFACT 2.0 - Corticotomy & Defect Slicing Engine
Module 2: Dynamic Plane Ordering, Kerf Compensation, Watertight Capping & STL Export.
"""
import os
import zipfile
import numpy as np
import trimesh
import manifold3d as m3d


def slice_halfspace_trimesh(mesh: trimesh.Trimesh, z_cut: float, keep_direction: str = 'above') -> trimesh.Trimesh:
    """
    Slices mesh at Z = z_cut using trimesh.intersections.slice_mesh_plane(cap=True).
    keep_direction: 'above' (keep Z >= z_cut) or 'below' (keep Z <= z_cut).
    """
    normal = [0.0, 0.0, 1.0] if keep_direction == 'above' else [0.0, 0.0, -1.0]
    origin = [0.0, 0.0, float(z_cut)]
    try:
        sliced = trimesh.intersections.slice_mesh_plane(mesh, plane_normal=normal, plane_origin=origin, cap=True)
        if isinstance(sliced, trimesh.Trimesh) and len(sliced.faces) > 0:
            return sliced
    except Exception as e:
        print(f"[Trimesh Slice Warning] slice_mesh_plane failed: {e}")
    return None


def slice_halfspace_manifold3d(mesh: trimesh.Trimesh, z_cut: float, keep_direction: str = 'above') -> trimesh.Trimesh:
    """
    Fallback watertight planar slice using manifold3d.
    keep_direction: 'above' (keep Z >= z_cut) or 'below' (keep Z <= z_cut).
    """
    try:
        m_in = m3d.Mesh(
            vert_properties=mesh.vertices.astype(np.float32),
            tri_verts=mesh.faces.astype(np.uint32)
        )
        man = m3d.Manifold(m_in)
        if keep_direction == 'above':
            # keep Z >= z_cut <=> dot([0,0,-1], p) <= -z_cut
            trimmed = man.trim_by_plane((0.0, 0.0, -1.0), -float(z_cut))
        else:
            # keep Z <= z_cut <=> dot([0,0,1], p) <= z_cut
            trimmed = man.trim_by_plane((0.0, 0.0, 1.0), float(z_cut))
        
        m_out = trimmed.to_mesh()
        if len(m_out.tri_verts) > 0:
            tri_mesh = trimesh.Trimesh(
                vertices=np.asarray(m_out.vert_properties)[:, :3],
                faces=np.asarray(m_out.tri_verts),
                process=True
            )
            return tri_mesh
    except Exception as e:
        print(f"[Manifold3D Slice Warning] trim_by_plane failed: {e}")
    return None


def slice_halfspace_robust(mesh: trimesh.Trimesh, z_cut: float, keep_direction: str = 'above') -> trimesh.Trimesh:
    """
    Executes watertight planar slice with trimesh and manifold3d fallback.
    """
    res = slice_halfspace_trimesh(mesh, z_cut, keep_direction)
    if res is not None and res.is_watertight and len(res.faces) > 0:
        return res
    
    # Fallback to manifold3d
    m_res = slice_halfspace_manifold3d(mesh, z_cut, keep_direction)
    if m_res is not None and len(m_res.faces) > 0:
        return m_res
        
    # If manifold3d failed but trimesh had faces
    if res is not None and len(res.faces) > 0:
        return res
        
    return mesh.copy()


def slice_slab_robust(mesh: trimesh.Trimesh, z_top: float, z_bottom: float) -> trimesh.Trimesh:
    """
    Extracts slab between Z = z_top and Z = z_bottom (where z_top > z_bottom).
    Keeps z_bottom <= Z <= z_top.
    """
    # 1. Keep Z <= z_top
    top_sliced = slice_halfspace_robust(mesh, z_top, keep_direction='below')
    # 2. Keep Z >= z_bottom
    slab = slice_halfspace_robust(top_sliced, z_bottom, keep_direction='above')
    return slab


def compute_segment_metrics(mesh: trimesh.Trimesh, ttl_mm: float) -> dict:
    """
    Calculates physical and geometric properties of an isolated segment.
    """
    if mesh is None or len(mesh.faces) == 0:
        return {
            'length_mm': 0.0,
            'length_pct': 0.0,
            'z_max': 0.0,
            'z_min': 0.0,
            'volume_cm3': 0.0,
            'is_watertight': False,
            'vertex_count': 0,
            'face_count': 0
        }
    z_max = float(np.max(mesh.vertices[:, 2]))
    z_min = float(np.min(mesh.vertices[:, 2]))
    length_mm = max(0.0, z_max - z_min)
    length_pct = (length_mm / ttl_mm) * 100.0 if ttl_mm > 0 else 0.0
    
    vol = 0.0
    try:
        if mesh.is_watertight:
            vol = float(mesh.volume / 1000.0)
        else:
            # Approximate volume
            vol = float(abs(mesh.convex_hull.volume) / 1000.0) * 0.65
    except Exception:
        vol = 0.0

    return {
        'length_mm': round(length_mm, 2),
        'length_pct': round(length_pct, 1),
        'z_max': round(z_max, 2),
        'z_min': round(z_min, 2),
        'volume_cm3': round(max(0.0, vol), 2),
        'is_watertight': bool(mesh.is_watertight),
        'vertex_count': len(mesh.vertices),
        'face_count': len(mesh.faces)
    }


def execute_corticotomy_slicing(
    aligned_stl_path: str,
    output_dir: str,
    ttl_mm: float,
    defect_start_pct: float,
    defect_length_pct: float,
    corticotomy_pct: float,
    saw_kerf_mm: float = 0.0
) -> dict:
    """
    Module 2 Corticotomy & Defect Slicing Engine.
    
    Coordinates:
    - Proximal Tibial Plateau: Z = 0.0 mm (0% TTL)
    - Distal Joint Line: Z = -TTL mm (100% TTL)
    
    Dynamic Plane Ordering Logic:
    - If Corticotomy < Defect Start:
      * Proximal: 0% to Corticotomy
      * Transport: Corticotomy to Defect Start
      * Void (Defect - Deleted): Defect Start to Defect End
      * Distal: Defect End to 100%
    - If Corticotomy > Defect End:
      * Proximal: 0% to Defect Start
      * Void (Defect - Deleted): Defect Start to Defect End
      * Transport: Defect End to Corticotomy
      * Distal: Corticotomy to 100%
    
    Exports:
    - proximal_[filename].stl
    - transport_[filename].stl
    - distal_[filename].stl
    - ZIP archive containing all 3 segments
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # Load aligned mesh
    # CRITICAL: Rely on trimesh.load(..., force='mesh', process=True) and NEVER call remove_duplicate_faces()
    mesh = trimesh.load(aligned_stl_path, force='mesh', process=True)
    
    # Base filename cleanup
    raw_name = os.path.basename(aligned_stl_path)
    clean_base = raw_name
    if clean_base.startswith("aligned_"):
        clean_base = clean_base[len("aligned_"):]
    stem, _ = os.path.splitext(clean_base)

    # Convert percentages to Z coordinates
    # Distance from proximal joint line d = (pct / 100) * TTL
    # Z coordinate = -d
    defect_end_pct = defect_start_pct + defect_length_pct
    
    # Boundary checks and sanitization
    defect_start_pct = max(1.0, min(95.0, float(defect_start_pct)))
    defect_end_pct = max(defect_start_pct + 1.0, min(99.0, float(defect_end_pct)))
    defect_length_pct = defect_end_pct - defect_start_pct
    corticotomy_pct = max(1.0, min(99.0, float(corticotomy_pct)))
    
    # Disallow corticotomy inside defect zone
    if defect_start_pct <= corticotomy_pct <= defect_end_pct:
        # Move corticotomy slightly outside to avoid degenerate slice
        if corticotomy_pct - defect_start_pct < defect_end_pct - corticotomy_pct:
            corticotomy_pct = max(1.0, defect_start_pct - 5.0)
        else:
            corticotomy_pct = min(99.0, defect_end_pct + 5.0)

    # Physical Z coordinates (all <= 0.0)
    z_defect_start = - (defect_start_pct / 100.0) * ttl_mm
    z_defect_end   = - (defect_end_pct / 100.0) * ttl_mm
    z_corticotomy  = - (corticotomy_pct / 100.0) * ttl_mm

    # Kerf offset
    half_kerf = max(0.0, float(saw_kerf_mm)) / 2.0

    ordering_mode = ""
    proximal_mesh = None
    transport_mesh = None
    distal_mesh = None

    if corticotomy_pct < defect_start_pct:
        # Proximal Corticotomy configuration
        ordering_mode = "Proximal Corticotomy (Corticotomy < Defect Start)"
        # 1. Proximal segment: from 0.0 down to z_corticotomy (+ half_kerf)
        proximal_mesh = slice_halfspace_robust(mesh, z_corticotomy + half_kerf, keep_direction='above')
        
        # 2. Transport segment: from z_corticotomy (- half_kerf) down to z_defect_start (+ half_kerf)
        z_trans_top = z_corticotomy - half_kerf
        z_trans_bot = z_defect_start + half_kerf
        transport_mesh = slice_slab_robust(mesh, z_trans_top, z_trans_bot)
        
        # 3. Defect zone: from z_defect_start down to z_defect_end (Void - deleted)
        
        # 4. Distal segment: from z_defect_end (- half_kerf) down to -TTL
        distal_mesh = slice_halfspace_robust(mesh, z_defect_end - half_kerf, keep_direction='below')

    else:
        # Distal Corticotomy configuration
        ordering_mode = "Distal Corticotomy (Corticotomy > Defect End)"
        # 1. Proximal segment: from 0.0 down to z_defect_start (+ half_kerf)
        proximal_mesh = slice_halfspace_robust(mesh, z_defect_start + half_kerf, keep_direction='above')
        
        # 2. Defect zone: from z_defect_start down to z_defect_end (Void - deleted)
        
        # 3. Transport segment: from z_defect_end (- half_kerf) down to z_corticotomy (+ half_kerf)
        z_trans_top = z_defect_end - half_kerf
        z_trans_bot = z_corticotomy + half_kerf
        transport_mesh = slice_slab_robust(mesh, z_trans_top, z_trans_bot)
        
        # 4. Distal segment: from z_corticotomy (- half_kerf) down to -TTL
        distal_mesh = slice_halfspace_robust(mesh, z_corticotomy - half_kerf, keep_direction='below')

    # Target filenames as required
    prox_filename = f"proximal_{clean_base}"
    trans_filename = f"transport_{clean_base}"
    dist_filename = f"distal_{clean_base}"

    prox_path = os.path.join(output_dir, prox_filename)
    trans_path = os.path.join(output_dir, trans_filename)
    dist_path = os.path.join(output_dir, dist_filename)

    proximal_mesh.export(prox_path)
    transport_mesh.export(trans_path)
    distal_mesh.export(dist_path)

    # Create ZIP archive
    zip_filename = f"cut_segments_{stem}.zip"
    zip_path = os.path.join(output_dir, zip_filename)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(prox_path, arcname=prox_filename)
        zipf.write(trans_path, arcname=trans_filename)
        zipf.write(dist_path, arcname=dist_filename)

    # Metrics
    prox_metrics = compute_segment_metrics(proximal_mesh, ttl_mm)
    trans_metrics = compute_segment_metrics(transport_mesh, ttl_mm)
    dist_metrics = compute_segment_metrics(distal_mesh, ttl_mm)

    defect_length_mm = round(abs(z_defect_end - z_defect_start), 2)
    defect_volume_cm3 = round(
        max(0.0, (mesh.volume / 1000.0) - (prox_metrics['volume_cm3'] + trans_metrics['volume_cm3'] + dist_metrics['volume_cm3'])),
        2
    ) if mesh.is_watertight else round(defect_length_mm * 1.5, 2)

    return {
        'status': 'success',
        'ordering_mode': ordering_mode,
        'ttl_mm': round(ttl_mm, 2),
        'saw_kerf_mm': round(saw_kerf_mm, 2),
        'planes': {
            'defect_start': {
                'pct': round(defect_start_pct, 1),
                'mm': round(abs(z_defect_start), 2),
                'z_coord': round(z_defect_start, 2)
            },
            'defect_end': {
                'pct': round(defect_end_pct, 1),
                'mm': round(abs(z_defect_end), 2),
                'z_coord': round(z_defect_end, 2)
            },
            'corticotomy': {
                'pct': round(corticotomy_pct, 1),
                'mm': round(abs(z_corticotomy), 2),
                'z_coord': round(z_corticotomy, 2)
            }
        },
        'defect': {
            'length_pct': round(defect_length_pct, 1),
            'length_mm': defect_length_mm,
            'volume_cm3': defect_volume_cm3
        },
        'segments': {
            'proximal': {
                'filename': prox_filename,
                'download_url': f"/api/download/cut_segments/{prox_filename}",
                'metrics': prox_metrics
            },
            'transport': {
                'filename': trans_filename,
                'download_url': f"/api/download/cut_segments/{trans_filename}",
                'metrics': trans_metrics
            },
            'distal': {
                'filename': dist_filename,
                'download_url': f"/api/download/cut_segments/{dist_filename}",
                'metrics': dist_metrics
            }
        },
        'zip_archive': {
            'filename': zip_filename,
            'download_url': f"/api/download/cut_segments/{zip_filename}"
        }
    }
